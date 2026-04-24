const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// --- état serveur ---
// rooms: { [code]: { players: Map<socketId, player>, state: 'lobby'|'playing'|'ended', hostId } }
const rooms = new Map();

const COLORS = ['#ff4f4f','#4fa8ff','#ffd24f','#7dff4f','#d14fff','#ff994f','#4ffff2','#ff4fb5','#a3ff4f','#4f5eff'];

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function getRoomPublic(room) {
  return {
    code: room.code,
    state: room.state,
    hostId: room.hostId,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      angle: p.angle,
      alive: p.alive,
      // role volontairement non expos\u00e9 aux autres pendant la partie
    })),
  };
}

function assignRoles(room) {
  const players = [...room.players.values()];
  const n = players.length;
  // 1 imposteur pour 4-6, 2 pour 7-10
  const nbImposters = n >= 7 ? 2 : 1;
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  shuffled.forEach((p, i) => {
    p.role = i < nbImposters ? 'imposteur' : 'gentil';
    p.alive = true;
  });
}

// positions de spawn dispers\u00e9es dans la maison (carte 1200x800)
const SPAWNS = [
  { x: 150, y: 150 }, { x: 1050, y: 150 }, { x: 600, y: 150 },
  { x: 150, y: 650 }, { x: 1050, y: 650 }, { x: 600, y: 650 },
  { x: 400, y: 400 }, { x: 800, y: 400 }, { x: 250, y: 400 }, { x: 950, y: 400 },
];

function spawnPlayers(room) {
  const players = [...room.players.values()];
  const shuffled = [...SPAWNS].sort(() => Math.random() - 0.5);
  players.forEach((p, i) => {
    const s = shuffled[i % shuffled.length];
    p.x = s.x; p.y = s.y; p.angle = 0;
    p.hiding = false;
  });
}

function checkWin(room) {
  const alive = [...room.players.values()].filter(p => p.alive);
  const imposteurs = alive.filter(p => p.role === 'imposteur');
  const gentils = alive.filter(p => p.role === 'gentil');
  if (imposteurs.length === 0) return 'gentils';
  if (imposteurs.length >= gentils.length) return 'imposteurs';
  return null;
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('createRoom', ({ name }, cb) => {
    const code = genCode();
    const room = {
      code,
      players: new Map(),
      state: 'lobby',
      hostId: socket.id,
      lasers: [],
    };
    rooms.set(code, room);
    joinRoom(socket, room, name);
    currentRoom = room;
    cb && cb({ ok: true, code });
  });

  socket.on('joinRoom', ({ name, code }, cb) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: "Salon introuvable" });
    if (room.state !== 'lobby') return cb && cb({ ok: false, error: "La partie a d\u00e9j\u00e0 commenc\u00e9" });
    if (room.players.size >= 10) return cb && cb({ ok: false, error: "Salon plein (10 max)" });
    joinRoom(socket, room, name);
    currentRoom = room;
    cb && cb({ ok: true, code });
  });

  function joinRoom(sock, room, name) {
    const usedColors = new Set([...room.players.values()].map(p => p.color));
    const color = COLORS.find(c => !usedColors.has(c)) || COLORS[room.players.size % COLORS.length];
    const player = {
      id: sock.id,
      name: (name || 'Joueur').slice(0, 14),
      color,
      x: 600, y: 400, angle: 0,
      alive: true,
      role: null,
      hiding: false,
      lastShotAt: 0,
    };
    room.players.set(sock.id, player);
    sock.join(room.code);
    sock.emit('joined', { code: room.code, youId: sock.id });
    io.to(room.code).emit('roomUpdate', getRoomPublic(room));
  }

  socket.on('startGame', () => {
    const room = currentRoom;
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== 'lobby') return;
    if (room.players.size < 2) {
      socket.emit('errorMsg', 'Il faut au moins 2 joueurs');
      return;
    }
    assignRoles(room);
    spawnPlayers(room);
    room.state = 'playing';
    room.lasers = [];
    // envoyer le r\u00f4le en priv\u00e9 \u00e0 chaque joueur
    for (const p of room.players.values()) {
      io.to(p.id).emit('roleAssigned', { role: p.role });
    }
    io.to(room.code).emit('gameStart', getRoomPublic(room));
  });

  socket.on('move', ({ x, y, angle, hiding }) => {
    const room = currentRoom;
    if (!room || room.state !== 'playing') return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;
    // validation soft des bornes
    p.x = Math.max(20, Math.min(1180, x));
    p.y = Math.max(20, Math.min(780, y));
    p.angle = angle;
    p.hiding = !!hiding;
  });

  socket.on('shoot', ({ angle }) => {
    const room = currentRoom;
    if (!room || room.state !== 'playing') return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive) return;
    const now = Date.now();
    if (now - p.lastShotAt < 450) return; // cadence
    p.lastShotAt = now;

    // raycast simple : trouver le premier joueur touch\u00e9 sur la trajectoire
    const MAX = 600;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let hitPlayer = null;
    let hitDist = MAX;
    for (const other of room.players.values()) {
      if (other.id === p.id || !other.alive || other.hiding) continue;
      // projection
      const ox = other.x - p.x, oy = other.y - p.y;
      const t = ox * dx + oy * dy;
      if (t < 0 || t > MAX) continue;
      const perp = Math.abs(ox * (-dy) + oy * dx);
      if (perp < 22 && t < hitDist) {
        hitDist = t;
        hitPlayer = other;
      }
    }

    io.to(room.code).emit('laser', {
      x: p.x, y: p.y, angle, dist: hitDist, shooter: p.id, color: p.color,
    });

    if (hitPlayer) {
      hitPlayer.alive = false;
      io.to(room.code).emit('eliminated', {
        id: hitPlayer.id,
        by: p.id,
        role: hitPlayer.role,
      });
      const winner = checkWin(room);
      if (winner) {
        room.state = 'ended';
        const reveal = [...room.players.values()].map(pl => ({ id: pl.id, name: pl.name, role: pl.role }));
        io.to(room.code).emit('gameOver', { winner, reveal });
      }
    }
  });

  socket.on('returnLobby', () => {
    const room = currentRoom;
    if (!room || room.hostId !== socket.id) return;
    room.state = 'lobby';
    for (const p of room.players.values()) {
      p.alive = true; p.role = null; p.hiding = false;
    }
    io.to(room.code).emit('roomUpdate', getRoomPublic(room));
    io.to(room.code).emit('backToLobby');
  });

  socket.on('disconnect', () => {
    const room = currentRoom;
    if (!room) return;
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) {
      room.hostId = [...room.players.keys()][0];
    }
    io.to(room.code).emit('roomUpdate', getRoomPublic(room));
    // v\u00e9rifier fin de partie si un imposteur ou tous les gentils partent
    if (room.state === 'playing') {
      const winner = checkWin(room);
      if (winner) {
        room.state = 'ended';
        const reveal = [...room.players.values()].map(pl => ({ id: pl.id, name: pl.name, role: pl.role }));
        io.to(room.code).emit('gameOver', { winner, reveal });
      }
    }
  });
});

// broadcast des positions \u00e0 ~20Hz
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.state !== 'playing') continue;
    const snapshot = [...room.players.values()].map(p => ({
      id: p.id, x: p.x, y: p.y, angle: p.angle,
      alive: p.alive, hiding: p.hiding, name: p.name, color: p.color,
    }));
    io.to(room.code).emit('snapshot', snapshot);
  }
}, 50);

server.listen(PORT, () => {
  console.log(`\n\ud83c\udfae Cache-cache tueur lanc\u00e9 !`);
  console.log(`\u2192 Ouvre http://localhost:${PORT} dans ton navigateur`);
  console.log(`\u2192 Pour jouer avec tes amis sur le m\u00eame wifi : partage ton IP locale + :${PORT}\n`);
});
