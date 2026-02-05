// ============================================
// 🔌 API Service
// ============================================

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.88.248.142:5000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // Increased to 30s to handle AI processing
});

// Add token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle responses with retry logic
const MAX_RETRIES = 2;

api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  async (error) => {
    const config = error.config;
    
    // Initialize retry count if not present
    if (!config || !config.retryCount) {
      if (config) config.retryCount = 0;
    }
    
    // Retry logic for network/timeout errors
    if (
      config &&
      (error.response?.status === 500 || 
      error.code === 'ECONNABORTED' || 
      error.message === 'Network Error')
    ) {
      // Don't retry upload requests on 500 errors to avoid duplicates
      // But allow retrying on Network Errors (connection failed)
      if (
        (config.url.includes('/upload') || config.url.includes('/batch')) && 
        error.response?.status === 500
      ) {
         return Promise.reject(error.response?.data || error.message);
      }

      if (config.retryCount < MAX_RETRIES) {
        config.retryCount += 1;
        console.log(`🔄 Retrying request (${config.retryCount}/${MAX_RETRIES})...`);
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * config.retryCount));
        
        return api(config);
      }
    }
    
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
    }
    
    return Promise.reject(error.response?.data || error.message);
  }
);

// Auth API
// Add to existing authAPI object
export const authAPI = {
  login: (data) => api.post('/api/auth/login', data),
  register: (data) => api.post('/api/auth/register', data),
  getMe: () => api.get('/api/auth/me'),
  refresh: () => api.post('/api/auth/refresh'),
  resendVerification: (email) => api.post('/api/auth/resend-verification', { email }),
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }),
  googleLogin: (data) => api.post('/api/auth/google', data), // For future implementation
};


// Tree API
export const treeAPI = {
  getAll: () => api.get('/api/trees'),
  getOne: (id) => api.get(`/api/trees/${id}`),
  create: (data) => api.post('/api/trees', data),
  getStats: () => api.get('/api/trees/stats/summary'),
};

// Post API
export const postAPI = {
  getAll: () => api.get('/api/posts'),
  create: (data) => api.post('/api/posts', data),
  getMyPosts: () => api.get('/api/posts/my-posts'),
  toggleLike: (id) => api.put(`/api/posts/${id}/like`),
  addComment: (id, text) => api.post(`/api/posts/${id}/comment`, { text }),
  replyToComment: (postId, commentId, text) => api.post(`/api/posts/${postId}/comment/${commentId}/reply`, { text }),
};

// User API
export const userAPI = {
  getProfile: (id) => api.get(`/api/users/${id}`),
  toggleFollow: (id) => api.put(`/api/users/${id}/follow`),
};

// Message API
export const messageAPI = {
  getConversations: () => api.get('/api/messages/conversations'),
  getMessages: (userId) => api.get(`/api/messages/${userId}`),
  sendMessage: (receiverId, text) => api.post('/api/messages', { receiverId, text }),
};

// Scan API
export const scanAPI = {
  getAll: () => api.get('/api/scans'),
  getOne: (id) => api.get(`/api/scans/${id}`),
  upload: (formData) => api.post('/api/scans/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// Latex API
export const latexAPI = {
  getAll: () => api.get('/api/latex'),
  createBatch: (formData) => api.post('/api/latex/batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getStats: () => api.get('/api/latex/stats/summary'),
};

// Chat API
export const chatAPI = {
  sendMessage: (message) => api.post('/api/chat/message', { message }),
};

export default api;
