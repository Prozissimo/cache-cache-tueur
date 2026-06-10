// ====== Chasseur de Mutants — plateformer cartoon (solo) ======
// ESPACE = sauter · ENTRÉE = tirer · ⬅️➡️ = bouger · marche sur les coffres pour changer d'arme.
// 12 niveaux, un décor différent par niveau, un mini-boss à la fin de chacun + un boss final.

const TAU = Math.PI * 2;
const screens = { home: document.getElementById('screen-home'), game: document.getElementById('screen-game') };
function showScreen(name) { for (const k in screens) screens[k].classList.toggle('active', k === name); }

// ---------- AUDIO ----------
let actx = null;
function initAudio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } } if (actx && actx.state === 'suspended') actx.resume(); }
function blip(freq, dur, type = 'square', vol = 0.12) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, actx.currentTime); g.gain.setValueAtTime(vol, actx.currentTime);
  o.connect(g); g.connect(actx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur); o.stop(actx.currentTime + dur);
}
function slide(f1, f2, dur, type = 'square', vol = 0.12) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, actx.currentTime); o.frequency.exponentialRampToValueAtTime(f2, actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime); o.connect(g); g.connect(actx.destination); o.start();
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur); o.stop(actx.currentTime + dur);
}
const sfx = {
  jump: () => slide(420, 720, 0.13, 'square', 0.09), shoot: () => slide(880, 320, 0.10, 'square', 0.08),
  throw: () => slide(300, 520, 0.12, 'square', 0.09), hit: () => slide(260, 90, 0.10, 'sawtooth', 0.12),
  pop: () => slide(320, 70, 0.18, 'sawtooth', 0.14), coin: () => { blip(880, 0.07, 'square', 0.09); setTimeout(() => blip(1320, 0.11, 'square', 0.09), 60); },
  chest: () => { [523, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'square', 0.10), i * 90)); },
  hurt: () => slide(360, 110, 0.30, 'sawtooth', 0.15), win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'square', 0.11), i * 110)); },
  flag: () => { [659, 880].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'square', 0.11), i * 120)); },
};

// ---------- CANVAS ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const TILE = 16;
function rr(x, y, w, h, r) {
  if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
  ctx.beginPath(); ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y); ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
  ctx.lineTo(x + w, y + h - r.br); ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
  ctx.lineTo(x + r.bl, y + h); ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
  ctx.lineTo(x, y + r.tl); ctx.arcTo(x, y, x + r.tl, y, r.tl); ctx.closePath();
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.closePath(); }
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- WEAPONS ----------
const WEAPONS = {
  pistol: { icon: '🔫', cd: 0.30, speed: 480, dmg: 1, kind: 'bullet' },
  axe: { icon: '🪓', cd: 0.46, speed: 360, dmg: 2, kind: 'axe' },
  triple: { icon: '🔱', cd: 0.42, speed: 470, dmg: 1, kind: 'bullet', spread: 3 },
  rocket: { icon: '🚀', cd: 0.80, speed: 320, dmg: 3, kind: 'rocket', aoe: 34 },
};

// ---------- THÈMES (1 décor par niveau) ----------
const THEMES = [
  { name: 'Prairie', sky: ['#2b86c8', '#5fb4e6', '#bfe6f5'], light: 'sun', mtn: '#7d74b8', snow: '#eef0ff', hillA: '#5aa86a', hillB: '#4a9a44', grass: ['#5fbf4a', '#3f9a36'], blade: '#4eae3e', dirt: ['#9a6a3b', '#603c1c'], foliage: ['#5fc257', '#2e7d33'], trunk: ['#7a4f2c', '#4a2f16'], tree: 'round', decor: ['tree', 'tree', 'bush', 'rock', 'grass', 'grass', 'crate'], weather: 'none' },
  { name: 'Désert', sky: ['#5ab0e0', '#a8d6ec', '#ffe6b0'], light: 'sun', mtn: '#caa46a', snow: '#f3e6c8', hillA: '#e3c47e', hillB: '#d4ad62', grass: ['#e6c87a', '#caa251'], blade: '#caa251', dirt: ['#d2a45f', '#a87a3c'], foliage: ['#5fae4a', '#3c8a2c'], trunk: ['#9a7a4a', '#6e5630'], tree: 'cactus', decor: ['cactus', 'cactus', 'rock', 'rock', 'grass', 'barrel'], weather: 'none' },
  { name: 'Forêt d\'automne', sky: ['#5a9fc8', '#9ec8e0', '#f0dcc0'], light: 'sun', mtn: '#9a7a8a', snow: '#f0e4ea', hillA: '#c98a4a', hillB: '#a86a35', grass: ['#7aae3f', '#5a8a2f'], blade: '#5a8a2f', dirt: ['#9a6a3b', '#603c1c'], foliage: ['#ff9a3d', '#d4632a'], trunk: ['#7a4f2c', '#4a2f16'], tree: 'round', decor: ['tree', 'tree', 'tree', 'bush', 'rock', 'grass'], weather: 'leaves' },
  { name: 'Montagnes enneigées', sky: ['#7fb8e0', '#bfe0f0', '#eef6ff'], light: 'sun', mtn: '#cfe0ee', snow: '#ffffff', hillA: '#dceaf2', hillB: '#c4d8e6', grass: ['#eaf4fb', '#c2d8e6'], blade: '#cfe0ee', dirt: ['#b8c0cc', '#8a94a3'], foliage: ['#3f9e6a', '#2a7d4a'], trunk: ['#6e4a2c', '#4a2f16'], tree: 'pine', decor: ['pine', 'pine', 'rock', 'rock', 'grass'], weather: 'snow' },
  { name: 'Jungle', sky: ['#2f9aa8', '#5fc0b0', '#bfeacf'], light: 'sun', mtn: '#3a7a5a', snow: '#cfeede', hillA: '#2f8a4a', hillB: '#216e38', grass: ['#46b84a', '#2e8a33'], blade: '#2e8a33', dirt: ['#6e5a2c', '#4a3c16'], foliage: ['#3fc25a', '#1f7d33'], trunk: ['#5f4a2c', '#3a2c16'], tree: 'round', decor: ['tree', 'tree', 'tree', 'bush', 'bush', 'grass'], weather: 'none' },
  { name: 'Nuit étoilée', sky: ['#0e1330', '#1f2b55', '#3a4a78'], light: 'moon', mtn: '#2a2f55', snow: '#9aa6d0', hillA: '#243a5a', hillB: '#1c2e4a', grass: ['#2f6e3a', '#1f4a28'], blade: '#2f6e3a', dirt: ['#4a3a28', '#2e2416'], foliage: ['#2f8a44', '#1c5a2c'], trunk: ['#4a3520', '#2a1c10'], tree: 'round', decor: ['tree', 'bush', 'rock', 'grass'], weather: 'none' },
  { name: 'Grotte de cristal', sky: ['#1a1426', '#2a2038', '#3a2e4a'], light: 'dim', mtn: null, snow: '#fff', hillA: '#2e2440', hillB: '#241c33', grass: ['#5a4a6a', '#3e3350'], blade: '#6a5a7a', dirt: ['#4a3f5a', '#2e2640'], foliage: ['#6fd0c0', '#3f9a8a'], trunk: ['#5a4a6a', '#3a2f4a'], tree: 'round', decor: ['crystal', 'crystal', 'rock', 'rock', 'crystal'], weather: 'none' },
  { name: 'Plage', sky: ['#3fb0e0', '#7fd0ec', '#cfeeff'], light: 'sun', mtn: '#9ad0e0', snow: '#eaf6ff', hillA: '#7ad0c0', hillB: '#5fc0b0', grass: ['#f0e0a8', '#d8c078'], blade: '#d8c078', dirt: ['#e6cf90', '#c2a45f'], foliage: ['#5fc257', '#2e7d33'], trunk: ['#7a4f2c', '#4a2f16'], tree: 'round', decor: ['tree', 'rock', 'grass', 'barrel', 'crate'], weather: 'none' },
  { name: 'Volcan', sky: ['#3a1418', '#7a2a20', '#c25a2a'], light: 'dim', mtn: '#4a2420', snow: '#ff7a3d', hillA: '#5a241c', hillB: '#3e1814', grass: ['#6a3528', '#4a221a'], blade: '#8a4030', dirt: ['#5a2f22', '#3a1c14'], foliage: ['#8a4030', '#5a241c'], trunk: ['#3a241c', '#241410'], tree: 'dead', decor: ['deadtree', 'rock', 'rock', 'deadtree'], weather: 'ember' },
  { name: 'Pays des bonbons', sky: ['#ff9ad0', '#ffc0e0', '#fff0f6'], light: 'sun', mtn: '#d89ae0', snow: '#fff0fa', hillA: '#ff9ec8', hillB: '#f07ab0', grass: ['#ff8ac0', '#e85fa0'], blade: '#ff8ac0', dirt: ['#d98ac0', '#b05f95'], foliage: ['#ff8ac0', '#e85fa0'], trunk: ['#caa0d0', '#9a70a8'], tree: 'round', decor: ['tree', 'tree', 'bush', 'grass', 'grass'], weather: 'none' },
  { name: 'Marais', sky: ['#3a4a3a', '#5a6e4a', '#8a9a6a'], light: 'dim', mtn: '#3a4a3a', snow: '#cfe0c0', hillA: '#4a5e3a', hillB: '#3a4e2e', grass: ['#5a7a3a', '#3e5a26'], blade: '#5a7a3a', dirt: ['#4a3f2c', '#2e2818'], foliage: ['#5a7a3a', '#3e5a26'], trunk: ['#4a3a28', '#2a2016'], tree: 'dead', decor: ['deadtree', 'bush', 'rock', 'grass'], weather: 'none' },
  { name: 'Château du Boss', sky: ['#1a0e26', '#2e1a40', '#5a2a55'], light: 'moon', mtn: '#2a1a3a', snow: '#caa0e0', hillA: '#2e1c40', hillB: '#241430', grass: ['#4a3a5a', '#2e2440'], blade: '#5a4a6a', dirt: ['#3a2f4a', '#241c33'], foliage: ['#7a4a8a', '#4a2a5a'], trunk: ['#4a3a28', '#2a2016'], tree: 'dead', decor: ['deadtree', 'crystal', 'rock', 'crystal'], weather: 'ember' },
];
let theme = THEMES[0];

// ---------- LEVELS ----------
function makeLevel(W) {
  const H = 14;
  const solid = Array.from({ length: H }, () => new Array(W).fill(0));
  const ents = [];
  const lv = {
    W, H, solid, ents, startX: 2, startY: 10, flagX: W - 3, flagY: 10, flagSet: false, hasBoss: false,
    ground(x0, x1, top = 11) { for (let x = x0; x <= x1; x++) for (let y = top; y < H; y++) solid[y][x] = 1; return lv; },
    plat(x0, x1, y) { for (let x = x0; x <= x1; x++) solid[y][x] = 2; return lv; },
    coin(x, y) { ents.push({ type: 'coin', x, y }); return lv; },
    coinRow(x0, x1, y) { for (let x = x0; x <= x1; x++) ents.push({ type: 'coin', x, y }); return lv; },
    enemy(x, y) { ents.push({ type: 'enemy', x, y }); return lv; },
    flyer(x, y) { ents.push({ type: 'flyer', x, y }); return lv; },
    boss(x, y, hp) { ents.push({ type: 'boss', x, y, hp }); lv.hasBoss = true; return lv; },
    chest(x, y, w) { ents.push({ type: 'chest', x, y, weapon: w }); return lv; },
    spike(x0, x1, y = 13) { for (let x = x0; x <= x1; x++) solid[y][x] = 3; return lv; },
    start(x, y) { lv.startX = x; lv.startY = y; return lv; },
    flag(x, y) { lv.flagX = x; lv.flagY = y; lv.flagSet = true; return lv; },
  };
  return lv;
}

// génère un niveau plateforme avec mini-boss + drapeau
function genLevel(idx) {
  const W = 56 + idx * 5;
  const lv = makeLevel(W);
  const R = rng(700 + idx * 131);
  const top = 11, endArena = W - 12;
  let x = 0; const segs = [];
  while (x < endArena) {
    const segLen = 5 + Math.floor(R() * 7);
    const x1 = Math.min(endArena - 1, x + segLen - 1);
    lv.ground(x, x1, top); segs.push([x, x1]);
    let gap = 2 + Math.floor(R() * 2);
    if (x < 6) gap = 0;
    x = x1 + 1 + gap;
  }
  lv.ground(endArena, W - 1, top); segs.push([endArena, W - 1]);
  lv.start(2, 10);
  for (const [s0, s1] of segs) {
    if (s1 - s0 >= 4 && R() < 0.75) {
      const pw = 2 + Math.floor(R() * 3);
      const p0 = s0 + 1 + Math.floor(R() * Math.max(1, (s1 - s0 - pw - 1)));
      const py = 6 + Math.floor(R() * 3);
      lv.plat(p0, Math.min(p0 + pw, s1 - 1), py);
      lv.coinRow(p0, Math.min(p0 + pw, s1 - 1), py - 1);
    }
    if (R() < 0.6 && s1 > s0) lv.coin(s0 + 1 + Math.floor(R() * (s1 - s0)), top - 1);
  }
  const nWalk = 2 + Math.floor(idx * 0.5);
  for (let i = 0; i < nWalk; i++) { const seg = segs[Math.floor(R() * (segs.length - 1))]; if (seg && seg[1] - seg[0] >= 2) lv.enemy(seg[0] + 1 + Math.floor(R() * (seg[1] - seg[0] - 1)), top - 1); }
  const nFly = 1 + Math.floor(idx * 0.4);
  for (let i = 0; i < nFly; i++) lv.flyer(8 + Math.floor(R() * Math.max(2, endArena - 10)), 5 + Math.floor(R() * 2));
  for (let i = 1; i < segs.length; i++) { const gs = segs[i - 1][1] + 1, ge = segs[i][0] - 1; if (ge >= gs && R() < 0.5) lv.spike(gs, ge, 13); }
  const wlist = ['axe', 'triple', 'rocket'];
  const cs = segs[Math.max(1, Math.floor(segs.length / 2))];
  lv.chest(cs[0] + 1, top - 1, wlist[idx % 3]);
  lv.boss(W - 6, top - 1, 4 + Math.floor(idx * 1.2));
  lv.flag(W - 2, top - 1);
  return lv;
}

function genBossArena() {
  const W = 46; const lv = makeLevel(W);
  lv.ground(0, W - 1, 11);
  lv.plat(7, 10, 7).plat(35, 38, 7);
  lv.coinRow(7, 10, 6).coinRow(35, 38, 6).coin(5, 9).coin(40, 9);
  lv.chest(3, 10, 'rocket').chest(43, 10, 'triple');
  lv.boss(22, 10, 24);
  lv.start(2, 10);
  return lv; // pas de drapeau -> arène de boss
}

const LEVELS = [];
for (let i = 0; i < 11; i++) LEVELS.push(genLevel(i));
LEVELS.push(genBossArena());

// ---------- STATE ----------
let levelIndex = 0, level = null, hero = null;
let mutants = [], coins = [], chests = [], decor = [], runs = [], bossRef = null;
const particles = [], bullets = [], floaters = [], eBullets = [];
let coinCount = 0, totalCoins = 0, lives = 3, gameTime = 0;
let state = 'play';
let scale = 4, camX = 0, camY = 0;

const PHYS = { GRAVITY: 1500, MAX_FALL: 640, ACCEL: 900, MAX_RUN: 130, FRICTION: 1100, AIR_ACCEL: 650, JUMP_V: -460, COYOTE: 0.09, BUFFER: 0.12, MUT_SPEED: 32 };
const input = { left: false, right: false, jump: false, fire: false, _jumpPrev: false };

function isSolidTile(tx, ty) {
  if (tx < 0) return true; if (tx >= level.W) return false;
  if (ty < 0 || ty >= level.H) return false;
  const t = level.solid[ty][tx]; return t === 1 || t === 2;
}
function makeBody(x, y, w, h) { return { px: x, py: y, vx: 0, vy: 0, w, h, onGround: false, hitX: false, dir: 1 }; }
function collideAxis(o, axis) {
  const left = Math.floor(o.px / TILE), right = Math.floor((o.px + o.w - 1) / TILE);
  const top = Math.floor(o.py / TILE), bottom = Math.floor((o.py + o.h - 1) / TILE);
  for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) {
    if (!isSolidTile(tx, ty)) continue;
    if (axis === 'x') { if (o.vx > 0) o.px = tx * TILE - o.w; else if (o.vx < 0) o.px = (tx + 1) * TILE; o.vx = 0; o.hitX = true; }
    else { if (o.vy > 0) { o.py = ty * TILE - o.h; o.onGround = true; } else if (o.vy < 0) o.py = (ty + 1) * TILE; o.vy = 0; }
  }
}
function moveBody(o, dt) { o.hitX = false; o.px += o.vx * dt; collideAxis(o, 'x'); o.onGround = false; o.py += o.vy * dt; collideAxis(o, 'y'); }

function computeRuns() {
  const W = level.W, H = level.H, S = level.solid;
  const colSpans = [];
  for (let x = 0; x < W; x++) {
    const spans = []; let y = 0;
    while (y < H) { if (S[y][x] === 1 || S[y][x] === 2) { const ys = y; while (y < H && (S[y][x] === 1 || S[y][x] === 2)) y++; spans.push([ys, y - 1]); } else y++; }
    colSpans.push(spans);
  }
  const used = colSpans.map(s => s.map(() => false));
  runs = [];
  for (let x = 0; x < W; x++) for (let si = 0; si < colSpans[x].length; si++) {
    if (used[x][si]) continue;
    const ys = colSpans[x][si][0]; let ye = colSpans[x][si][1], x1 = x; used[x][si] = true; let nx = x + 1;
    while (nx < W) { const idx = colSpans[nx].findIndex((sp, j) => !used[nx][j] && sp[0] === ys); if (idx < 0) break; used[nx][idx] = true; ye = Math.max(ye, colSpans[nx][idx][1]); x1 = nx; nx++; }
    runs.push({ x0: x, x1, top: ys, bot: ye });
  }
}

function buildDecor() {
  decor = [];
  const r = rng(1000 + levelIndex * 77);
  const W = level.W, H = level.H, S = level.solid;
  const taken = chests.map(c => Math.round(c.x / TILE));
  for (let x = 1; x < W - 1; x++) {
    let surf = -1;
    for (let y = 1; y < H; y++) if ((S[y][x] === 1 || S[y][x] === 2) && S[y - 1][x] === 0) { surf = y; break; }
    if (surf < 0) continue;
    if (Math.abs(x - level.startX) < 2 || Math.abs(x - level.flagX) < 2) continue;
    if (taken.some(t => Math.abs(t - x) < 2)) continue;
    if (r() > 0.5) continue;
    const gy = surf * TILE;
    const t = theme.decor[Math.floor(r() * theme.decor.length)];
    const back = (t === 'tree' || t === 'pine' || t === 'deadtree' || t === 'cactus') && r() < 0.5;
    decor.push({ t, x: x * TILE + 8, y: gy, s: 0.8 + r() * 0.5, back });
  }
}

function equipWeapon(w) { hero.weapon = w; hero.fireT = 0; updateHud(); }

function loadLevel(i) {
  levelIndex = i; level = LEVELS[i]; theme = THEMES[i % THEMES.length];
  hero = makeBody(level.startX * TILE + 3, level.startY * TILE + 2, 10, 14);
  hero.face = 1; hero.coyote = 0; hero.buffer = 0; hero.invuln = 0; hero.fireT = 0; hero.recoil = 0; hero.weapon = 'pistol'; hero.anim = 0;
  mutants = []; coins = []; chests = []; bossRef = null;
  bullets.length = 0; particles.length = 0; floaters.length = 0; eBullets.length = 0;
  let mi = 0;
  for (const e of level.ents) {
    if (e.type === 'enemy') {
      const big = (mi % 3 === 2); const w = big ? 18 : 13, h = big ? 17 : 13;
      const b = makeBody(e.x * TILE + (16 - w) / 2, (e.y + 1) * TILE - h, w, h);
      b.type = 'walk'; b.dir = -1; b.hp = big ? 2 : 1; b.maxhp = b.hp; b.big = big; b.flash = 0; b.wob = mi * 1.3;
      mutants.push(b); mi++;
    } else if (e.type === 'flyer') {
      const w = 14, h = 12; const b = makeBody(e.x * TILE + 1, e.y * TILE, w, h);
      b.type = 'fly'; b.hp = 1; b.maxhp = 1; b.dir = 1; b.flash = 0; b.wob = mi * 1.3;
      b.baseY = e.y * TILE; b.minX = Math.max(TILE, (e.x - 4) * TILE); b.maxX = Math.min((level.W - 2) * TILE, (e.x + 4) * TILE); b.t = mi;
      mutants.push(b); mi++;
    } else if (e.type === 'boss') {
      const hp = e.hp || 14; const w = 32 + Math.round(Math.min(20, hp)), h = 28 + Math.round(Math.min(16, hp));
      const b = makeBody(e.x * TILE - w / 2, (e.y + 1) * TILE - h, w, h);
      b.type = 'boss'; b.hp = hp; b.maxhp = hp; b.dir = -1; b.big = true; b.flash = 0; b.wob = 0; b.bt = 2.2; b.action = 0;
      mutants.push(b); bossRef = b;
    } else if (e.type === 'coin') {
      coins.push({ x: e.x * TILE + 8, y: e.y * TILE + 8, got: false, ph: (e.x + e.y) * 0.7 });
    } else if (e.type === 'chest') {
      chests.push({ x: e.x * TILE + 8, y: (e.y + 1) * TILE, weapon: e.weapon, opened: false, lid: 0 });
    }
  }
  level.bossArena = level.hasBoss && !level.flagSet;
  totalCoins = coins.length; coinCount = 0;
  computeRuns(); buildDecor();
  state = 'play'; hideOverlays(); updateHud(); resize();
  const viewW = canvas.width / scale, viewH = canvas.height / scale, levelH = level.H * TILE;
  camX = Math.max(0, Math.min(level.W * TILE - viewW, hero.px - viewW / 2));
  camY = viewH >= levelH ? (levelH - viewH) / 2 : Math.max(0, Math.min(levelH - viewH, (hero.py + hero.h / 2) - viewH * 0.64));
}

function startGame() { initAudio(); lives = 3; loadLevel(0); showScreen('game'); if (!loopRunning) { loopRunning = true; lastT = 0; requestAnimationFrame(loop); } }

// ---------- INPUT ----------
window.addEventListener('keydown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (['ArrowLeft', 'KeyA', 'KeyQ'].includes(e.code)) input.left = true;
  if (['ArrowRight', 'KeyD'].includes(e.code)) input.right = true;
  if (['Space', 'ArrowUp', 'KeyW', 'KeyZ'].includes(e.code)) { input.jump = true; e.preventDefault(); }
  if (['Enter', 'NumpadEnter', 'KeyF'].includes(e.code)) { input.fire = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'KeyA', 'KeyQ'].includes(e.code)) input.left = false;
  if (['ArrowRight', 'KeyD'].includes(e.code)) input.right = false;
  if (['Space', 'ArrowUp', 'KeyW', 'KeyZ'].includes(e.code)) input.jump = false;
  if (['Enter', 'NumpadEnter', 'KeyF'].includes(e.code)) input.fire = false;
});
function bindHold(id, prop) {
  const el = document.getElementById(id); if (!el) return;
  const on = (e) => { input[prop] = true; e.preventDefault(); }, off = (e) => { input[prop] = false; e.preventDefault(); };
  el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off, { passive: false });
  el.addEventListener('touchcancel', off, { passive: false });
  el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
}
bindHold('t-left', 'left'); bindHold('t-right', 'right'); bindHold('t-jump', 'jump'); bindHold('t-fire', 'fire');

// ---------- SHOOT ----------
function fireWeapon() {
  const h = hero, W = WEAPONS[h.weapon];
  let best = null, bd = 380;
  for (const m of mutants) { if (m.dead) continue; const d = Math.hypot((m.px + m.w / 2) - (h.px + h.w / 2), (m.py + m.h / 2) - (h.py + h.h / 2)); if (d < bd) { bd = d; best = m; } }
  const ox = h.px + h.w / 2, oy = h.py + 3; let ang;
  if (best) { ang = Math.atan2((best.py + best.h / 2) - oy, (best.px + best.w / 2) - ox); h.face = (best.px + best.w / 2) >= ox ? 1 : -1; }
  else ang = h.face > 0 ? 0 : Math.PI;
  const offs = W.spread ? [-0.18, 0, 0.18] : [0];
  for (const da of offs) bullets.push({ kind: W.kind, x: ox + h.face * 10, y: oy, vx: Math.cos(ang + da) * W.speed, vy: Math.sin(ang + da) * W.speed, ttl: 1.4, dmg: W.dmg, aoe: W.aoe || 0, spin: 0 });
  h.recoil = 0.12;
  if (W.kind === 'axe' || W.kind === 'rocket') sfx.throw();
  else { spawnParticles(ox + h.face * 13, oy, '#ffe066', 3, 60); sfx.shoot(); }
}

// ---------- UPDATE ----------
function update(dt) {
  gameTime += dt;
  if (state !== 'play') return;
  const h = hero;
  const wantDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const accel = h.onGround ? PHYS.ACCEL : PHYS.AIR_ACCEL;
  if (wantDir !== 0) { h.vx += wantDir * accel * dt; h.vx = Math.max(-PHYS.MAX_RUN, Math.min(PHYS.MAX_RUN, h.vx)); h.face = wantDir; }
  else if (h.onGround) { const f = PHYS.FRICTION * dt; if (h.vx > f) h.vx -= f; else if (h.vx < -f) h.vx += f; else h.vx = 0; }

  if (input.jump && !input._jumpPrev) h.buffer = PHYS.BUFFER;
  h.buffer -= dt; h.coyote = h.onGround ? PHYS.COYOTE : h.coyote - dt;
  if (h.buffer > 0 && h.coyote > 0) { h.vy = PHYS.JUMP_V; h.buffer = 0; h.coyote = 0; h.onGround = false; sfx.jump(); }
  if (!input.jump && input._jumpPrev && h.vy < 0) h.vy *= 0.45;
  input._jumpPrev = input.jump;

  h.fireT -= dt;
  if (input.fire && h.fireT <= 0) { fireWeapon(); h.fireT = WEAPONS[h.weapon].cd; }
  if (h.recoil > 0) h.recoil -= dt;

  h.vy += PHYS.GRAVITY * dt; if (h.vy > PHYS.MAX_FALL) h.vy = PHYS.MAX_FALL;
  if (h.invuln > 0) h.invuln -= dt;
  moveBody(h, dt);
  if (Math.abs(h.vx) > 8) h.anim += dt * 12; else h.anim = 0;

  if (h.py > level.H * TILE + 40) { loseLife(); return; }
  const ftx = Math.floor((h.px + h.w / 2) / TILE), fty = Math.floor((h.py + h.h - 1) / TILE);
  if (fty >= 0 && fty < level.H && ftx >= 0 && ftx < level.W && level.solid[fty][ftx] === 3) { loseLife(); return; }

  for (const c of chests) {
    if (c.opened) { if (c.lid < 1) c.lid = Math.min(1, c.lid + dt * 4); continue; }
    if (Math.abs((h.px + h.w / 2) - c.x) < 14 && Math.abs((h.py + h.h) - c.y) < 22) {
      c.opened = true; equipWeapon(c.weapon);
      spawnParticles(c.x, c.y - 10, '#ffd23f', 16, 130);
      floaters.push({ x: c.x, y: c.y - 18, txt: WEAPONS[c.weapon].icon, life: 1.3 }); sfx.chest();
    }
  }

  for (const m of mutants) {
    if (m.dead) continue;
    if (m.flash > 0) m.flash -= dt;
    if (m.type === 'fly') {
      m.t += dt; m.px += m.dir * 46 * dt;
      if (m.px < m.minX) { m.px = m.minX; m.dir = 1; } if (m.px > m.maxX) { m.px = m.maxX; m.dir = -1; }
      m.py = m.baseY + Math.sin(m.t * 2.4) * 11; continue;
    }
    if (m.type === 'boss') {
      m.dir = (h.px + h.w / 2 > m.px + m.w / 2) ? 1 : -1;
      const fast = m.hp <= m.maxhp / 2;
      m.vx = m.dir * (fast ? 56 : 38);
      m.vy += PHYS.GRAVITY * dt; if (m.vy > PHYS.MAX_FALL) m.vy = PHYS.MAX_FALL;
      // ne pas tomber dans le vide
      if (m.onGround) { const aX = Math.floor((m.dir > 0 ? m.px + m.w + 1 : m.px - 1) / TILE), bY = Math.floor((m.py + m.h + 1) / TILE); if (!isSolidTile(aX, bY)) m.vx = 0; }
      moveBody(m, dt);
      m.bt -= dt;
      if (m.bt <= 0) {
        m.bt = fast ? 1.5 : 2.3; m.action = (m.action + 1) % 2;
        if (m.action === 0 && m.onGround) m.vy = -560;
        else {
          const ox = m.px + m.w / 2, oy = m.py + m.h * 0.4;
          const a0 = Math.atan2((h.py + h.h / 2) - oy, (h.px + h.w / 2) - ox);
          for (const da of [-0.28, 0, 0.28]) eBullets.push({ x: ox, y: oy, vx: Math.cos(a0 + da) * 230, vy: Math.sin(a0 + da) * 230, ttl: 2.4 });
          sfx.throw();
        }
      }
      continue;
    }
    // marcheur
    m.vx = m.dir * (m.big ? PHYS.MUT_SPEED * 0.7 : PHYS.MUT_SPEED);
    m.vy += PHYS.GRAVITY * dt; if (m.vy > PHYS.MAX_FALL) m.vy = PHYS.MAX_FALL;
    moveBody(m, dt);
    if (m.hitX) m.dir *= -1;
    if (m.onGround) { const aX = Math.floor((m.dir > 0 ? m.px + m.w + 1 : m.px - 1) / TILE), bY = Math.floor((m.py + m.h + 1) / TILE); if (!isSolidTile(aX, bY)) m.dir *= -1; }
  }

  // projectiles héros
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt; b.spin += dt * 20;
    const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
    if (isSolidTile(tx, ty)) { b.ttl = 0; if (b.kind === 'rocket') explode(b.x, b.y, b.aoe, b.dmg); else spawnParticles(b.x, b.y, '#ffd23f', 4, 80); continue; }
    for (const m of mutants) {
      if (m.dead) continue;
      if (b.x > m.px && b.x < m.px + m.w && b.y > m.py && b.y < m.py + m.h) {
        b.ttl = 0;
        if (b.kind === 'rocket') explode(b.x, b.y, b.aoe, b.dmg);
        else { m.hp -= b.dmg; m.flash = 0.12; spawnParticles(b.x, b.y, '#9bff5a', 6, 110); sfx.hit(); if (m.hp <= 0) killMutant(m); }
        break;
      }
    }
  }
  for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].ttl <= 0) bullets.splice(i, 1);

  // projectiles ennemis (boss)
  for (const e of eBullets) {
    e.x += e.vx * dt; e.y += e.vy * dt; e.ttl -= dt;
    const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
    if (isSolidTile(tx, ty)) { e.ttl = 0; spawnParticles(e.x, e.y, '#9bff5a', 4, 70); continue; }
    if (h.invuln <= 0 && e.x > h.px && e.x < h.px + h.w && e.y > h.py && e.y < h.py + h.h) { e.ttl = 0; hurt(e.vx < 0 ? -1 : 1); }
  }
  for (let i = eBullets.length - 1; i >= 0; i--) if (eBullets[i].ttl <= 0) eBullets.splice(i, 1);

  for (const m of mutants) {
    if (m.dead) continue;
    if (h.px < m.px + m.w && h.px + h.w > m.px && h.py < m.py + m.h && h.py + h.h > m.py) {
      const stomp = h.vy > 0 && (h.py + h.h) - m.py < 12;
      if (stomp) { h.vy = -300; m.hp -= 1; m.flash = 0.12; if (m.hp <= 0) killMutant(m); else sfx.hit(); }
      else if (h.invuln <= 0) hurt((m.px + m.w / 2 < h.px + h.w / 2) ? 1 : -1);
    }
  }

  // boss arène vaincu -> victoire
  if (level.bossArena && bossRef && bossRef.dead && state === 'play') levelClear();

  for (const c of coins) {
    if (c.got) continue;
    if (Math.abs((h.px + h.w / 2) - c.x) < 13 && Math.abs((h.py + h.h / 2) - c.y) < 15) { c.got = true; coinCount++; spawnParticles(c.x, c.y, '#ffd23f', 7, 90); sfx.coin(); updateHud(); }
  }

  if (level.flagSet) {
    const fx = level.flagX * TILE, fyTop = (level.flagY + 1) * TILE - 48;
    if (h.px + h.w > fx - 4 && h.px < fx + 14 && h.py + h.h > fyTop) levelClear();
  }

  for (const p of particles) { p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  for (const f of floaters) { f.y -= dt * 22; f.life -= dt; }
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);

  const viewW = canvas.width / scale, viewH = canvas.height / scale, levelH = level.H * TILE;
  const tcx = Math.max(0, Math.min(level.W * TILE - viewW, (h.px + h.w / 2) - viewW / 2));
  const tcy = viewH >= levelH ? (levelH - viewH) / 2 : Math.max(0, Math.min(levelH - viewH, (h.py + h.h / 2) - viewH * 0.64));
  camX += (tcx - camX) * 0.18; camY += (tcy - camY) * 0.18;
}

function spawnParticles(x, y, color, n, spread = 90) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 30 + Math.random() * spread; particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.4 + Math.random() * 0.35, color, r: 1.5 + Math.random() * 2 }); }
}
function killMutant(m) { m.dead = true; spawnParticles(m.px + m.w / 2, m.py + m.h / 2, m.type === 'fly' ? '#b56cff' : '#6fd13f', m.big ? 22 : 14, 150); sfx.pop(); }
function explode(x, y, radius, dmg) {
  spawnParticles(x, y, '#ffce4d', 22, 200); spawnParticles(x, y, '#ff5a2f', 14, 150); sfx.pop();
  for (const m of mutants) { if (m.dead) continue; if (Math.hypot((m.px + m.w / 2) - x, (m.py + m.h / 2) - y) < radius) { m.hp -= dmg; m.flash = 0.12; if (m.hp <= 0) killMutant(m); } }
}
function hurt(knockDir) { hero.invuln = 1.2; hero.vy = -220; hero.vx = knockDir * 160; sfx.hurt(); loseLife(true); }
function loseLife(soft) {
  if (!soft) sfx.hurt(); lives--; updateHud();
  if (lives <= 0) { gameOver(); return; }
  if (!soft) { hero.px = level.startX * TILE + 3; hero.py = level.startY * TILE + 2; hero.vx = 0; hero.vy = 0; hero.invuln = 1.2; }
}
function levelClear() {
  if (state !== 'play') return;
  sfx.flag(); spawnParticles(hero.px + 5, hero.py + 5, '#ffd23f', 18, 130);
  if (levelIndex + 1 < LEVELS.length) { state = 'clear'; document.getElementById('clear-num').textContent = levelIndex + 2; document.getElementById('clear-overlay').style.display = 'flex'; }
  else { state = 'win'; sfx.win(); document.getElementById('win-overlay').style.display = 'flex'; }
}
function gameOver() { state = 'over'; document.getElementById('gameover-overlay').style.display = 'flex'; }
function hideOverlays() { for (const id of ['clear-overlay', 'win-overlay', 'gameover-overlay']) document.getElementById(id).style.display = 'none'; }
function updateHud() {
  document.getElementById('hud-hearts').textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives));
  document.getElementById('coin-count').textContent = coinCount;
  document.getElementById('coin-total').textContent = totalCoins;
  document.getElementById('level-num').textContent = (levelIndex + 1) + '/' + LEVELS.length;
  const wel = document.getElementById('hud-weapon'); if (wel && hero) wel.textContent = WEAPONS[hero.weapon].icon;
}

// ---------- RENDER ----------
function resize() {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight; ctx.imageSmoothingEnabled = true;
  const byH = canvas.height / (10 * TILE), byW = canvas.width / (15 * TILE);
  scale = Math.max(2.6, Math.min(byH, byW));
}
window.addEventListener('resize', resize);

const CLOUDS = [{ x: 80, y: 50, s: 1.2 }, { x: 360, y: 90, s: 0.9 }, { x: 640, y: 60, s: 1.4 }, { x: 920, y: 100, s: 1.0 }, { x: 1220, y: 55, s: 1.1 }, { x: 1540, y: 95, s: 1.3 }];

function drawBackground() {
  const W = canvas.width, H = canvas.height, T = theme;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.55, T.sky[1]); sky.addColorStop(1, T.sky[2]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  if (T.light === 'sun') {
    const sx = W - 120, sy = 110, g = ctx.createRadialGradient(sx, sy, 10, sx, sy, 150);
    g.addColorStop(0, 'rgba(255,240,150,0.85)'); g.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = g; circle(sx, sy, 150); ctx.fill(); ctx.fillStyle = '#fff3b0'; circle(sx, sy, 44); ctx.fill();
  } else if (T.light === 'moon') {
    for (let i = 0; i < 46; i++) { const x = (i * 137) % W, y = (i * 89) % (H * 0.5); ctx.globalAlpha = 0.35 + 0.4 * Math.sin(gameTime * 2 + i); ctx.fillStyle = '#fff'; circle(x, y, 1.2); ctx.fill(); }
    ctx.globalAlpha = 1; const sx = W - 120, sy = 110; ctx.fillStyle = '#e9eeff'; circle(sx, sy, 38); ctx.fill(); ctx.fillStyle = T.sky[0]; circle(sx - 13, sy - 8, 32); ctx.fill();
  }
  const horizon = H * 0.66;
  if (T.mtn) drawMountains(0.12, horizon, T.mtn, T.snow, 300, 200);
  drawHills(0.28, horizon + 10, T.hillA, 230, 120);
  drawHills(0.5, horizon + 60, T.hillB, 170, 90);
  if (T.light !== 'dim') for (const c of CLOUDS) { const span = (level ? level.W * TILE : 1800) + 600; let x = ((c.x - camX * 0.2) % span); if (x < -180) x += span; drawCloud(x, c.y - camY * 0.06, c.s); }
}
function drawMountains(par, baseY, col, snow, spacing, height) {
  const off = -(camX * par) % spacing;
  for (let x = off - spacing; x < canvas.width + spacing; x += spacing) {
    const px = x + spacing / 2;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 20, baseY); ctx.lineTo(px, baseY - height); ctx.lineTo(x + spacing + 20, baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = snow; ctx.beginPath(); ctx.moveTo(px - 26, baseY - height + 36); ctx.lineTo(px, baseY - height); ctx.lineTo(px + 26, baseY - height + 36); ctx.quadraticCurveTo(px, baseY - height + 22, px - 26, baseY - height + 36); ctx.closePath(); ctx.fill();
  }
}
function drawHills(par, baseY, col, spacing, r) {
  const off = -(camX * par) % spacing; ctx.fillStyle = col;
  for (let x = off - spacing; x < canvas.width + spacing; x += spacing) { ctx.beginPath(); ctx.arc(x + spacing / 2, baseY + r, r, Math.PI, 0); ctx.closePath(); ctx.fill(); }
  ctx.fillRect(0, baseY + r, canvas.width, canvas.height - (baseY + r));
}
function drawCloud(x, y, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath();
  ctx.arc(x, y, 20 * s, 0, TAU); ctx.arc(x + 26 * s, y + 6, 26 * s, 0, TAU); ctx.arc(x + 56 * s, y, 18 * s, 0, TAU); ctx.arc(x + 28 * s, y - 14 * s, 20 * s, 0, TAU); ctx.fill();
}
function drawWeather() {
  const W = canvas.width, H = canvas.height, t = gameTime;
  if (theme.weather === 'snow') { ctx.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 70; i++) { const x = (i * 97 + t * 18) % (W + 20), y = (i * 53 + t * 45) % (H + 20), sway = Math.sin(t + i) * 6; circle((x + sway + W) % (W + 20), y, 1.4 + (i % 3) * 0.6); ctx.fill(); } }
  else if (theme.weather === 'leaves') { for (let i = 0; i < 36; i++) { const x = (i * 113 + t * 22 + Math.sin(t + i) * 30) % (W + 20), y = (i * 71 + t * 38) % (H + 20); ctx.fillStyle = i % 2 ? '#ff9a3d' : '#d4632a'; ctx.save(); ctx.translate((x + W) % (W + 20), y); ctx.rotate(t * 2 + i); rr(-2.5, -1.5, 5, 3, 1.5); ctx.fill(); ctx.restore(); } }
  else if (theme.weather === 'ember') { for (let i = 0; i < 50; i++) { const x = (i * 131 + Math.sin(t * 1.5 + i) * 20) % W, y = H - ((t * 30 + i * 47) % (H + 20)); ctx.fillStyle = i % 2 ? '#ff7a2f' : '#ffd23f'; ctx.globalAlpha = 0.8; circle((x + W) % W, y, 1 + (i % 2)); ctx.fill(); } ctx.globalAlpha = 1; }
}

function drawRun(run) {
  const T = theme, x = run.x0 * TILE, y = run.top * TILE, w = (run.x1 - run.x0 + 1) * TILE, h = (run.bot - run.top + 1) * TILE, rad = Math.min(9, w / 2, h / 2);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, T.dirt[0]); g.addColorStop(1, T.dirt[1]);
  ctx.fillStyle = g; rr(x, y, w, h, rad); ctx.fill();
  const r = rng(((run.x0 + 1) * 131 + run.top * 17) >>> 0), dots = Math.floor(w / 14);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < dots; i++) { circle(x + 6 + r() * (w - 12), y + 12 + r() * (h - 16), 1.6 + r() * 1.8); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; for (let i = 0; i < dots; i++) { circle(x + 6 + r() * (w - 12), y + 12 + r() * (h - 16), 1 + r()); ctx.fill(); }
  const gh = Math.min(9, h), gg = ctx.createLinearGradient(0, y, 0, y + gh); gg.addColorStop(0, T.grass[0]); gg.addColorStop(1, T.grass[1]);
  ctx.fillStyle = gg; rr(x, y, w, gh, { tl: rad, tr: rad, br: 0, bl: 0 }); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; rr(x + 3, y + 2, w - 6, 2.5, 2); ctx.fill();
  ctx.fillStyle = T.blade;
  for (let bx = x + 7; bx < x + w - 4; bx += 13) { ctx.beginPath(); ctx.moveTo(bx - 2.2, y + 1); ctx.quadraticCurveTo(bx - 1, y - 6, bx + 0.5, y - 7); ctx.quadraticCurveTo(bx + 1.5, y - 5, bx + 2.4, y + 1); ctx.closePath(); ctx.fill(); }
}

// ---------- DÉCOR ----------
function drawTreeThemed(x, gy, s) {
  const T = theme; ctx.save(); ctx.translate(x, gy); ctx.scale(s, s);
  const tg = ctx.createLinearGradient(-5, 0, 5, 0); tg.addColorStop(0, T.trunk[0]); tg.addColorStop(1, T.trunk[1]);
  if (T.tree === 'pine') {
    ctx.fillStyle = T.trunk[1]; rr(-3, -10, 6, 12, 1); ctx.fill();
    for (let i = 0; i < 3; i++) { const yy = -16 - i * 12, wdt = 16 - i * 3; const fg = ctx.createLinearGradient(0, yy - 14, 0, yy); fg.addColorStop(0, T.foliage[0]); fg.addColorStop(1, T.foliage[1]); ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-wdt, yy); ctx.lineTo(0, yy - 20); ctx.lineTo(wdt, yy); ctx.closePath(); ctx.fill(); }
  } else if (T.tree === 'dead') {
    ctx.fillStyle = tg; rr(-3, -34, 6, 36, { tl: 2, tr: 2, br: 0, bl: 0 }); ctx.fill();
    ctx.strokeStyle = T.trunk[1]; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-9, -34); ctx.moveTo(0, -28); ctx.lineTo(9, -40); ctx.moveTo(0, -20); ctx.lineTo(8, -26); ctx.stroke();
  } else {
    ctx.fillStyle = tg; rr(-4, -26, 8, 28, { tl: 3, tr: 3, br: 0, bl: 0 }); ctx.fill();
    for (const [bx, by, br] of [[0, -50, 18], [-13, -40, 13], [13, -40, 13], [0, -36, 15]]) { const fg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 2, bx, by, br); fg.addColorStop(0, T.foliage[0]); fg.addColorStop(1, T.foliage[1]); ctx.fillStyle = fg; circle(bx, by, br); ctx.fill(); }
  }
  ctx.restore();
}
function drawBush(x, gy) {
  const T = theme; ctx.save(); ctx.translate(x, gy);
  for (const [bx, by, br] of [[-9, -4, 9], [9, -4, 9], [0, -9, 12]]) { const fg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 1, bx, by, br); fg.addColorStop(0, T.foliage[0]); fg.addColorStop(1, T.foliage[1]); ctx.fillStyle = fg; circle(bx, by, br); ctx.fill(); }
  ctx.restore();
}
function drawRock(x, gy, s) {
  ctx.save(); ctx.translate(x, gy); ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, -11, 0, 0); g.addColorStop(0, '#b3bac6'); g.addColorStop(1, '#828b9a'); ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-11, -8, -3, -9); ctx.quadraticCurveTo(4, -11, 9, -6); ctx.quadraticCurveTo(12, -1, 10, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawCrate(x, gy) {
  ctx.save(); ctx.translate(x, gy); const g = ctx.createLinearGradient(0, -14, 0, 0); g.addColorStop(0, '#b07a3f'); g.addColorStop(1, '#86562a');
  ctx.fillStyle = g; rr(-8, -14, 16, 14, 2); ctx.fill(); ctx.strokeStyle = '#5f3c1d'; ctx.lineWidth = 1.4; ctx.strokeRect(-8, -14, 16, 14);
  ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, 0); ctx.moveTo(8, -14); ctx.lineTo(-8, 0); ctx.stroke(); ctx.restore();
}
function drawBarrel(x, gy) {
  ctx.save(); ctx.translate(x, gy); const g = ctx.createLinearGradient(-7, 0, 7, 0); g.addColorStop(0, '#8a6033'); g.addColorStop(0.5, '#a8783f'); g.addColorStop(1, '#6e4a26');
  ctx.fillStyle = g; rr(-7, -16, 14, 16, 3); ctx.fill(); ctx.fillStyle = 'rgba(60,40,20,0.6)'; rr(-7, -12, 14, 2, 1); ctx.fill(); rr(-7, -5, 14, 2, 1); ctx.fill(); ctx.restore();
}
function drawGrassTuft(x, gy) {
  ctx.save(); ctx.translate(x, gy); ctx.fillStyle = theme.blade;
  for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(dx - 2, 0); ctx.quadraticCurveTo(dx, -8, dx + 1, -9); ctx.quadraticCurveTo(dx + 2, -7, dx + 2, 0); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function drawCactus(x, gy, s) {
  ctx.save(); ctx.translate(x, gy); ctx.scale(s, s);
  const g = ctx.createLinearGradient(-5, -28, 5, 0); g.addColorStop(0, '#5fae4a'); g.addColorStop(1, '#3c8a2c'); ctx.fillStyle = g;
  rr(-4, -28, 8, 28, 4); ctx.fill(); rr(-12, -20, 6, 12, 3); ctx.fill(); rr(-12, -20, 6, 4, 2); ctx.fill();
  rr(6, -24, 6, 12, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.6; for (let yy = -24; yy < -2; yy += 5) { ctx.beginPath(); ctx.moveTo(-2, yy); ctx.lineTo(-2, yy + 2); ctx.moveTo(2, yy); ctx.lineTo(2, yy + 2); ctx.stroke(); }
  ctx.restore();
}
function drawCrystal(x, gy, s) {
  ctx.save(); ctx.translate(x, gy); ctx.scale(s, s);
  for (const [dx, hh, c1, c2] of [[0, -22, '#9be0ff', '#4aa8d0'], [-6, -14, '#c0a0ff', '#7a4ad0'], [6, -16, '#9be0ff', '#4aa8d0']]) {
    const g = ctx.createLinearGradient(dx, hh, dx, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(dx, hh); ctx.lineTo(dx + 4, hh / 2); ctx.lineTo(dx + 2, 0); ctx.lineTo(dx - 2, 0); ctx.lineTo(dx - 4, hh / 2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawDecor(d) {
  switch (d.t) {
    case 'tree': case 'pine': case 'deadtree': drawTreeThemed(d.x, d.y, d.s); break;
    case 'bush': drawBush(d.x, d.y); break;
    case 'rock': drawRock(d.x, d.y, d.s); break;
    case 'crate': drawCrate(d.x, d.y); break;
    case 'barrel': drawBarrel(d.x, d.y); break;
    case 'grass': drawGrassTuft(d.x, d.y); break;
    case 'cactus': drawCactus(d.x, d.y, d.s); break;
    case 'crystal': drawCrystal(d.x, d.y, d.s); break;
  }
}

function drawChest(c) {
  ctx.save(); ctx.translate(c.x, c.y);
  const bg = ctx.createLinearGradient(0, -8, 0, 0); bg.addColorStop(0, '#9a6a35'); bg.addColorStop(1, '#6e4a24');
  ctx.fillStyle = bg; rr(-9, -8, 18, 8, { tl: 0, tr: 0, br: 2, bl: 2 }); ctx.fill();
  ctx.fillStyle = '#ffd23f'; rr(-9, -5, 18, 2, 1); ctx.fill(); ctx.fillStyle = '#caa12f'; rr(-1.5, -8, 3, 8, 1); ctx.fill();
  ctx.save(); ctx.translate(0, -8); ctx.rotate(-c.lid * 1.1);
  const lg = ctx.createLinearGradient(0, -7, 0, 0); lg.addColorStop(0, '#b07a3f'); lg.addColorStop(1, '#8a5c2c'); ctx.fillStyle = lg;
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-9, -5); ctx.quadraticCurveTo(0, -10, 9, -5); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd23f'; rr(-9, -2, 18, 2, 1); ctx.fill(); ctx.restore();
  if (c.opened && c.lid > 0.4) { ctx.fillStyle = 'rgba(255,235,150,0.5)'; circle(0, -10, 7); ctx.fill(); }
  ctx.restore();
}

// ---------- HÉROS ----------
function drawHeldWeapon(weapon, recoil) {
  if (weapon === 'axe') {
    ctx.save(); ctx.translate(8 - recoil, -14);
    ctx.fillStyle = '#6e4a26'; rr(-2, -1, 12, 2.4, 1); ctx.fill();
    ctx.fillStyle = '#cfd6e2'; ctx.beginPath(); ctx.moveTo(8, -5); ctx.lineTo(15, -2); ctx.lineTo(15, 4); ctx.lineTo(8, 6); ctx.quadraticCurveTo(11, 0, 8, -5); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (weapon === 'rocket') {
    ctx.save(); ctx.translate(6 - recoil, -15);
    ctx.fillStyle = '#3a3f52'; rr(0, 0, 13, 5, 2); ctx.fill(); ctx.fillStyle = '#ff3b4d'; rr(11, 0, 3, 5, 1); ctx.fill(); ctx.fillStyle = '#2a2f3e'; rr(2, 5, 3, 3, 1); ctx.fill();
    ctx.restore();
  } else if (weapon === 'triple') {
    ctx.save(); ctx.translate(7 - recoil, -15);
    ctx.fillStyle = '#33384a'; rr(0, -1.5, 10, 7, 2); ctx.fill(); ctx.fillStyle = '#43e0ff'; rr(8.5, -1, 2, 1.6, 0.6); ctx.fill(); rr(8.5, 1.4, 2, 1.6, 0.6); ctx.fill(); rr(8.5, 3.8, 2, 1.6, 0.6); ctx.fill();
    ctx.restore();
  } else {
    ctx.save(); ctx.translate(7 - recoil, -15);
    ctx.fillStyle = '#33384a'; rr(0, 0, 9, 4.5, 1.5); ctx.fill(); ctx.fillStyle = '#2a2f3e'; rr(1, 4, 3.2, 4, 1); ctx.fill(); ctx.fillStyle = '#43e0ff'; rr(7.5, 0.6, 2, 2.2, 1); ctx.fill();
    if (recoil) { ctx.fillStyle = 'rgba(120,230,255,0.9)'; circle(11, 1.6, 2.4); ctx.fill(); }
    ctx.restore();
  }
}
function drawHero() {
  const h = hero, cx = h.px + h.w / 2, footY = h.py + h.h;
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, footY + 1, 8, 3, 0, 0, TAU); ctx.fill();
  if (h.invuln > 0 && Math.floor(gameTime * 16) % 2 === 0) return;
  ctx.save(); ctx.translate(cx, footY); ctx.scale(h.face, 1);
  const run = Math.abs(h.vx) > 8 && h.onGround, air = !h.onGround, lp = Math.sin(h.anim);
  const pg = ctx.createLinearGradient(-10, -22, -3, -22); pg.addColorStop(0, '#3a4150'); pg.addColorStop(1, '#525b6c');
  ctx.fillStyle = pg; rr(-10, -23, 7, 12, 2); ctx.fill(); ctx.fillStyle = '#ff7a2f'; rr(-9.5, -20, 5.5, 2, 1); ctx.fill();
  ctx.fillStyle = '#2f3640';
  if (air) { rr(-5, -8, 4.5, 8, 2); ctx.fill(); rr(0.5, -7, 4.5, 7, 2); ctx.fill(); }
  else if (run) { rr(-5 + lp * 2, -8, 4.5, 8, 2); ctx.fill(); rr(0.5 - lp * 2, -8, 4.5, 8, 2); ctx.fill(); }
  else { rr(-5, -8, 4.5, 8, 2); ctx.fill(); rr(0.5, -8, 4.5, 8, 2); ctx.fill(); }
  ctx.fillStyle = '#ff7a2f'; if (!air) { rr(-4.6, -5, 3.6, 1.8, 1); ctx.fill(); rr(0.9, -5, 3.6, 1.8, 1); ctx.fill(); }
  ctx.fillStyle = '#1c2029'; rr(-6, -2, 6.5, 3, 1.5); ctx.fill(); rr(0, -2, 6.5, 3, 1.5); ctx.fill();
  ctx.fillStyle = '#236074'; rr(-7.5, -22, 3.6, 9, 2); ctx.fill();
  const jg = ctx.createLinearGradient(0, -25, 0, -10); jg.addColorStop(0, '#2f7f9c'); jg.addColorStop(1, '#1f5f76');
  ctx.fillStyle = jg; rr(-8, -25, 16, 15, { tl: 5, tr: 5, br: 3, bl: 3 }); ctx.fill();
  const vg = ctx.createLinearGradient(0, -24, 0, -11); vg.addColorStop(0, '#3a4150'); vg.addColorStop(1, '#2a3040');
  ctx.fillStyle = vg; rr(-6, -24, 12, 13, 3); ctx.fill();
  ctx.strokeStyle = '#1d2230'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(0, -11); ctx.stroke();
  ctx.fillStyle = '#252b38'; rr(-5, -21, 3.4, 3, 1); ctx.fill(); rr(1.6, -21, 3.4, 3, 1); ctx.fill();
  ctx.fillStyle = '#ff7a2f'; rr(-6, -24.5, 12, 1.8, 1); ctx.fill();
  const sk = ctx.createRadialGradient(2, -30, 1, 0, -29, 6); sk.addColorStop(0, '#ffd6ad'); sk.addColorStop(1, '#e7ad7e');
  ctx.fillStyle = sk; circle(0, -29, 5.4); ctx.fill();
  ctx.fillStyle = '#1f5f76'; ctx.beginPath(); ctx.arc(0, -29, 7, Math.PI * 0.65, Math.PI * 2.35); ctx.closePath(); ctx.fill();
  ctx.fillStyle = sk; circle(0.5, -28.5, 5.2); ctx.fill();
  ctx.fillStyle = '#1e2630'; rr(-4.5, -31, 9.5, 3.4, 1.6); ctx.fill();
  ctx.fillStyle = '#43e0ff'; rr(0.5, -30.6, 3.4, 2.4, 1); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; rr(1, -30.4, 1, 1, 0.4); ctx.fill();
  ctx.strokeStyle = '#a96a40'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0.5, -26.2); ctx.lineTo(3.5, -26.2); ctx.stroke();
  ctx.fillStyle = '#2f7f9c'; rr(-6, -34.5, 12, 3, 2); ctx.fill();
  const recoil = h.recoil > 0 ? 2 : 0;
  ctx.fillStyle = '#2f7f9c'; rr(2, -22, 7, 3.6, 2); ctx.fill(); ctx.fillStyle = '#2a3040'; circle(8 - recoil, -20, 2.2); ctx.fill();
  drawHeldWeapon(h.weapon, recoil);
  ctx.restore();
}

// ---------- MUTANTS ----------
function drawMutant(m) {
  const cx = m.px + m.w / 2, footY = m.py + m.h, r = m.w / 2 + 1, cy = footY - r;
  const t = gameTime + m.wob, wob = 1 + Math.sin(t * 6) * 0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, footY + 1, r * 0.9, 3, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = '#2f7d1f';
  for (const sgn of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(sgn * r * 0.5 - 2.5, -r * 0.5); ctx.lineTo(sgn * r * 0.5, -r * 1.35); ctx.lineTo(sgn * r * 0.5 + 2.5, -r * 0.5); ctx.closePath(); ctx.fill(); }
  ctx.save(); ctx.scale(2 - wob, wob);
  ctx.fillStyle = '#173a0d'; ctx.beginPath(); ctx.ellipse(0, 0, r + 1.2, r * 1.02 + 1.2, 0, 0, TAU); ctx.fill();
  const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 2, 0, 0, r * 1.05); bg.addColorStop(0, m.big ? '#86d84a' : '#73cf3c'); bg.addColorStop(1, m.big ? '#2f7d1f' : '#367d20');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.02, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(35,90,20,0.6)'; circle(-r * 0.45, r * 0.35, r * 0.22); ctx.fill(); circle(r * 0.5, -r * 0.1, r * 0.16); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; circle(-r * 0.4, -r * 0.45, r * 0.2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#2f7d1f'; for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * r * 0.95, r * 0.2); ctx.lineTo(sgn * r * 1.35, r * 0.45); ctx.lineTo(sgn * r * 0.95, r * 0.55); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.translate(cx, cy); const fd = m.dir || 1;
  for (const [ex, ey] of [[-r * 0.45, -r * 0.1], [r * 0.45, -r * 0.1], [0, -r * 0.5]]) { ctx.fillStyle = '#eaffd0'; circle(ex, ey, r * 0.26); ctx.fill(); ctx.fillStyle = '#b8ff3a'; circle(ex, ey, r * 0.17); ctx.fill(); ctx.fillStyle = '#101a08'; circle(ex + fd * r * 0.07, ey, r * 0.1); ctx.fill(); }
  ctx.strokeStyle = '#205015'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-r * 0.72, -r * 0.42); ctx.lineTo(-r * 0.2, -r * 0.22); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r * 0.72, -r * 0.42); ctx.lineTo(r * 0.2, -r * 0.22); ctx.stroke();
  ctx.fillStyle = '#1f4012'; ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 0.52, r * 0.24, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.3 - 2.2, r * 0.3); ctx.lineTo(i * r * 0.3 + 2.2, r * 0.3); ctx.lineTo(i * r * 0.3, r * 0.56); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(i * r * 0.3 - 2.2, r * 0.6); ctx.lineTo(i * r * 0.3 + 2.2, r * 0.6); ctx.lineTo(i * r * 0.3, r * 0.36); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = '#2f7d1f'; circle(cx - r * 0.45, footY - 1, 2.6); ctx.fill(); circle(cx + r * 0.45, footY - 1, 2.6); ctx.fill();
  if (m.big && m.hp < m.maxhp) { ctx.fillStyle = '#000'; rr(cx - 9, cy - r - 8, 18, 3, 1); ctx.fill(); ctx.fillStyle = '#ff4d4d'; rr(cx - 8.5, cy - r - 7.5, 17 * (m.hp / m.maxhp), 2, 1); ctx.fill(); }
  if (m.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${m.flash / 0.12 * 0.7})`; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.1, r * 1.15, 0, 0, TAU); ctx.fill(); }
}
function drawFlyer(m) {
  const cx = m.px + m.w / 2, cy = m.py + m.h / 2, r = 6, t = gameTime + m.wob, flap = Math.sin(t * 14) * 0.5;
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = '#c79bff';
  for (const sgn of [-1, 1]) { ctx.save(); ctx.scale(sgn, 1); ctx.rotate(flap); ctx.beginPath(); ctx.moveTo(r * 0.6, -1); ctx.quadraticCurveTo(r * 2.2, -r * 1.4, r * 2.4, 0); ctx.quadraticCurveTo(r * 2.0, r * 0.9, r * 0.6, 2); ctx.closePath(); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#5e2b8f'; circle(0, 0, r + 1.1); ctx.fill();
  const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r); bg.addColorStop(0, '#b06cff'); bg.addColorStop(1, '#7a36d0'); ctx.fillStyle = bg; circle(0, 0, r); ctx.fill();
  const fd = m.dir || 1;
  for (const ex of [-r * 0.4, r * 0.4]) { ctx.fillStyle = '#eaffd0'; circle(ex, -r * 0.15, r * 0.3); ctx.fill(); ctx.fillStyle = '#101a08'; circle(ex + fd * r * 0.08, -r * 0.15, r * 0.16); ctx.fill(); }
  ctx.fillStyle = '#2a1140'; ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 0.4, r * 0.18, 0, 0, TAU); ctx.fill();
  ctx.restore();
  if (m.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${m.flash / 0.12 * 0.7})`; circle(cx, cy, r + 2); ctx.fill(); }
}
function drawBoss(m) {
  const cx = m.px + m.w / 2, footY = m.py + m.h, r = m.w * 0.5, cy = footY - r * 0.95, t = gameTime, wob = 1 + Math.sin(t * 4) * 0.04;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, footY + 1, r, 4, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = '#205015';
  for (let i = -3; i <= 3; i++) { const px = i * r * 0.28; ctx.beginPath(); ctx.moveTo(px - 4, -r * 0.55); ctx.lineTo(px, -r * 1.25); ctx.lineTo(px + 4, -r * 0.55); ctx.closePath(); ctx.fill(); }
  for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * r * 0.95, r * 0.35); ctx.lineTo(sgn * r * 1.35, r * 0.7); ctx.lineTo(sgn * r * 0.9, r * 0.85); ctx.closePath(); ctx.fill(); }
  ctx.save(); ctx.scale(wob, 2 - wob);
  ctx.fillStyle = '#143309'; ctx.beginPath(); ctx.ellipse(0, 0, r + 2, r * 1.05 + 2, 0, 0, TAU); ctx.fill();
  const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 3, 0, 0, r * 1.05); bg.addColorStop(0, '#7fd84a'); bg.addColorStop(1, '#2f7d1f');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.05, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(30,80,18,0.6)'; circle(-r * 0.4, r * 0.35, r * 0.25); ctx.fill(); circle(r * 0.45, -r * 0.05, r * 0.18); ctx.fill();
  ctx.restore();
  const fd = m.dir || 1;
  for (const [ex, ey] of [[-r * 0.42, -r * 0.12], [r * 0.42, -r * 0.12], [0, -r * 0.5]]) { ctx.fillStyle = '#eaffd0'; circle(ex, ey, r * 0.2); ctx.fill(); ctx.fillStyle = '#c2ff2e'; circle(ex, ey, r * 0.13); ctx.fill(); ctx.fillStyle = '#0c1505'; circle(ex + fd * r * 0.06, ey, r * 0.07); ctx.fill(); }
  ctx.strokeStyle = '#163a0c'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.4); ctx.lineTo(-r * 0.18, -r * 0.22); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.4); ctx.lineTo(r * 0.18, -r * 0.22); ctx.stroke();
  ctx.fillStyle = '#16300c'; ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 0.55, r * 0.26, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.22 - 2.4, r * 0.28); ctx.lineTo(i * r * 0.22 + 2.4, r * 0.28); ctx.lineTo(i * r * 0.22, r * 0.55); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  if (m.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${m.flash / 0.12 * 0.7})`; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.1, r * 1.15, 0, 0, TAU); ctx.fill(); }
}
function drawEBullet(e) {
  const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 7); glow.addColorStop(0, 'rgba(155,255,90,0.9)'); glow.addColorStop(1, 'rgba(120,200,40,0)');
  ctx.fillStyle = glow; circle(e.x, e.y, 7); ctx.fill(); ctx.fillStyle = '#9bff5a'; circle(e.x, e.y, 3.2); ctx.fill(); ctx.fillStyle = '#3f8a22'; circle(e.x + 1, e.y + 1, 1.2); ctx.fill();
}
function drawStar(cx, cy, R, ph) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(gameTime * 2 + ph) * 0.15);
  const g = ctx.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#ffe98a'); g.addColorStop(1, '#ffb300'); ctx.fillStyle = g; ctx.strokeStyle = '#c78a00'; ctx.lineWidth = 1;
  ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? R * 0.45 : R; const x = Math.cos(a) * rr2, y = Math.sin(a) * rr2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.8)'; circle(-R * 0.2, -R * 0.25, R * 0.18); ctx.fill(); ctx.restore();
}
function drawProjectile(b) {
  if (b.kind === 'axe') {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.spin);
    ctx.fillStyle = '#6e4a26'; rr(-1.5, -1, 11, 2.4, 1); ctx.fill();
    ctx.fillStyle = '#cfd6e2'; ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(14, -2); ctx.lineTo(14, 4); ctx.lineTo(7, 6); ctx.quadraticCurveTo(10, 0, 7, -5); ctx.closePath(); ctx.fill(); ctx.restore();
  } else if (b.kind === 'rocket') {
    const ang = Math.atan2(b.vy, b.vx); ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(ang);
    const fl = ctx.createRadialGradient(-7, 0, 0, -7, 0, 7); fl.addColorStop(0, '#fff3b0'); fl.addColorStop(0.5, '#ff8a2f'); fl.addColorStop(1, 'rgba(255,90,40,0)'); ctx.fillStyle = fl; circle(-7, 0, 7); ctx.fill();
    ctx.fillStyle = '#d6dae2'; rr(-4, -3, 9, 6, 3); ctx.fill();
    ctx.fillStyle = '#ff3b4d'; ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(11, 0); ctx.lineTo(5, 3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(-6, -5); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); ctx.restore();
  } else {
    const ang = Math.atan2(b.vy, b.vx); ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(ang);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 9); glow.addColorStop(0, 'rgba(120,235,255,0.9)'); glow.addColorStop(1, 'rgba(80,200,255,0)'); ctx.fillStyle = glow; circle(0, 0, 9); ctx.fill();
    ctx.fillStyle = '#eafcff'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#43e0ff'; ctx.beginPath(); ctx.ellipse(-1, 0, 3, 1.6, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
}
function drawFlag() {
  const fx = level.flagX * TILE, fy = (level.flagY + 1) * TILE;
  ctx.fillStyle = '#d7dde6'; rr(fx + 6, fy - 50, 3, 50, 1.5); ctx.fill();
  const wave = Math.sin(gameTime * 4) * 2; ctx.fillStyle = '#ff3b6b';
  ctx.beginPath(); ctx.moveTo(fx + 9, fy - 49); ctx.quadraticCurveTo(fx + 20 + wave, fy - 45, fx + 22, fy - 40); ctx.quadraticCurveTo(fx + 16, fy - 38, fx + 9, fy - 38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a3a1f'; rr(fx + 1, fy - 4, 13, 4, 2); ctx.fill();
}

function render() {
  drawBackground();
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
  for (const d of decor) if (d.back) drawDecor(d);
  for (const run of runs) drawRun(run);
  for (let ty = 0; ty < level.H; ty++) for (let tx = 0; tx < level.W; tx++) {
    if (level.solid[ty][tx] !== 3) continue;
    const px = tx * TILE, py = ty * TILE; ctx.fillStyle = '#aeb6c6';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + i * 4, py + TILE); ctx.lineTo(px + i * 4 + 2, py + 3); ctx.lineTo(px + i * 4 + 4, py + TILE); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#6b7385'; rr(px, py + TILE - 3, TILE, 3, 1); ctx.fill();
  }
  for (const d of decor) if (!d.back) drawDecor(d);
  for (const c of chests) drawChest(c);
  if (level.flagSet) drawFlag();
  for (const c of coins) { if (c.got) continue; const bob = Math.sin(gameTime * 3 + c.ph) * 2; drawStar(c.x, c.y + bob, 8, c.ph); }
  for (const m of mutants) { if (m.dead) continue; if (m.type === 'fly') drawFlyer(m); else if (m.type === 'boss') drawBoss(m); else drawMutant(m); }
  drawHero();
  for (const b of bullets) drawProjectile(b);
  for (const e of eBullets) drawEBullet(e);
  for (const p of particles) { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.2)); ctx.fillStyle = p.color; circle(p.x, p.y, p.r); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const f of floaters) { ctx.globalAlpha = Math.max(0, Math.min(1, f.life)); ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.txt, f.x, f.y); ctx.globalAlpha = 1; ctx.textAlign = 'left'; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  drawWeather();
  if (bossRef && !bossRef.dead) {
    const bw = Math.min(canvas.width * 0.6, 420), bx = (canvas.width - bw) / 2, by = 56;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(bx - 4, by - 4, bw + 8, 16, 6); ctx.fill();
    ctx.fillStyle = '#3a1020'; rr(bx, by, bw, 9, 4); ctx.fill();
    ctx.fillStyle = '#ff3b4d'; rr(bx, by, bw * Math.max(0, bossRef.hp / bossRef.maxhp), 9, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(level.bossArena ? '👾 BOSS FINAL' : '👾 MINI-BOSS', canvas.width / 2, by - 8); ctx.textAlign = 'left';
  }
}

// ---------- LOOP ----------
let lastT = 0, loopRunning = false;
function loop(t) { const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016); lastT = t; update(dt); render(); requestAnimationFrame(loop); }

// ---------- BUTTONS ----------
document.getElementById('btn-solo').addEventListener('click', startGame);
document.getElementById('btn-next').addEventListener('click', () => loadLevel(levelIndex + 1));
document.getElementById('btn-replay').addEventListener('click', () => { lives = 3; loadLevel(0); });
document.getElementById('btn-retry').addEventListener('click', () => { lives = 3; loadLevel(levelIndex); });
document.querySelectorAll('.btn-home').forEach((b) => b.addEventListener('click', () => showScreen('home')));
