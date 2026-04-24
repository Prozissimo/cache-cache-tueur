// ====== Cache-cache tueur — client (solo + multi) ======
const socket = io();

// ---------- SCREEN MGMT ----------
const screens = {
  home: document.getElementById('screen-home'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
};
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('active', k === name);
}

// ---------- HOME ----------
const btnSolo = document.getElementById('btn-solo');
const friendsToggle = document.getElementById('friends-toggle');
const friendsPanel = document.getElementById('friends-panel');
const inpName = document.getElementById('inp-name');
const inpCode = document.getElementById('inp-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const homeError = document.getElementById('home-error');

friendsToggle.addEventListener('click', () => {
  const hidden = friendsPanel.style.display === 'none';
  friendsPanel.style.display = hidden ? 'block' : 'none';
});

const savedName = localStorage.getItem('cct-name');
if (savedName) inpName.value = savedName;

function getName() {
  const n = (inpName.value || '').trim();
  if (!n) { homeError.textContent = 'Choisis un pseudo !'; return null; }
  localStorage.setItem('cct-name', n);
  return n;
}

btnSolo.addEventListener('click', () => startSolo());

btnCreate.addEventListener('click', () => {
  const name = getName(); if (!name) return;
  homeError.textContent = '';
  socket.emit('createRoom', { name }, (res) => {
    if (!res.ok) homeError.textContent = res.error || 'Erreur';
  });
});
btnJoin.addEventListener('click', () => {
  const name = getName(); if (!name) return;
  const code = (inpCode.value || '').trim().toUpperCase();
  if (!code) { homeError.textContent = 'Entre un code !'; return; }
  homeError.textContent = '';
  socket.emit('joinRoom', { name, code }, (res) => {
    if (!res.ok) homeError.textContent = res.error || 'Erreur';
  });
});

// ---------- CANVAS / MAP ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const WORLD_W = 1200, WORLD_H = 800;

const WALLS = [
  {x:0, y:0, w:WORLD_W, h:20},
  {x:0, y:WORLD_H-20, w:WORLD_W, h:20},
  {x:0, y:0, w:20, h:WORLD_H},
  {x:WORLD_W-20, y:0, w:20, h:WORLD_H},
  {x:20,  y:390, w:330, h:20},
  {x:470, y:390, w:260, h:20},
  {x:850, y:390, w:330, h:20},
  {x:390, y:20,  w:20, h:240},
  {x:790, y:20,  w:20, h:240},
  {x:390, y:540, w:20, h:240},
  {x:790, y:540, w:20, h:240},
  {x:180, y:180, w:60, h:40},
  {x:960, y:180, w:60, h:40},
  {x:180, y:580, w:60, h:40},
  {x:960, y:580, w:60, h:40},
  {x:560, y:200, w:80, h:20},
  {x:560, y:580, w:80, h:20},
];

const HIDE_SPOTS = [
  {x:60,  y:60,  w:50, h:50, kind:'placard'},
  {x:1090,y:60,  w:50, h:50, kind:'placard'},
  {x:60,  y:690, w:50, h:50, kind:'carton'},
  {x:1090,y:690, w:50, h:50, kind:'buisson'},
  {x:575, y:60,  w:50, h:50, kind:'placard'},
  {x:575, y:690, w:50, h:50, kind:'buisson'},
];

const ROOMS = [
  {x:20,  y:20,  w:370, h:370, color:'#2d3a6e', label:'🛏️ Chambre'},
  {x:410, y:20,  w:380, h:370, color:'#3d2d6e', label:'🚪 Couloir'},
  {x:810, y:20,  w:370, h:370, color:'#6e4a2d', label:'🍳 Cuisine'},
  {x:20,  y:410, w:370, h:370, color:'#2d6e4a', label:'📦 Sous-sol'},
  {x:410, y:410, w:380, h:370, color:'#6e2d5a', label:'🚪 Couloir'},
  {x:810, y:410, w:370, h:370, color:'#4a6e2d', label:'🌳 Jardin'},
];

const PLAYER_R = 16;

function collidesWalls(x, y, r = PLAYER_R) {
  for (const w of WALLS) {
    const cx = Math.max(w.x, Math.min(x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(y, w.y + w.h));
    const dx = x - cx, dy = y - cy;
    if (dx*dx + dy*dy < r * r) return true;
  }
  return false;
}

function findSafeSpot(minDist, from) {
  for (let i = 0; i < 200; i++) {
    const x = 60 + Math.random() * (WORLD_W - 120);
    const y = 60 + Math.random() * (WORLD_H - 120);
    if (collidesWalls(x, y)) continue;
    if (from && Math.hypot(x - from.x, y - from.y) < minDist) continue;
    return { x, y };
  }
  return { x: 600, y: 400 };
}

// ---------- STATE ----------
let mode = null; // 'solo' | 'multi'
let myId = null;
let roomState = null;

// entités solo (et aussi utilisé en multi pour l'affichage joueurs)
let players = new Map();
let bots = [];
const lasers = []; // {x,y,angle,dist,color,ttl}
const puffs = []; // {x,y,ttl} effet quand un méchant disparaît
const keys = { up:false, down:false, left:false, right:false };
let joyActive = false, joyDX = 0, joyDY = 0;
let camX = 0, camY = 0;
let lastMoveDir = { x: 1, y: 0 }; // pour viser si aucun ennemi
let soloWon = false;

// ---------- SOLO ----------
function startSolo() {
  mode = 'solo';
  myId = 'me';
  soloWon = false;

  const me = {
    id: 'me',
    name: 'Toi',
    color: '#ffe14f',
    x: 600, y: 400, rx: 600, ry: 400,
    angle: 0,
    alive: true,
  };
  players = new Map([[myId, me]]);

  // 4 méchants, un par pièce non centrale
  const spawnRooms = [
    { x: 200, y: 200 }, { x: 1000, y: 200 },
    { x: 200, y: 600 }, { x: 1000, y: 600 },
  ];
  bots = spawnRooms.map((s, i) => ({
    id: 'bot' + i,
    name: 'Méchant',
    color: '#ff4f4f',
    x: s.x, y: s.y, rx: s.x, ry: s.y,
    angle: 0,
    alive: true,
    // IA
    dirX: (Math.random() < 0.5 ? -1 : 1),
    dirY: (Math.random() < 0.5 ? -1 : 1),
    changeAt: 0,
    speed: 70 + Math.random() * 40,
  }));

  document.getElementById('win-overlay').style.display = 'none';
  document.getElementById('gameover-overlay').style.display = 'none';
  updateBadieCount();

  showScreen('game');
  resizeCanvas();
  lastT = 0;
  requestAnimationFrame(loop);
}

document.getElementById('btn-replay').addEventListener('click', () => startSolo());

function updateBadieCount() {
  const left = bots.filter(b => b.alive).length;
  const el = document.getElementById('badies-left');
  if (el) el.textContent = left;
}

function updateBots(dt, t) {
  for (const b of bots) {
    if (!b.alive) continue;
    if (t > b.changeAt) {
      b.dirX = (Math.random() * 2 - 1);
      b.dirY = (Math.random() * 2 - 1);
      const m = Math.hypot(b.dirX, b.dirY) || 1;
      b.dirX /= m; b.dirY /= m;
      b.changeAt = t + 1000 + Math.random() * 2000;
    }
    const nx = b.x + b.dirX * b.speed * dt;
    const ny = b.y + b.dirY * b.speed * dt;
    if (!collidesWalls(nx, b.y)) b.x = nx; else b.dirX = -b.dirX;
    if (!collidesWalls(b.x, ny)) b.y = ny; else b.dirY = -b.dirY;
    b.rx = b.x; b.ry = b.y;
    b.angle = Math.atan2(b.dirY, b.dirX);
  }
}

function soloShoot() {
  const me = players.get(myId);
  if (!me || !me.alive) return;
  // cible = bot vivant le plus proche dans la ligne de vue (max 700)
  let best = null, bestD = 700;
  for (const b of bots) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - me.x, b.y - me.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  let angle;
  if (best) {
    angle = Math.atan2(best.y - me.y, best.x - me.x);
  } else {
    angle = Math.atan2(lastMoveDir.y, lastMoveDir.x);
  }
  const dist = best ? bestD : 400;
  lasers.push({ x: me.x, y: me.y, angle, dist, color: '#ffe14f', ttl: 1 });

  if (best) {
    best.alive = false;
    puffs.push({ x: best.x, y: best.y, ttl: 1 });
    updateBadieCount();
    if (bots.every(b => !b.alive) && !soloWon) {
      soloWon = true;
      setTimeout(() => {
        document.getElementById('win-overlay').style.display = 'flex';
      }, 500);
    }
  }
}

// ---------- MULTI (lobby + game via socket) ----------
const roomCodeEl = document.getElementById('room-code');
const playerListEl = document.getElementById('player-list');
const playerCountEl = document.getElementById('player-count');
const hostControls = document.getElementById('host-controls');
const waitHost = document.getElementById('wait-host');
const btnStart = document.getElementById('btn-start');
btnStart.addEventListener('click', () => socket.emit('startGame'));

function renderLobby(room) {
  roomCodeEl.textContent = room.code;
  playerCountEl.textContent = `(${room.players.length}/10)`;
  playerListEl.innerHTML = '';
  for (const p of room.players) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="pl-dot" style="background:${p.color}"></span>
      <span class="pl-name">${escapeHtml(p.name)}</span>
      ${p.id === room.hostId ? '<span class="pl-tag">👑 chef</span>' : ''}
    `;
    playerListEl.appendChild(li);
  }
  const isHost = room.hostId === myId;
  hostControls.style.display = isHost ? 'block' : 'none';
  waitHost.style.display = isHost ? 'none' : 'block';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

socket.on('joined', ({ code, youId }) => {
  mode = 'multi';
  myId = youId;
  showScreen('lobby');
});
socket.on('roomUpdate', (room) => {
  roomState = room;
  if (screens.lobby.classList.contains('active')) renderLobby(room);
});
socket.on('errorMsg', (msg) => alert(msg));

socket.on('gameStart', (room) => {
  players = new Map(room.players.map(p => [p.id, { ...p, rx: p.x, ry: p.y }]));
  bots = [];
  document.getElementById('win-overlay').style.display = 'none';
  document.getElementById('gameover-overlay').style.display = 'none';
  showScreen('game');
  resizeCanvas();
  lastT = 0;
  requestAnimationFrame(loop);
});
socket.on('snapshot', (snap) => {
  if (mode !== 'multi') return;
  for (const p of snap) {
    const existing = players.get(p.id);
    if (existing) {
      existing.tx = p.x; existing.ty = p.y;
      existing.angle = p.angle;
      existing.alive = p.alive;
      existing.hiding = p.hiding;
    } else {
      players.set(p.id, { ...p, rx: p.x, ry: p.y, tx: p.x, ty: p.y });
    }
  }
});
socket.on('laser', (l) => lasers.push({ ...l, ttl: 1 }));
socket.on('eliminated', ({ id }) => {
  const p = players.get(id);
  if (p) p.alive = false;
});
socket.on('gameOver', ({ winner, reveal }) => {
  const title = winner === 'gentils' ? '🎉 Les GENTILS gagnent !' : '😈 Les IMPOSTEURS gagnent !';
  document.getElementById('winner-title').textContent = title;
  const list = document.getElementById('reveal-list');
  list.innerHTML = '';
  for (const r of reveal) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(r.name)}</span><span class="r-${r.role}">${r.role === 'imposteur' ? '😈 Imposteur' : '😇 Gentil'}</span>`;
    list.appendChild(li);
  }
  const isHost = roomState && roomState.hostId === myId;
  document.getElementById('btn-again').style.display = isHost ? 'inline-block' : 'none';
  document.getElementById('wait-again').style.display = isHost ? 'none' : 'block';
  document.getElementById('gameover-overlay').style.display = 'flex';
});
document.getElementById('btn-again').addEventListener('click', () => socket.emit('returnLobby'));
socket.on('backToLobby', () => {
  document.getElementById('gameover-overlay').style.display = 'none';
  showScreen('lobby');
  if (roomState) renderLobby(roomState);
});

// ---------- INPUT ----------
window.addEventListener('keydown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyZ') keys.up = true;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = true;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'Space') { e.preventDefault(); fireShot(); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyZ') keys.up = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

function fireShot() {
  if (mode === 'solo') { soloShoot(); return; }
  const me = players.get(myId);
  if (!me || !me.alive) return;
  // multi : viser sur l'ennemi vivant le plus proche, sinon direction de mouvement
  let best = null, bestD = 600;
  for (const p of players.values()) {
    if (p.id === myId || !p.alive) continue;
    const d = Math.hypot(p.rx - me.rx, p.ry - me.ry);
    if (d < bestD) { bestD = d; best = p; }
  }
  const angle = best
    ? Math.atan2(best.ry - me.ry, best.rx - me.rx)
    : Math.atan2(lastMoveDir.y, lastMoveDir.x);
  socket.emit('shoot', { angle });
}

// --- joystick mobile ---
const joystick = document.getElementById('joystick');
const joyStick = document.getElementById('joy-stick');
if (joystick) {
  const onStart = (e) => {
    joyActive = true;
    const t = e.touches ? e.touches[0] : e;
    updateJoy(t);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!joyActive) return;
    const t = e.touches ? e.touches[0] : e;
    updateJoy(t);
    e.preventDefault();
  };
  const onEnd = () => {
    joyActive = false; joyDX = 0; joyDY = 0;
    joyStick.style.transform = 'translate(-50%,-50%)';
  };
  function updateJoy(t) {
    const r = joystick.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const mag = Math.hypot(dx, dy);
    const max = r.width/2;
    if (mag > max) { dx = dx/mag*max; dy = dy/mag*max; }
    joyStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joyDX = dx/max; joyDY = dy/max;
  }
  joystick.addEventListener('touchstart', onStart);
  joystick.addEventListener('touchmove', onMove);
  joystick.addEventListener('touchend', onEnd);
  joystick.addEventListener('touchcancel', onEnd);
}
const btnFire = document.getElementById('btn-fire');
if (btnFire) btnFire.addEventListener('click', fireShot);

// ---------- LOOP ----------
let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  update(dt, t);
  render();
  requestAnimationFrame(loop);
}

function update(dt, t) {
  const me = players.get(myId);
  if (!me) return;

  // interp multi
  if (mode === 'multi') {
    for (const p of players.values()) {
      if (p.id === myId) continue;
      if (p.tx == null) continue;
      p.rx += (p.tx - p.rx) * 0.25;
      p.ry += (p.ty - p.ry) * 0.25;
    }
  }

  // bots solo
  if (mode === 'solo') updateBots(dt, t);

  // mouvement joueur
  if (me.alive) {
    let dx = 0, dy = 0;
    if (keys.up) dy -= 1; if (keys.down) dy += 1;
    if (keys.left) dx -= 1; if (keys.right) dx += 1;
    if (joyActive) { dx += joyDX; dy += joyDY; }
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }

    if (mag > 0.1) { lastMoveDir = { x: dx, y: dy }; }

    const speed = 220;
    const nx = me.rx + dx * speed * dt;
    const ny = me.ry + dy * speed * dt;
    if (!collidesWalls(nx, me.ry)) me.rx = nx;
    if (!collidesWalls(me.rx, ny)) me.ry = ny;
    me.x = me.rx; me.y = me.ry;

    // viser automatiquement l'ennemi le plus proche
    const enemies = mode === 'solo'
      ? bots.filter(b => b.alive)
      : [...players.values()].filter(p => p.id !== myId && p.alive);
    let best = null, bestD = 700;
    for (const e of enemies) {
      const d = Math.hypot(e.rx - me.rx, e.ry - me.ry);
      if (d < bestD) { bestD = d; best = e; }
    }
    me.angle = best
      ? Math.atan2(best.ry - me.ry, best.rx - me.rx)
      : Math.atan2(lastMoveDir.y, lastMoveDir.x);

    // envoi serveur (multi seulement)
    if (mode === 'multi' && (!me._lastSent || t - me._lastSent > 50)) {
      me._lastSent = t;
      socket.emit('move', { x: me.rx, y: me.ry, angle: me.angle, hiding: false });
    }
  }

  for (const l of lasers) l.ttl -= dt * 2.5;
  for (let i = lasers.length - 1; i >= 0; i--) if (lasers[i].ttl <= 0) lasers.splice(i, 1);
  for (const pu of puffs) pu.ttl -= dt * 1.5;
  for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].ttl <= 0) puffs.splice(i, 1);

  camX = me.rx - canvas.width / 2;
  camY = me.ry - canvas.height / 2;
}

// ---------- RENDER ----------
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

function drawCharacter(p, t) {
  if (!p.alive) {
    ctx.fillStyle = '#888';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💤', 0, -20);
    ctx.textAlign = 'left';
    return;
  }
  // ombre
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, PLAYER_R - 2, PLAYER_R, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // corps
  ctx.fillStyle = p.color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // yeux cartoon
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-5, -3, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -3, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(-5, -3, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -3, 2, 0, Math.PI*2); ctx.fill();
  // pistolet
  ctx.rotate(p.angle || 0);
  ctx.fillStyle = '#222';
  ctx.fillRect(10, -4, 16, 8);
  ctx.fillStyle = '#ffe14f';
  ctx.fillRect(24, -3, 4, 6);
  ctx.rotate(-(p.angle || 0));
}

function render() {
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-camX, -camY);

  // pièces
  for (const r of ROOMS) {
    ctx.fillStyle = r.color;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(r.label, r.x + 14, r.y + 30);
  }

  // cachettes
  for (const h of HIDE_SPOTS) {
    ctx.fillStyle = h.kind === 'buisson' ? '#2e8b2e' : h.kind === 'carton' ? '#a67040' : '#6e4a2d';
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = '#fff';
    ctx.font = '26px sans-serif';
    ctx.fillText(h.kind === 'buisson' ? '🌿' : h.kind === 'carton' ? '📦' : '🚪', h.x + 10, h.y + 36);
  }

  // murs
  for (const w of WALLS) {
    ctx.fillStyle = '#f4e9d8';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = '#8b6f47';
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  // lasers
  for (const l of lasers) {
    const x2 = l.x + Math.cos(l.angle) * l.dist;
    const y2 = l.y + Math.sin(l.angle) * l.dist;
    ctx.globalAlpha = Math.max(0, l.ttl);
    ctx.strokeStyle = l.color || '#ffe14f';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // bots (solo)
  for (const b of bots) {
    ctx.save();
    ctx.translate(b.rx, b.ry);
    drawCharacter(b);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText('😈 ' + b.name, 0, -24);
    ctx.fillText('😈 ' + b.name, 0, -24);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // joueurs
  for (const p of players.values()) {
    const isMe = p.id === myId;
    ctx.save();
    ctx.translate(p.rx, p.ry);
    drawCharacter(p);
    ctx.fillStyle = isMe ? '#ffe14f' : '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText(p.name || '', 0, -24);
    ctx.fillText(p.name || '', 0, -24);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // puffs (disparition bots)
  for (const pu of puffs) {
    ctx.globalAlpha = Math.max(0, pu.ttl);
    ctx.fillStyle = '#fff';
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💫', pu.rx || pu.x, (pu.ry || pu.y) - 10);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
