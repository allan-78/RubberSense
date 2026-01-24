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
  timeout: 60000, // Increased to 60 seconds for slow networks
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
let retryCount = 0;
const MAX_RETRIES = 2;

api.interceptors.response.use(
  (response) => {
    retryCount = 0; // Reset on success
    return response.data;
  },
  async (error) => {
    const config = error.config;
    
    // Retry logic for network/timeout errors
    if (
      error.response?.status === 500 || 
      error.code === 'ECONNABORTED' || 
      error.message === 'Network Error'
    ) {
      if (retryCount < MAX_RETRIES && config) {
        retryCount++;
        console.log(`🔄 Retrying request (${retryCount}/${MAX_RETRIES})...`);
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        
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
  resendVerification: (email) => api.post('/api/auth/resend-verification', { email }),
  googleLogin: (data) => api.post('/api/auth/google', data), // For future implementation
};


// Tree API
export const treeAPI = {
  getAll: () => api.get('/api/trees'),
  getOne: (id) => api.get(`/api/trees/${id}`),
  create: (data) => api.post('/api/trees', data),
  getStats: () => api.get('/api/trees/stats/summary'),
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

export default api;
