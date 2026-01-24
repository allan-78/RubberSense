    // ============================================
// 🔌 API Service - Axios Configuration
// ============================================

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle responses
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || error.message);
  }
);

// Auth endpoints
export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  login: (data) => api.post('/api/auth/login', data),
  getMe: () => api.get('/api/auth/me')
};

// Tree endpoints
export const treeAPI = {
  getAll: () => api.get('/api/trees'),
  getOne: (id) => api.get(`/api/trees/${id}`),
  create: (data) => api.post('/api/trees', data),
  update: (id, data) => api.put(`/api/trees/${id}`, data),
  delete: (id) => api.delete(`/api/trees/${id}`),
  getStats: () => api.get('/api/trees/stats/summary')
};

// Scan endpoints
export const scanAPI = {
  getAll: () => api.get('/api/scans'),
  getOne: (id) => api.get(`/api/scans/${id}`),
  upload: (formData) => api.post('/api/scans/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
};

// Latex endpoints
export const latexAPI = {
  getAll: () => api.get('/api/latex'),
  getOne: (id) => api.get(`/api/latex/${id}`),
  create: (formData) => api.post('/api/latex/batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getStats: () => api.get('/api/latex/stats/summary'),
  delete: (id) => api.delete(`/api/latex/${id}`)
};

export default api;
