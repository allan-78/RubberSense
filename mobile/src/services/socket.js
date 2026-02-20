import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client/dist/socket.io.js';
import { API_URL } from './api';

let socketInstance = null;
let connectedUserId = null;

const normalizeUserId = (user) => String(user?._id || user?.id || user || '');

export const connectSocket = async (user) => {
  const userId = normalizeUserId(user);
  if (!userId) return null;

  if (socketInstance && connectedUserId === userId) {
    if (!socketInstance.connected) socketInstance.connect();
    return socketInstance;
  }

  const token = await AsyncStorage.getItem('token');
  if (!token) return null;

  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
  }

  socketInstance = io(API_URL, {
    transports: ['websocket', 'polling'],
    auth: {
      token: `Bearer ${token}`,
    },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 15000,
  });

  connectedUserId = userId;
  return socketInstance;
};

export const getSocket = () => socketInstance;

export const disconnectSocket = () => {
  if (!socketInstance) return;
  socketInstance.removeAllListeners();
  socketInstance.disconnect();
  socketInstance = null;
  connectedUserId = null;
};
