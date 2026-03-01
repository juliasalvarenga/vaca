const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Serve static files from project root (run from project root: node server/index.js)
app.use(express.static(path.join(__dirname, '..')));

const io = new Server(server, {
  cors: { origin: '*' },
});

const roomState = new Map(); // roomId -> state
const dataDir = path.join(__dirname, '..', 'data');
const roomsFile = path.join(dataDir, 'rooms.json');

function loadRooms() {
  try {
    if (!fs.existsSync(roomsFile)) return;
    const raw = fs.readFileSync(roomsFile, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      for (const [room, state] of Object.entries(data)) {
        if (state && (state.items || state.panX != null)) {
          roomState.set(room, state);
        }
      }
    }
  } catch (e) {
    console.warn('Could not load room data:', e.message);
  }
}

function saveRooms() {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const data = {};
    for (const [room, state] of roomState) {
      data[room] = state;
    }
    fs.writeFileSync(roomsFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not save room data:', e.message);
  }
}

loadRooms();

io.on('connection', (socket) => {
  socket.on('join', (roomId) => {
    const room = String(roomId).trim().toUpperCase().slice(0, 12) || 'DEFAULT';
    socket.roomId = room;
    socket.join(room);

    const existing = roomState.get(room);
    if (existing) {
      socket.emit('state', existing);
    }
  });

  socket.on('state', (state) => {
    const room = socket.roomId;
    if (!room) return;

    const payload = {
      panX: state.panX,
      panY: state.panY,
      zoom: state.zoom,
      items: state.items || [],
      nextZ: state.nextZ || 1,
    };
    roomState.set(room, payload);
    saveRooms();
    socket.to(room).emit('state', payload);
  });

  socket.on('disconnect', () => {
    // Room state kept for persistence
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Our World server at http://localhost:${PORT}`);
  console.log('Open this URL in your browser to use the app and collaborate.');
});
