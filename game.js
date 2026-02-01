const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const coinsEl = document.getElementById("coins");
const helpsEl = document.getElementById("helps");
const timeEl = document.getElementById("time");

const overlay = document.getElementById("overlay");
const titleEl = document.getElementById("title");
const textEl = document.getElementById("text");
const playBtn = document.getElementById("playBtn");
const howBtn = document.getElementById("howBtn");

const W = canvas.width;
const H = canvas.height;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => Math.random() * (b - a) + a;
const randi = (a, b) => Math.floor(rand(a, b + 1));

let running = false;
let paused = false;

let score = 0;
let coins = 0;
let helps = 1;
let timeLeft = 60;

let speedZ = 14;          // how fast the world comes at you
let difficulty = 0;       // increases with time
let shakeT = 0;

const keys = {
  left: false,
  right: false,
  down: false,
  jump: false
};

// 3 lanes: -1, 0, 1
let lane = 0;
let laneTarget = 0;

const player = {
  y: 0,            // vertical offset for jump
  vy: 0,
  jumping: false,
  sliding: false,
  slideT: 0,
  invulnT: 0
};

const world = {
  t: 0,
  roadWNear: 520,
  roadWFar: 140,
  horizonY: 120,
  nearY: H - 40,
  laneOffsets: [-1, 0, 1]
};

// Entities in Z space (0..1), z=1 is near player, z=0 is horizon
const entities = [];
const particles = [];
const popups = []; // forced delays with message

function resetGame() {
  score = 0;
  coins = 0;
  helps = 1;
  timeLeft = 60;

  speedZ = 14;
  difficulty = 0;

  lane = 0;
  laneTarget = 0;

  player.y = 0;
  player.vy = 0;
  player.jumping = false;
  player.sliding = false;
  player.slideT = 0;
  player.invulnT = 0;

  entities.length = 0;
  particles.length = 0;
  popups.length = 0;

  shakeT = 0;

  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = String(score);
  coinsEl.textContent = String(coins);
  helpsEl.textContent = String(helps);
  timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
}

function showOverlay(title, text) {
  titleEl.textContent = title;
  textEl.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function project(laneIndex, z) {
  // z: 0 far, 1 near
  const y = lerp(world.horizonY, world.nearY, z);
  const roadW = lerp(world.roadWFar, world.roadWNear, z);

  const laneW = roadW / 3;
  const xCenter = W / 2;

  const x = xCenter + laneIndex * laneW * 0.62; // compress lanes for style
  return { x, y, scale: lerp(0.25, 1.15, z) };
}

function spawnParticle(x, y, n = 10) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: rand(-120, 120),
      vy: rand(-220, -60),
      a: 1,
      r: rand(2, 5)
    });
  }
}

function addEntity(type, laneIndex, z = 0) {
  entities.push({
    type,
    lane: laneIndex,
    z,
    hit: false,
    // one-off behavior
    stun: type === "paperwork",
    slow: type === "bus",
    trap: type === "childcare",
    block: type === "traffic",
    coin: type === "coin",
    help: type === "help"
  });
}

let spawnT = 0;
function trySpawn(dt) {
  spawnT -= dt;
  if (spawnT > 0) return;

  const base = clamp(0.55 - difficulty * 0.012, 0.26, 0.55);
  spawnT = rand(base, base + 0.25);

  // spawn coins often
  if (Math.random() < 0.38) {
    addEntity("coin", world.laneOffsets[randi(0, 2)], 0.05);
    if (Math.random() < 0.25) addEntity("coin", world.laneOffsets[randi(0, 2)], 0.05);
    return;
  }

  // help occasionally
  if (Math.random() < 0.10) {
    addEntity("help", world.laneOffsets[randi(0, 2)], 0.04);
    return;
  }

  // obstacle mix
  const roll = Math.random();
  const ln = world.laneOffsets[randi(0, 2)];

  if (roll < 0.28) addEntity("traffic", ln, 0.02);
  else if (roll < 0.55) addEntity("bus", ln, 0.02);
  else if (roll < 0.78) addEntity("paperwork", ln, 0.02);
  else addEntity("childcare", ln, 0.02);

  // popup sometimes, but not too frequent
  if (Math.random() < 0.14 && popups.length === 0) {
    const kind = Math.random() < 0.55 ? "Insurance call" : "Childcare conflict";
    popups.push({ kind, t: 1.3, max: 1.3 });
  }
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b0f1a");
  g.addColorStop(1, "#090c14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // glow
  ctx.globalAlpha = 0.55;
  const glow = ctx.createRadialGradient(W * 0.5, 80, 20, W * 0.5, 80, 520);
  glow.addColorStop(0, "rgba(123,97,255,0.35)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

function drawCityParallax(t) {
  // two layers of buildings moving at different speeds
  const layers = [
    { y: world.horizonY + 70, h: 90, s: 14, a: 0.22 },
    { y: world.horizonY + 110, h: 130, s: 26, a: 0.14 }
  ];

  for (const L of layers) {
    ctx.globalAlpha = L.a;
    ctx.fillStyle = "#eef2ff";
    const offset = (t * L.s) % 120;
    for (let i = -2; i < 12; i++) {
      const x = i * 120 - offset;
      const w = 70;
      const hh = L.h + (i % 4) * 25;
      ctx.fillRect(x, L.y - hh, w, hh);
    }
    ctx.globalAlpha = 1;
  }
}

function drawRoad() {
  // road polygon
  const farW = world.roadWFar;
  const nearW = world.roadWNear;

  const x0 = W / 2 - farW / 2;
  const x1 = W / 2 + farW / 2;

  const x2 = W / 2 + nearW / 2;
  const x3 = W / 2 - nearW / 2;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.moveTo(x0, world.horizonY);
  ctx.lineTo(x1, world.horizonY);
  ctx.lineTo(x2, world.nearY);
  ctx.lineTo(x3, world.nearY);
  ctx.closePath();
  ctx.fill();

  // lane lines
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 3;

  for (let i = 1; i <= 2; i++) {
    const zA = 0.0, zB = 1.0;
    const yA = lerp(world.horizonY, world.nearY, zA);
    const yB = lerp(world.horizonY, world.nearY, zB);
    const wA = lerp(farW, nearW, zA);
    const wB = lerp(farW, nearW, zB);

    const xA = W / 2 - wA / 2 + (wA / 3) * i;
    const xB = W / 2 - wB / 2 + (wB / 3) * i;

    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();
  }

  // speed streaks
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = "#eef2ff";
  for (let i = 0; i < 18; i++) {
    const z = (i / 18);
    const y = lerp(world.horizonY + 10, world.nearY + 10, z);
    const w = lerp(30, 160, z);
    const x = W / 2 + Math.sin((world.t * 2) + i) * lerp(20, 120, z) - w / 2;
    ctx.fillRect(x, y, w, 3);
  }
  ctx.globalAlpha = 1;
}

function drawEntity(e) {
  const p = project(e.lane, e.z);
  const size = 42 * p.scale;

  // icon bubble background
  ctx.save();
  ctx.translate(p.x, p.y);

  // shadow
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(0, 10 * p.scale, 24 * p.scale, 8 * p.scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // body
  let fill = "rgba(238,242,255,0.92)";
  if (e.type === "traffic") fill = "rgba(255, 70, 70, 0.92)";
  if (e.type === "bus") fill = "rgba(255, 200, 60, 0.92)";
  if (e.type === "paperwork") fill = "rgba(160, 120, 255, 0.92)";
  if (e.type === "childcare") fill = "rgba(60, 210, 255, 0.92)";
  if (e.type === "coin") fill = "rgba(255, 230, 120, 0.95)";
  if (e.type === "help") fill = "rgba(35, 245, 163, 0.95)";

  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(-size/2, -size, size, size, 14 * p.scale);
  ctx.fill();

  // icon glyph (simple)
  ctx.fillStyle = "rgba(11,15,26,0.95)";
  ctx.font = `${Math.floor(22 * p.scale)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let glyph = "■";
  if (e.type === "traffic") glyph = "🚦";
  if (e.type === "bus") glyph = "🚌";
  if (e.type === "paperwork") glyph = "📄";
  if (e.type === "childcare") glyph = "👶";
  if (e.type === "coin") glyph = "🪙";
  if (e.type === "help") glyph = "💼";

  ctx.fillText(glyph, 0, -size/2);

  // label near horizon only (helps readability)
  if (e.z < 0.22) {
    ctx.globalAlpha = 0.8;
    ctx.font = `${Math.floor(12 * p.scale)}px system-ui`;
    ctx.fillStyle = "rgba(238,242,255,0.9)";
    ctx.fillText(
      e.type === "paperwork" ? "PAPERWORK" :
      e.type === "childcare" ? "CHILDCARE" :
      e.type === "traffic" ? "TRAFFIC" :
      e.type === "bus" ? "BUS DELAY" :
      e.type === "coin" ? "COIN" : "HELP",
      0, -size - (12 * p.scale)
    );
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function playerBox() {
  // hitbox in projected space near player
  const p = project(lane, 0.95);
  const baseW = 52;
  const baseH = player.sliding ? 44 : 74;

  const x = p.x - (baseW / 2);
  const y = p.y - baseH - 18 - player.y;

  return { x, y, w: baseW, h: baseH };
}

function drawPlayer() {
  const p = project(lane, 0.95);
  const box = playerBox();

  // glow outline
  ctx.save();
  ctx.globalAlpha = player.invulnT > 0 ? 0.35 : 0.18;
  ctx.fillStyle = "rgba(123,97,255,1)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 8, 46, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // character
  ctx.fillStyle = "rgba(238,242,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 14);
  ctx.fill();

  // face
  ctx.fillStyle = "rgba(11,15,26,0.9)";
  ctx.fillRect(box.x + box.w - 18, box.y + 16, 8, 8);

  // slide indicator
  if (player.sliding) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(35,245,163,0.9)";
    ctx.fillRect(box.x + 6, box.y + box.h - 10, box.w - 12, 6);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function collideEntity(e) {
  // If entity is near player, check lane and vertical state
  if (e.z < 0.86) return false;
  if (e.lane !== lane) return false;

  // For traffic and childcare: must jump to avoid
  if (e.type === "traffic" || e.type === "childcare") {
    const isJumpingHigh = player.y > 22;
    return !isJumpingHigh;
  }

  // For paperwork: must slide to avoid (duck under)
  if (e.type === "paperwork") {
    return !player.sliding;
  }

  // For bus: can dodge by lane change or jump (jump works too)
  if (e.type === "bus") {
    const isJumpingHigh = player.y > 16;
    return !isJumpingHigh;
  }

  return true;
}

function hitEffect(type) {
  shakeT = 0.18;
  spawnParticle(W/2, H*0.55, 14);
}

function applyHit(type) {
  if (player.invulnT > 0) return;

  if (type === "coin") {
    coins += 1;
    score += 10;
    spawnParticle(W/2, H*0.62, 6);
    updateHUD();
    return;
  }

  if (type === "help") {
    helps += 1;
    score += 25;
    spawnParticle(W/2, H*0.62, 10);
    updateHUD();
    return;
  }

  // Spend a help automatically if you have one
  if (helps > 0) {
    helps -= 1;
    score = Math.max(0, score - 15);
    player.invulnT = 1.0;
    hitEffect(type);
    updateHUD();
    return;
  }

  // No helps: bigger penalties
  score = Math.max(0, score - 35);
  timeLeft -= 7;
  player.invulnT = 1.0;
  hitEffect(type);
  updateHUD();
}

function drawTimeBar() {
  const x = 26;
  const y = H - 34;
  const w = W - 52;
  const h = 14;

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#eef2ff";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 999);
  ctx.fill();
  ctx.globalAlpha = 1;

  const pct = clamp(timeLeft / 60, 0, 1);
  ctx.fillStyle = "rgba(35,245,163,0.85)";
  ctx.beginPath();
  ctx.roundRect(x, y, w * pct, h, 999);
  ctx.fill();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#eef2ff";
  ctx.font = "700 12px system-ui";
  ctx.fillText("Time to make it", x, y - 6);
  ctx.globalAlpha = 1;
}

function tickPopups(dt) {
  if (popups.length === 0) return false;
  const p = popups[0];
  p.t -= dt;

  // still drains a bit of time
  timeLeft -= dt * 0.65;

  // dim + card
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, W, H);

  const bw = 560, bh = 180;
  const bx = (W - bw) / 2, by = 90;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#eef2ff";
  ctx.font = "900 22px system-ui";
  ctx.fillText(p.kind, bx + 20, by + 40);

  ctx.font = "16px system-ui";
  ctx.globalAlpha = 0.9;
  ctx.fillText("Press H to spend a Help and shorten this delay.", bx + 20, by + 78);
  ctx.globalAlpha = 1;

  // bar
  const barX = bx + 20, barY = by + 110, barW = bw - 40, barH = 14;
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#eef2ff";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 999);
  ctx.fill();
  ctx.globalAlpha = 1;

  const pct = clamp(p.t / p.max, 0, 1);
  ctx.fillStyle = "rgba(255,200,60,0.85)";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW * pct, barH, 999);
  ctx.fill();

  if (p.t <= 0) popups.shift();
  return true;
}

function endGame(win) {
  running = false;
  paused = false;

  const msg = win
    ? "You made it.\n\nEven good planning can’t erase delays.\nSupports make the run survivable."
    : "You missed treatment.\n\nNot because you are bad at the game.\nBecause delays stack unfairly.";

  const action =
    "\n\nWhat could help:\n• flexible clinic hours\n• reliable transit options\n• paid sick leave and caregiver support";

  showOverlay(win ? "Made it" : "Missed it", msg + action);
}

function tutorialText() {
  return (
    "3-lane runner controls:\n" +
    "Left/Right: change lane\n" +
    "Space: jump\n" +
    "Down: slide\n\n" +
    "Obstacles are labeled as they approach.\nCollect 💼 Helps to block hits.\nCollect 🪙 Coins for score.\n\n" +
    "Win: survive 60 seconds."
  );
}

playBtn.addEventListener("click", () => start());
howBtn.addEventListener("click", () => {
  textEl.textContent = tutorialText();
});

function start() {
  resetGame();
  hideOverlay();
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

// Input
window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = true;
  if (e.code === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = true;
  if (e.code === "ArrowDown") keys.down = true;
  if (e.code === "Space") { e.preventDefault(); keys.jump = true; }

  if (e.key === "p" || e.key === "P") if (running) paused = !paused;

  if (e.key === "h" || e.key === "H") {
    if (popups.length > 0 && helps > 0) {
      helps -= 1;
      popups[0].t = Math.min(popups[0].t, 0.25);
      updateHUD();
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = false;
  if (e.code === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = false;
  if (e.code === "ArrowDown") keys.down = false;
  if (e.code === "Space") keys.jump = false;
});

// Touch swipe
let touchStartX = 0, touchStartY = 0;
canvas.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 30) laneTarget = clamp(laneTarget + 1, -1, 1);
    if (dx < -30) laneTarget = clamp(laneTarget - 1, -1, 1);
  } else {
    if (dy < -30) keys.jump = true;
    if (dy > 30) keys.down = true;
    setTimeout(() => { keys.down = false; }, 120);
  }
}, { passive: true });

// Main loop
let last = 0;
function loop(ts) {
  if (!running) return;

  const dt = clamp((ts - last) / 1000, 0, 0.05);
  last = ts;

  if (paused) {
    drawSky();
    drawCityParallax(world.t);
    drawRoad();
    drawPlayer();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#eef2ff";
    ctx.font = "900 34px system-ui";
    ctx.fillText("Paused", W/2 - 70, H/2);
    requestAnimationFrame(loop);
    return;
  }

  world.t += dt;

  // Shake
  let sx = 0, sy = 0;
  if (shakeT > 0) {
    shakeT -= dt;
    sx = rand(-6, 6) * (shakeT / 0.18);
    sy = rand(-4, 4) * (shakeT / 0.18);
  }

  ctx.save();
  ctx.translate(sx, sy);

  drawSky();
  drawCityParallax(world.t);
  drawRoad();

  // Difficulty ramp
  difficulty += dt * 1.2;
  speedZ = 14 + difficulty * 0.12;

  // Movement: approach player
  for (const e of entities) e.z += dt * (speedZ * 0.045);

  // Spawn
  if (popups.length === 0) trySpawn(dt);

  // Lane changes, with a nice easing snap
  if (keys.left) laneTarget = clamp(laneTarget - 1, -1, 1), keys.left = false;
  if (keys.right) laneTarget = clamp(laneTarget + 1, -1, 1), keys.right = false;

  const tLane = 1 - Math.exp(-dt * 18);
  lane = lerp(lane, laneTarget, tLane);

  // Jump physics
  if (keys.jump && !player.jumping) {
    player.vy = 520;
    player.jumping = true;
  }
  keys.jump = false;

  player.vy -= 1600 * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
    player.jumping = false;
  }

  // Slide
  if (keys.down && !player.sliding && !player.jumping) {
    player.sliding = true;
    player.slideT = 0.28;
  }
  if (player.sliding) {
    player.slideT -= dt;
    if (player.slideT <= 0) player.sliding = false;
  }

  // Invuln
  if (player.invulnT > 0) player.invulnT -= dt;

  // Draw entities sorted far->near for nice depth
  entities.sort((a, b) => a.z - b.z);
  for (const e of entities) drawEntity(e);

  drawPlayer();

  // Collisions and cleanup
  for (const e of entities) {
    if (!e.hit && collideEntity(e)) {
      e.hit = true;
      applyHit(e.type);
    }
  }
  for (let i = entities.length - 1; i >= 0; i--) {
    if (entities[i].z > 1.05 || entities[i].hit) entities.splice(i, 1);
  }

  // Particles
  for (const p of particles) {
    p.vy += 900 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.a -= dt * 1.6;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].a <= 0) particles.splice(i, 1);
  }
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.a, 0, 1);
    ctx.fillStyle = "#eef2ff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Timer
  timeLeft -= dt;
  updateHUD();
  drawTimeBar();

  // Popup overlays
  const inPopup = tickPopups(dt);

  ctx.restore();

  if (timeLeft <= 0) {
    endGame(false);
    return;
  }

  // Win condition: good score target
  if (score >= 650) {
    endGame(true);
    return;
  }

  requestAnimationFrame(loop);
}

// Initial screen
showOverlay("Chemo Dash",
  "A 3-lane arcade runner.\n\n" +
  "Make it to treatment on time while delays stack up.\n\n" +
  "Press Play to start."
);
