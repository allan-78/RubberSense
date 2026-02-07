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
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
      config.timeout = Math.max(config.timeout || 30000, 120000);
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
  createWithMedia: async (formData) => {
    try {
      return await api.post('/api/posts', formData);
    } catch (err) {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/posts`, {
          method: 'POST',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
          },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          throw json;
        }
        return json;
      } catch (e) {
        throw e;
      }
    }
  },
  getMyPosts: () => api.get('/api/posts/my-posts'),
  toggleLike: (id) => api.put(`/api/posts/${id}/like`),
  addComment: (id, text) => api.post(`/api/posts/${id}/comment`, { text }),
  addCommentWithMedia: async (id, formData) => {
    try {
      return await api.post(`/api/posts/${id}/comment`, formData);
    } catch (err) {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/posts/${id}/comment`, {
          method: 'POST',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
          },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          throw json;
        }
        return json;
      } catch (e) {
        throw e;
      }
    }
  },
  replyToComment: (postId, commentId, text) => api.post(`/api/posts/${postId}/comment/${commentId}/reply`, { text }),
  replyToCommentWithMedia: async (postId, commentId, formData) => {
    try {
      return await api.post(`/api/posts/${postId}/comment/${commentId}/reply`, formData);
    } catch (err) {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/posts/${postId}/comment/${commentId}/reply`, {
          method: 'POST',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
          },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          throw json;
        }
        return json;
      } catch (e) {
        throw e;
      }
    }
  },
  updatePost: (postId, data) => api.put(`/api/posts/${postId}`, data),
  updatePostWithMedia: async (postId, formData) => {
    try {
      return await api.put(`/api/posts/${postId}`, formData);
    } catch (err) {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/posts/${postId}`, {
          method: 'PUT',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
          },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          throw json;
        }
        return json;
      } catch (e) {
        throw e;
      }
    }
  },
  deletePost: (postId) => api.delete(`/api/posts/${postId}`),
  updateComment: (postId, commentId, data) => api.put(`/api/posts/${postId}/comment/${commentId}`, data),
  updateCommentWithMedia: async (postId, commentId, formData) => {
    try {
      return await api.put(`/api/posts/${postId}/comment/${commentId}`, formData);
    } catch (err) {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/posts/${postId}/comment/${commentId}`, {
          method: 'PUT',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
          },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          throw json;
        }
        return json;
      } catch (e) {
        throw e;
      }
    }
  },
  deleteComment: (postId, commentId) => api.delete(`/api/posts/${postId}/comment/${commentId}`),
  updateReply: (postId, commentId, replyId, data) => api.put(`/api/posts/${postId}/comment/${commentId}/reply/${replyId}`, data),
  updateReplyWithMedia: async (postId, commentId, replyId, formData) => {
    try {
      return await api.put(`/api/posts/${postId}/comment/${commentId}/reply/${replyId}`, formData);
    } catch (err) {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/posts/${postId}/comment/${commentId}/reply/${replyId}`, {
          method: 'PUT',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
          },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          throw json;
        }
        return json;
      } catch (e) {
        throw e;
      }
    }
  },
  deleteReply: (postId, commentId, replyId) => api.delete(`/api/posts/${postId}/comment/${commentId}/reply/${replyId}`),
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
  sendMessageWithMedia: async (formData) => {
    try {
      return await api.post('/api/messages', formData);
    } catch (err) {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/messages`, {
          method: 'POST',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
          },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          throw json;
        }
        return json;
      } catch (e) {
        throw e;
      }
    }
  },
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
