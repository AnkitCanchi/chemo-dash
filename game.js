// The Long Way to Treatment (Digital Board Game)
// Simple, readable, and cancer-related at first glance.

const boardEl = document.getElementById("board");
const statusLineEl = document.getElementById("statusLine");

const playerCountEl = document.getElementById("playerCount");
const nameFieldsEl = document.getElementById("nameFields");
const startBtn = document.getElementById("startBtn");

const setupCard = document.getElementById("setupCard");
const actionCard = document.getElementById("actionCard");
const playersCard = document.getElementById("playersCard");

const playersListEl = document.getElementById("playersList");

const turnNameEl = document.getElementById("turnName");
const lastRollEl = document.getElementById("lastRoll");
const roundNumEl = document.getElementById("roundNum");

const landedTextEl = document.getElementById("landedText");
const cardTextEl = document.getElementById("cardText");
const noteTextEl = document.getElementById("noteText");

const rollBtn = document.getElementById("rollBtn");
const endTurnBtn = document.getElementById("endTurnBtn");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const restartBtn = document.getElementById("restartBtn");

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randi = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

const TOKEN_COLORS = ["#7b61ff", "#23f5a3", "#ffd24a", "#46d2ff"];

const SPACE_TYPES = {
  START: "start",
  DELAY: "delay",
  SUPPORT: "support",
  CHECKPOINT: "checkpoint",
  END: "end"
};

// Board spaces: 32 spaces, arranged in an 8-column grid visually.
const SPACES = [
  { type: SPACE_TYPES.START, label: "Diagnosis: You need treatment" },
  { type: SPACE_TYPES.DELAY, label: "Insurance review" },
  { type: SPACE_TYPES.CHECKPOINT, label: "Primary care referral" },
  { type: SPACE_TYPES.DELAY, label: "Paperwork missing" },
  { type: SPACE_TYPES.SUPPORT, label: "Patient navigator offered" },
  { type: SPACE_TYPES.DELAY, label: "Scan rescheduled" },
  { type: SPACE_TYPES.DELAY, label: "Transportation delay" },
  { type: SPACE_TYPES.CHECKPOINT, label: "Imaging completed" },

  { type: SPACE_TYPES.DELAY, label: "Prior authorization" },
  { type: SPACE_TYPES.SUPPORT, label: "Reliable ride available" },
  { type: SPACE_TYPES.DELAY, label: "Pharmacy out of stock" },
  { type: SPACE_TYPES.DELAY, label: "Work schedule conflict" },
  { type: SPACE_TYPES.CHECKPOINT, label: "Lab work done" },
  { type: SPACE_TYPES.DELAY, label: "Insurance call-back" },
  { type: SPACE_TYPES.DELAY, label: "Childcare issue" },
  { type: SPACE_TYPES.CHECKPOINT, label: "Treatment plan finalized" },

  { type: SPACE_TYPES.DELAY, label: "Specialist visit delayed" },
  { type: SPACE_TYPES.SUPPORT, label: "Paid sick leave" },
  { type: SPACE_TYPES.DELAY, label: "Copay surprise" },
  { type: SPACE_TYPES.DELAY, label: "Clinic understaffed" },
  { type: SPACE_TYPES.CHECKPOINT, label: "Port placement scheduled" },
  { type: SPACE_TYPES.DELAY, label: "Paperwork error again" },
  { type: SPACE_TYPES.SUPPORT, label: "Community support fund" },
  { type: SPACE_TYPES.DELAY, label: "Ride canceled last minute" },

  { type: SPACE_TYPES.DELAY, label: "Appointment moved earlier" },
  { type: SPACE_TYPES.CHECKPOINT, label: "Pre-chemo checklist" },
  { type: SPACE_TYPES.DELAY, label: "Insurance denial (appeal)" },
  { type: SPACE_TYPES.SUPPORT, label: "Navigator escalates case" },
  { type: SPACE_TYPES.DELAY, label: "Long hold time" },
  { type: SPACE_TYPES.CHECKPOINT, label: "Clearance received" },
  { type: SPACE_TYPES.DELAY, label: "Traffic" },
  { type: SPACE_TYPES.END, label: "Treatment: You made it" }
];

const delayCards = [
  { text: "Insurance needs more documentation. Move back 3 spaces.", effect: (g, p) => movePlayer(g, p, -3) },
  { text: "Scan rescheduled. Skip your next turn.", effect: (g, p) => (p.skipTurns += 1) },
  { text: "Transportation canceled. Move back 2 spaces.", effect: (g, p) => movePlayer(g, p, -2) },
  { text: "Pharmacy delay. Move back 1 space.", effect: (g, p) => movePlayer(g, p, -1) },
  { text: "Work shift conflict. Lose 1 turn.", effect: (g, p) => (p.skipTurns += 1) },
  { text: "Paperwork error. Return to the last checkpoint.", effect: (g, p) => moveToLastCheckpoint(p) },
  { text: "Clinic understaffed. Everyone skips a turn.", effect: (g, p) => g.players.forEach(x => x.skipTurns += 1) }
];

const supportCards = [
  { text: "Patient Navigator: Block the next delay card that hits you.", effect: (g, p) => (p.blockDelay += 1) },
  { text: "Reliable Transportation: Move forward 2 spaces.", effect: (g, p) => movePlayer(g, p, +2) },
  { text: "Paid Sick Leave: Take one extra roll right now.", effect: (g, p) => (g.extraRoll = true) },
  { text: "Community Support: Ignore one skip-turn penalty.", effect: (g, p) => (p.skipTurns = Math.max(0, p.skipTurns - 1)) }
];

let game = null;

function makeNameInputs(count) {
  nameFieldsEl.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const input = document.createElement("input");
    input.placeholder = `Player ${i + 1} name`;
    input.value = `Player ${i + 1}`;
    input.dataset.idx = String(i);
    nameFieldsEl.appendChild(input);
  }
}

playerCountEl.addEventListener("change", () => {
  makeNameInputs(Number(playerCountEl.value));
});

makeNameInputs(Number(playerCountEl.value));

function newGame(names) {
  return {
    round: 1,
    turnIndex: 0,
    started: true,
    lastRoll: null,
    extraRoll: false,
    players: names.map((name, i) => ({
      name,
      color: TOKEN_COLORS[i],
      pos: 0,
      skipTurns: 0,
      blockDelay: 0
    }))
  };
}

function currentPlayer(g) {
  return g.players[g.turnIndex];
}

function movePlayer(g, p, delta) {
  p.pos = clamp(p.pos + delta, 0, SPACES.length - 1);
}

function moveToLastCheckpoint(p) {
  let last = 0;
  for (let i = 0; i <= p.pos; i++) {
    if (SPACES[i].type === SPACE_TYPES.CHECKPOINT || SPACES[i].type === SPACE_TYPES.START) last = i;
  }
  p.pos = last;
}

function renderBoard(g) {
  boardEl.innerHTML = "";

  for (let i = 0; i < SPACES.length; i++) {
    const s = SPACES[i];
    const cell = document.createElement("div");
    cell.className = `space ${s.type}`;

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = `#${i}`;

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = s.label;

    const tokens = document.createElement("div");
    tokens.className = "tokens";

    if (g) {
      g.players.forEach((p) => {
        if (p.pos === i) {
          const t = document.createElement("div");
          t.className = "token";
          t.style.background = p.color;
          t.title = p.name;
          tokens.appendChild(t);
        }
      });
    }

    cell.appendChild(num);
    cell.appendChild(label);
    cell.appendChild(tokens);

    boardEl.appendChild(cell);
  }
}

function renderPlayers(g) {
  playersListEl.innerHTML = "";
  g.players.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "playerRow";

    const left = document.createElement("div");
    left.innerHTML = `<b style="color:${p.color}">●</b> <b>${p.name}</b><br><span style="opacity:.85;font-size:12px">Position: #${p.pos}</span>`;

    const right = document.createElement("div");
    right.className = "badges";

    const b1 = document.createElement("span");
    b1.className = "badge";
    b1.textContent = `Skip: ${p.skipTurns}`;
    right.appendChild(b1);

    const b2 = document.createElement("span");
    b2.className = "badge good";
    b2.textContent = `Block Delay: ${p.blockDelay}`;
    right.appendChild(b2);

    row.appendChild(left);
    row.appendChild(right);
    playersListEl.appendChild(row);
  });
}

function setUIForTurn(g) {
  const p = currentPlayer(g);
  turnNameEl.textContent = p.name;
  roundNumEl.textContent = String(g.round);
  lastRollEl.textContent = g.lastRoll === null ? "-" : String(g.lastRoll);

  const s = SPACES[p.pos];
  landedTextEl.textContent = `${s.label} (${s.type.toUpperCase()})`;

  endTurnBtn.disabled = true;
  rollBtn.disabled = false;

  statusLineEl.textContent = `${p.name}'s turn. Roll the die.`;
  noteTextEl.textContent = "Delays are common. Supports are rare. That is the point.";
}

function drawCard(g, type) {
  if (type === SPACE_TYPES.DELAY) return delayCards[randi(0, delayCards.length - 1)];
  if (type === SPACE_TYPES.SUPPORT) return supportCards[randi(0, supportCards.length - 1)];
  return null;
}

function applyLanding(g, p) {
  const s = SPACES[p.pos];

  if (s.type === SPACE_TYPES.START || s.type === SPACE_TYPES.CHECKPOINT) {
    cardTextEl.textContent = "Checkpoint: breathe for a moment. No card drawn.";
    endTurnBtn.disabled = false;
    return;
  }

  if (s.type === SPACE_TYPES.END) {
    winGame(p);
    return;
  }

  if (s.type === SPACE_TYPES.DELAY) {
    if (p.blockDelay > 0) {
      p.blockDelay -= 1;
      cardTextEl.textContent = "A delay hit you, but your support blocked it (Block Delay used).";
      endTurnBtn.disabled = false;
      return;
    }

    const card = drawCard(g, SPACE_TYPES.DELAY);
    cardTextEl.textContent = card.text;
    card.effect(g, p);

    // After effects, check for win
    if (SPACES[p.pos].type === SPACE_TYPES.END) {
      winGame(p);
      return;
    }

    endTurnBtn.disabled = false;
    return;
  }

  if (s.type === SPACE_TYPES.SUPPORT) {
    const card = drawCard(g, SPACE_TYPES.SUPPORT);
    cardTextEl.textContent = card.text;
    card.effect(g, p);

    endTurnBtn.disabled = false;
    return;
  }
}

function nextTurn(g) {
  g.extraRoll = false;
  g.lastRoll = null;
  lastRollEl.textContent = "-";

  // Advance turn
  g.turnIndex = (g.turnIndex + 1) % g.players.length;
  if (g.turnIndex === 0) g.round += 1;

  // If next player must skip, process skip immediately (but show it clearly)
  let guard = 0;
  while (guard < 10) {
    const p = currentPlayer(g);
    if (p.skipTurns > 0) {
      p.skipTurns -= 1;
      statusLineEl.textContent = `${p.name} loses a turn due to a delay.`;
      // Move to next player
      g.turnIndex = (g.turnIndex + 1) % g.players.length;
      if (g.turnIndex === 0) g.round += 1;
      guard += 1;
      continue;
    }
    break;
  }

  setUIForTurn(g);
  renderBoard(g);
  renderPlayers(g);
}

function rollDie() {
  if (!game) return;
  const p = currentPlayer(game);

  const roll = randi(1, 6);
  game.lastRoll = roll;
  lastRollEl.textContent = String(roll);

  // Move
  movePlayer(game, p, roll);

  // Update UI
  const s = SPACES[p.pos];
  landedTextEl.textContent = `${s.label} (${s.type.toUpperCase()})`;
  statusLineEl.textContent = `${p.name} rolled a ${roll}.`;

  // Apply landing
  applyLanding(game, p);

  // If support gave extra roll
  if (game.extraRoll) {
    noteTextEl.textContent = "You earned an extra roll. Roll again before ending your turn.";
    endTurnBtn.disabled = true;
    rollBtn.disabled = false;
  } else {
    rollBtn.disabled = true;
  }

  renderBoard(game);
  renderPlayers(game);
}

function winGame(player) {
  modalTitle.textContent = `${player.name} reached Treatment`;
  modalBody.textContent =
`You made it to treatment.

Notice what decided the outcome:
- delays (insurance, paperwork, transport) were frequent
- supports were rare but powerful

Takeaway:
Reaching cancer treatment should not depend on luck.`;

  modal.classList.remove("hidden");
}

function resetAll() {
  modal.classList.add("hidden");
  setupCard.classList.remove("hidden");
  actionCard.classList.add("hidden");
  playersCard.classList.add("hidden");
  statusLineEl.textContent = "Press Start Game.";
  game = null;
  renderBoard(null);
}

startBtn.addEventListener("click", () => {
  const count = Number(playerCountEl.value);
  const inputs = [...nameFieldsEl.querySelectorAll("input")].slice(0, count);
  const names = inputs.map((inp, i) => (inp.value || `Player ${i + 1}`).trim());

  game = newGame(names);

  setupCard.classList.add("hidden");
  actionCard.classList.remove("hidden");
  playersCard.classList.remove("hidden");

  modal.classList.add("hidden");

  renderBoard(game);
  renderPlayers(game);
  setUIForTurn(game);

  cardTextEl.textContent = "Roll the die to begin.";
});

rollBtn.addEventListener("click", rollDie);

endTurnBtn.addEventListener("click", () => {
  if (!game) return;
  nextTurn(game);
});

restartBtn.addEventListener("click", () => {
  resetAll();
});

// Initial render
renderBoard(null);
resetAll();
