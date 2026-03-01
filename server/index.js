const path = require('path');
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
    socket.to(room).emit('state', payload);
  });

  socket.on('disconnect', () => {
    // Optionally clear room state when last person leaves (we keep it for now)
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Our World server at http://localhost:${PORT}`);
  console.log('Open this URL in your browser to use the app and collaborate.');
});
