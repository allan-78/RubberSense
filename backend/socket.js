const jwt = require('jsonwebtoken');
const User = require('./models/User');

let ioInstance = null;

const extractToken = (socket) => {
  const authToken = socket?.handshake?.auth?.token;
  if (authToken && typeof authToken === 'string') return authToken;
  const headerToken = socket?.handshake?.headers?.authorization;
  if (headerToken && typeof headerToken === 'string') return headerToken;
  return null;
};

const normalizeBearer = (token = '') => {
  if (!token) return '';
  return token.startsWith('Bearer ') ? token.slice(7) : token;
};

const initializeSocket = (httpServer) => {
  const { Server } = require('socket.io');

  ioInstance = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  ioInstance.use(async (socket, next) => {
    try {
      const rawToken = extractToken(socket);
      const token = normalizeBearer(rawToken || '');
      if (!token) {
        return next(new Error('Unauthorized'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id isActive');
      if (!user || user.isActive === false) {
        return next(new Error('Unauthorized'));
      }

      socket.userId = String(user._id);
      return next();
    } catch (error) {
      return next(new Error('Unauthorized'));
    }
  });

  ioInstance.on('connection', (socket) => {
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }
  });

  return ioInstance;
};

const getSocketServer = () => ioInstance;

const emitToUser = (userId, event, payload) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${String(userId)}`).emit(event, payload);
};

module.exports = {
  initializeSocket,
  getSocketServer,
  emitToUser,
};
