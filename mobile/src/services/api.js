// ============================================
// 🔌 API Service
// ============================================

import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RandomForestRegressor } from './RandomForest';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.143.82.142:5000';

console.log('🔌 [API Service] Initialized');
console.log('🔗 [API Service] Using API URL:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
  timeout: 120000, // Increased to 120s to handle AI processing
});

const getAndroidEmulatorBaseURL = (baseURL) => {
  if (!baseURL) return null;
  try {
    const url = new URL(baseURL);
    const host = url.hostname;
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    const isLan =
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (!isLocalhost && !isLan) return null;
    const port = url.port ? `:${url.port}` : '';
    return `${url.protocol}//10.0.2.2${port}`;
  } catch {
    return null;
  }
};

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

      if (error.message === 'Network Error' && Platform.OS === 'android' && !config.__triedEmulatorFallback) {
        const fallbackBaseURL = getAndroidEmulatorBaseURL(config.baseURL || API_URL);
        if (fallbackBaseURL && fallbackBaseURL !== (config.baseURL || API_URL)) {
          config.__triedEmulatorFallback = true;
          config.baseURL = fallbackBaseURL;
          api.defaults.baseURL = fallbackBaseURL;
          return api(config);
        }
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
  changePassword: (data) => api.put('/api/auth/change-password', data),
  deactivateAccount: (data) => api.put('/api/auth/deactivate-account', data),
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
  blockUser: (id) => api.put(`/api/users/${id}/block`),
  unblockUser: (id) => api.put(`/api/users/${id}/unblock`),
  updateProfile: async (formData) => {
    try {
      return await api.put('/api/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (err) {
      console.log('Axios updateProfile failed, trying fetch fallback:', err.message);
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/users/profile`, {
          method: 'PUT',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
            'Bypass-Tunnel-Reminder': 'true',
          },
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          throw json; // This will be caught by the outer catch if structured error
        }
        return json;
      } catch (e) {
        throw e;
      }
    }
  },
};

// Message API
export const messageAPI = {
  getConversations: () => api.get('/api/messages/conversations'),
  getRequests: () => api.get('/api/messages/requests'),
  getStatus: (userId) => api.get(`/api/messages/status/${userId}`),
  respondToRequest: (senderId, action) => api.put(`/api/messages/requests/${senderId}`, { action }),
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
  reanalyze: (id) => api.post(`/api/scans/${id}/analyze`),
  upload: async (formData) => {
    try {
      // Let axios set the Content-Type with boundary automatically
      return await api.post('/api/scans/upload', formData, {
        transformRequest: (data, headers) => {
          return data; // Prevent axios from serializing formData
        },
      });
    } catch (err) {
      console.log('❌ Axios upload failed, trying fetch fallback:', err.message);
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/scans/upload`, {
          method: 'POST',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
            'Bypass-Tunnel-Reminder': 'true',
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

// Latex API
export const latexAPI = {
  getAll: () => api.get('/api/latex'),
  createBatch: async (formData) => {
    try {
      // First attempt with fetch (more reliable for FormData)
      console.log('🚀 Sending createBatch request via fetch to:', api.defaults.baseURL || API_URL);
      const token = await AsyncStorage.getItem('token');
      const url = `${api.defaults.baseURL || API_URL}/api/latex/batch`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined,
          'Bypass-Tunnel-Reminder': 'true',
          // NO Content-Type header
        },
        body: formData,
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        if (!res.ok) throw new Error(`Server returned ${res.status}: ${text.substring(0, 100)}`);
        throw new Error('Invalid JSON response');
      }

      if (!res.ok) throw json;
      return json;

    } catch (err) {
      const errorMsg = err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      console.log('❌ Primary fetch createBatch failed:', errorMsg);
      
      // If not a network error (e.g. 400 Bad Request), throw immediately
      // But fetch doesn't throw on 400/500, so if we are here, it's likely network error or we threw it above.
      // If it's a server error (e.g. 500) we might want to try fallback only if it's connection related?
      // Actually, if it's 500, fallback to same server won't help.
      // But if it's "Network request failed", we try fallback.
      
      if (!errorMsg.includes('Network request failed') && !errorMsg.includes('fetch')) {
         // It might be a logic error from server
         throw err;
      }

      // Network error or connection refused -> Try fallbacks
      try {
        const token = await AsyncStorage.getItem('token');
        const port = (API_URL.split(':').pop() || '5000').replace(/\//g, '');
        
        // List of candidate URLs to try
        const candidates = [];
        
        // 1. Emulator Loopback (Android only)
        if (Platform.OS === 'android') {
          candidates.push(`http://10.0.2.2:${port}/api/latex/batch`);
        }
        
        // 2. The configured API_URL (if different from what we tried?)
        // If we already tried API_URL and it failed, trying again might be redundant unless it was intermittent.
        // But let's keep it in the list just in case.
        if (api.defaults.baseURL && api.defaults.baseURL !== API_URL) {
             candidates.push(`${api.defaults.baseURL}/api/latex/batch`);
        }
        
        console.log('🔄 Starting fallback sequence. Candidates:', candidates);

        let lastError = null;

        for (const url of candidates) {
          try {
            console.log('Trying fallback URL:', url);
            // Add timeout for fallback
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for fallback

            const res = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: token ? `Bearer ${token}` : undefined,
                'Bypass-Tunnel-Reminder': 'true',
              },
              body: formData,
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            const text = await res.text();
            console.log(`📥 Response from ${url}: status=${res.status}, length=${text.length}`);

            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                if (!res.ok) throw new Error(`Server returned ${res.status}: ${text.substring(0, 50)}`);
            }

            if (!res.ok) {
              throw json || { error: `Request failed with status ${res.status}` };
            }
            
            console.log('✅ Fallback successful using:', url);
            return json; // Success!

          } catch (e) {
            console.warn(`⚠️ Fallback to ${url} failed:`, e.message);
            lastError = e;
            // Continue to next candidate
          }
        }

        // If all candidates failed
        throw new Error(`All connection attempts failed. Last error: ${lastError?.message || 'Unknown network error'}`);

      } catch (fallbackErr) {
        console.error('❌ All upload attempts failed:', fallbackErr);
        throw fallbackErr;
      }
    }
  },
  reanalyze: (id) => api.post(`/api/latex/${id}/analyze`),
  getStats: () => api.get('/api/latex/stats/summary'),
};

// Chat API
export const chatAPI = {
  sendMessage: (message) => api.post('/api/chat/message', { message }),
};

// Market API (Backend + Groq AI)
export const marketAPI = {
  getForecast: (forceRefresh = false) => api.get(`/api/market/latest?force=${forceRefresh}`),
  getHistory: () => api.get('/api/market/history')
};

export default api;
