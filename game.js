const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const helpsEl = document.getElementById("helps");
const timeEl = document.getElementById("time");

const overlay = document.getElementById("overlay");
const titleEl = document.getElementById("title");
const textEl = document.getElementById("text");
const playBtn = document.getElementById("playBtn");
const howBtn = document.getElementById("howBtn");

const W = canvas.width;
const H = canvas.height;

let running = false;
let paused = false;

let score = 0;
let helps = 0;
let timeLeft = 60;

const groundY = Math.floor(H * 0.78);

const keys = { space: false, down: false };

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }

const player = {
  x: Math.floor(W * 0.18),
  y: groundY,
  w: 44,
  h: 64,
  vy: 0,
  onGround: true,
  sliding: false,
  slideT: 0,
  invulnT: 0,

  jump() {
    if (!this.onGround) return;
    this.vy = -14.5;
    this.onGround = false;
  },

  slide(on) {
    if (!this.onGround) return;
    this.sliding = on;
    if (on) this.slideT = 0.25; // seconds
  },

  update(dt) {
    if (this.invulnT > 0) this.invulnT -= dt;

    // slide timer
    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0) this.sliding = false;
    }

    // gravity
    if (!this.onGround) {
      this.vy += 32 * dt;
      this.y += this.vy;
      if (this.y >= groundY) {
        this.y = groundY;
        this.vy = 0;
        this.onGround = true;
      }
    }
  },

  rect() {
    // shrink hitbox a bit
    let h = this.sliding ? 38 : this.h;
    let y = this.sliding ? (this.y - h + 10) : (this.y - h + 4);
    return { x: this.x + 8, y, w: this.w - 16, h: h - 10 };
  },

  draw() {
    // body
    ctx.save();
    ctx.translate(this.x, this.y);

    // shadow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(22, 10, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // player
    ctx.fillStyle = this.invulnT > 0 ? "#555" : "#111";
    if (this.sliding) {
      ctx.fillRect(0, -34, 44, 34);
    } else {
      ctx.fillRect(0, -64, 44, 64);
    }

    // face
    ctx.fillStyle = "#fff";
    ctx.fillRect(28, this.sliding ? -28 : -52, 8, 8);

    ctx.restore();
  }
};

const obstacles = [];
const popups = [];

let spawnT = 0;
let speed = 380; // px/sec, increases slowly

function resetGame() {
  score = 0;
  helps = 1; // start with one help to feel fair
  timeLeft = 60;
  speed = 380;
  obstacles.length = 0;
  popups.length = 0;
  spawnT = 0;
  paused = false;
  player.y = groundY;
  player.vy = 0;
  player.onGround = true;
  player.sliding = false;
  player.invulnT = 0;
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = String(score);
  helpsEl.textContent = String(helps);
  timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
}

function showOverlay(title, text, showPlay = true) {
  titleEl.textContent = title;
  textEl.textContent = text;
  playBtn.textContent = showPlay ? "Play" : "Play again";
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function addObstacle(type) {
  // All obstacles move left at current speed
  const base = {
    type,
    x: W + 40,
    y: groundY,
    w: 52,
    h: 52,
    passed: false
  };

  if (type === "cone") {
    base.w = 34; base.h = 34;
    base.y = groundY - 18;
  } else if (type === "traffic") {
    base.w = 40; base.h = 90;
    base.y = groundY - 74;
  } else if (type === "bus") {
    base.w = 90; base.h = 56;
    base.y = groundY - 44;
  } else if (type === "paper") {
    base.w = 44; base.h = 44;
    base.y = groundY - 34;
  } else if (type === "help") {
    base.w = 38; base.h = 38;
    base.y = groundY - 120; // floating
  }

  obstacles.push(base);
}

function addPopup(kind) {
  // popup is a forced delay unless you spend a help
  const duration = kind === "insurance" ? 1.8 : 1.3;
  popups.push({
    kind,
    t: duration,
    max: duration,
    usedHelp: false
  });
}

function applyHit(ob) {
  if (player.invulnT > 0) return;

  // If player has a help, auto-spend it for forgiveness
  if (helps > 0) {
    helps -= 1;
    player.invulnT = 1.0;
    score = Math.max(0, score - 10);
    updateHUD();
    return;
  }

  // No help: big penalty
  timeLeft -= 7;
  score = Math.max(0, score - 20);
  player.invulnT = 1.0;
  updateHUD();
}

function trySpawn(dt) {
  spawnT -= dt;
  if (spawnT > 0) return;

  // Spawn cadence based on speed
  const minGap = 0.55;
  const maxGap = 1.1;
  spawnT = rand(minGap, maxGap);

  const roll = Math.random();

  // Occasionally spawn a help power-up
  if (roll < 0.12) {
    addObstacle("help");
    return;
  }

  // Mix obstacles
  const types = ["cone", "traffic", "bus", "paper"];
  addObstacle(types[randi(0, types.length - 1)]);

  // Sometimes trigger a popup delay shortly after a spawn
  if (Math.random() < 0.18) {
    const kind = Math.random() < 0.55 ? "insurance" : "childcare";
    // schedule popup with a tiny delay by pushing a "delayed popup" obstacle
    setTimeout(() => {
      if (running && !paused) addPopup(kind);
    }, randi(200, 650));
  }
}

function drawBackground() {
  // sky
  ctx.fillStyle = "#f6f7fb";
  ctx.fillRect(0, 0, W, H);

  // far buildings
  ctx.fillStyle = "#dde0ee";
  for (let i = 0; i < 14; i++) {
    const bx = (i * 90 + (Date.now() / 30) % 90) - 90;
    const bw = 56;
    const bh = 120 + (i % 4) * 30;
    ctx.fillRect(bx, groundY - bh - 60, bw, bh);
  }

  // road
  ctx.fillStyle = "#e9ebf5";
  ctx.fillRect(0, groundY - 18, W, 60);

  // lane line
  ctx.strokeStyle = "#cfd3e6";
  ctx.lineWidth = 6;
  ctx.setLineDash([32, 22]);
  ctx.beginPath();
  ctx.moveTo(0, groundY + 14);
  ctx.lineTo(W, groundY + 14);
  ctx.stroke();
  ctx.setLineDash([]);

  // finish line hint
  const finishX = W - 220;
  ctx.fillStyle = "#111";
  ctx.globalAlpha = 0.07;
  ctx.fillRect(finishX, groundY - 60, 14, 120);
  ctx.globalAlpha = 1;

  // clinic icon top-right
  ctx.fillStyle = "#111";
  ctx.globalAlpha = 0.08;
  ctx.fillRect(W - 140, 42, 96, 62);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#111";
  ctx.fillRect(W - 98, 56, 12, 34);
  ctx.fillRect(W - 110, 68, 36, 12);
}

function drawObstacle(ob) {
  ctx.save();
  ctx.translate(ob.x, ob.y);

  if (ob.type === "cone") {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, -16, 34, 16);
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.moveTo(17, -34);
    ctx.lineTo(34, -16);
    ctx.lineTo(0, -16);
    ctx.closePath();
    ctx.fill();
  }

  if (ob.type === "traffic") {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, -74, 40, 90);
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.2;
    ctx.fillRect(6, -66, 28, 18);
    ctx.fillRect(6, -42, 28, 18);
    ctx.fillRect(6, -18, 28, 18);
    ctx.globalAlpha = 1;
  }

  if (ob.type === "bus") {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, -50, 90, 56);
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.15;
    ctx.fillRect(10, -42, 52, 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#555";
    ctx.fillRect(12, 0, 18, 6);
    ctx.fillRect(60, 0, 18, 6);
  }

  if (ob.type === "paper") {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, -34, 44, 44);
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.12;
    ctx.fillRect(8, -26, 28, 6);
    ctx.fillRect(8, -14, 24, 6);
    ctx.fillRect(8, -2, 20, 6);
    ctx.globalAlpha = 1;
  }

  if (ob.type === "help") {
    ctx.fillStyle = "#111";
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(19, -19, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f6f7fb";
    ctx.fillRect(17, -32, 4, 26);
    ctx.fillRect(8, -23, 22, 4);
  }

  ctx.restore();
}

function obstacleRect(ob) {
  let x = ob.x, y = ob.y, w = ob.w, h = ob.h;
  return { x, y: y - h, w, h };
}

function drawPopups() {
  if (popups.length === 0) return;

  // dim screen
  ctx.fillStyle = "rgba(10, 10, 20, 0.35)";
  ctx.fillRect(0, 0, W, H);

  const p = popups[0];
  const kind = p.kind;

  const boxW = 520;
  const boxH = 190;
  const bx = (W - boxW) / 2;
  const by = 90;

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#e6e7ee";
  ctx.lineWidth = 2;
  roundRect(bx, by, boxW, boxH, 18, true, true);

  ctx.fillStyle = "#111";
  ctx.font = "700 22px system-ui";
  ctx.fillText(kind === "insurance" ? "Insurance Call" : "Childcare Conflict", bx + 22, by + 44);

  ctx.font = "16px system-ui";
  const msg =
    kind === "insurance"
      ? "They need more information. This pauses everything."
      : "Care plan changed. You need a backup, right now.";
  ctx.fillText(msg, bx + 22, by + 78);

  ctx.font = "14px system-ui";
  ctx.globalAlpha = 0.85;
  ctx.fillText("Press H to spend a Help and reduce the delay.", bx + 22, by + 108);
  ctx.globalAlpha = 1;

  // progress bar
  const barX = bx + 22;
  const barY = by + 132;
  const barW = boxW - 44;
  const barH = 16;

  ctx.fillStyle = "#e9ebf5";
  roundRect(barX, barY, barW, barH, 999, true, false);

  const pct = clamp(p.t / p.max, 0, 1);
  ctx.fillStyle = "#111";
  roundRect(barX, barY, barW * pct, barH, 999, true, false);

  ctx.font = "700 14px system-ui";
  ctx.fillStyle = "#111";
  ctx.fillText("Delay", barX, barY + 40);
}

function roundRect(x, y, w, h, r, fill, stroke) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawTopBar() {
  // time bar at bottom
  const barW = W - 60;
  const barH = 16;
  const x = 30;
  const y = H - 34;

  ctx.fillStyle = "rgba(17,17,17,0.08)";
  roundRect(x, y, barW, barH, 999, true, false);

  const pct = clamp(timeLeft / 60, 0, 1);
  ctx.fillStyle = "#111";
  roundRect(x, y, barW * pct, barH, 999, true, false);

  // label
  ctx.fillStyle = "#111";
  ctx.globalAlpha = 0.65;
  ctx.font = "600 14px system-ui";
  ctx.fillText("Time to make it", x, y - 8);
  ctx.globalAlpha = 1;
}

function endGame(win) {
  running = false;
  paused = false;

  const base = win
    ? `You made it this time.\n\nEven with good choices, delays still happen.\nSmall supports change everything.`
    : `You missed treatment.\n\nNot because of skill.\nBecause the system assumes time, money, and transportation.`;

  const action = `\n\nWhat could help:\n• flexible clinic hours\n• reliable transit options\n• paid sick leave and caregiver support`;

  showOverlay(win ? "Made it" : "Missed it", base + action, false);
}

function tickPopups(dt) {
  if (popups.length === 0) return false;

  const p = popups[0];
  p.t -= dt;

  // popups pause obstacle movement and timer less, but still drain time a bit
  timeLeft -= dt * 0.65;

  if (p.t <= 0) {
    popups.shift();
  }
  return true;
}

let last = 0;

function loop(ts) {
  if (!running) return;

  const dt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;

  if (paused) {
    drawBackground();
    obstacles.forEach(drawObstacle);
    player.draw();
    drawTopBar();
    ctx.fillStyle = "rgba(10,10,20,0.35)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "700 32px system-ui";
    ctx.fillText("Paused", W / 2 - 60, H / 2);
    requestAnimationFrame(loop);
    return;
  }

  // background
  drawBackground();

  // popup delays
  const inPopup = tickPopups(dt);

  // update player
  player.update(dt);

  // spawn and move obstacles only if no popup
  if (!inPopup) {
    speed += dt * 8; // slight increase over time
    trySpawn(dt);

    for (const ob of obstacles) ob.x -= speed * dt;
    timeLeft -= dt;

    // collisions
    const pr = player.rect();
    for (const ob of obstacles) {
      const or = obstacleRect(ob);

      // help pickup
      if (ob.type === "help" && rectsOverlap(pr, or)) {
        helps += 1;
        score += 15;
        ob.x = -9999;
        updateHUD();
        continue;
      }

      if (ob.type !== "help" && rectsOverlap(pr, or)) {
        applyHit(ob);
        ob.x = -9999;
      }

      // scoring for passing
      if (!ob.passed && ob.x + ob.w < player.x) {
        ob.passed = true;
        score += 5;
        updateHUD();
      }
    }

    // cleanup
    for (let i = obstacles.length - 1; i >= 0; i--) {
      if (obstacles[i].x < -200) obstacles.splice(i, 1);
    }
  }

  // draw obstacles
  obstacles.forEach(drawObstacle);

  // draw player
  player.draw();

  // HUD bars
  drawTopBar();

  // draw popups last
  drawPopups();

  // update HUD numbers
  timeLeft = clamp(timeLeft, -5, 60);
  updateHUD();

  if (timeLeft <= 0) {
    endGame(false);
    return;
  }
  if (score >= 350) {
    endGame(true);
    return;
  }

  requestAnimationFrame(loop);
}

function start() {
  resetGame();
  hideOverlay();
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

playBtn.addEventListener("click", () => start());

howBtn.addEventListener("click", () => {
  textEl.textContent =
    "Controls: Space to jump, Down to slide, P to pause. " +
    "You score by passing obstacles and collecting Helps. " +
    "Popups represent real life delays. Press H during a popup to spend a Help and shorten it. " +
    "Win by reaching 350 score before time runs out.";
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); keys.space = true; }
  if (e.code === "ArrowDown") keys.down = true;

  if (e.key === "p" || e.key === "P") {
    if (running) paused = !paused;
  }

  if (e.key === "h" || e.key === "H") {
    // spend help on popup
    if (popups.length > 0 && helps > 0) {
      helps -= 1;
      popups[0].t = Math.min(popups[0].t, 0.35);
      updateHUD();
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") keys.space = false;
  if (e.code === "ArrowDown") keys.down = false;
});

canvas.addEventListener("mousedown", () => {
  if (!running) return;
  keys.space = true;
  setTimeout(() => (keys.space = false), 60);
});

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (!running) return;
  keys.space = true;
  setTimeout(() => (keys.space = false), 60);
}, { passive: false });

// Player input handled every frame with current key state
setInterval(() => {
  if (!running || paused) return;

  if (keys.down) {
    player.slide(true);
  } else {
    player.slide(false);
  }
  if (keys.space) {
    player.jump();
    keys.space = false; // single jump per press
  }
}, 16);

// Initial overlay visible
showOverlay(
  "Chemo Dash",
  "Make it to treatment on time. Obstacles represent transit, work, and system delays.\n\nPress Play to start."
);
