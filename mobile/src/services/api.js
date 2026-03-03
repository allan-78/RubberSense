// ============================================
// 🔌 API Service
// ============================================

import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RandomForestRegressor } from './RandomForest';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://allan12345-rubbersense.hf.space').replace(/\/$/, '');

console.log('🔌 [API Service] Initialized');
console.log('🔗 [API Service] Using API URL:', API_URL);

const ABSOLUTE_URL_PATTERN = /^(?:https?:)?\/\//i;
const SPECIAL_URL_PATTERN = /^(?:data:|blob:|file:|content:)/i;
const isPrivateOrLocalHost = (host = '') => {
  const hostname = String(host || '').trim().toLowerCase();
  if (!hostname) return false;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|10\.0\.2\.2)$/i.test(hostname)) return true;
  if (hostname.startsWith('192.168.')) return true;
  if (hostname.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
};

export const resolveMediaUrl = (value, apiBaseUrl = API_URL) => {
  if (!value) return '';

  let input = value;
  if (typeof input === 'object' && input.url) {
    input = input.url;
  }

  if (typeof input !== 'string') return '';

  const trimmed = input.trim();
  if (!trimmed) return '';

  if (SPECIAL_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed)) {
    try {
      const mediaUrl = new URL(trimmed);
      if (isPrivateOrLocalHost(mediaUrl.hostname)) {
        const base = new URL(String(apiBaseUrl || API_URL));
        mediaUrl.protocol = base.protocol;
        mediaUrl.hostname = base.hostname;
        mediaUrl.port = base.port;
        return mediaUrl.toString();
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }

  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return base ? `${base}${path}` : path;
};

export const resolveUserProfileImage = (user = {}, apiBaseUrl = API_URL) => {
  const candidates = [
    user?.profileImage,
    user?.profilePicture?.url,
    user?.profilePicture,
    user?.avatar?.url,
    user?.avatar,
    user?.imageUrl,
    user?.photoURL,
  ];

  for (const candidate of candidates) {
    const url = resolveMediaUrl(candidate, apiBaseUrl);
    if (url) return url;
  }

  return '';
};

const looksLikeUserEntity = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  if ('profileImage' in value || 'avatar' in value || 'profilePicture' in value) {
    return true;
  }

  const hasId = Boolean(value?._id || value?.id || value?.userId);
  const hasIdentityFields = Boolean(value?.name || value?.email || value?.username);

  if (hasId && hasIdentityFields) {
    return true;
  }

  return Array.isArray(value?.followers) || Array.isArray(value?.following);
};

export const normalizeUserEntity = (user = {}, apiBaseUrl = API_URL) => {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return user;

  const profileImage = resolveUserProfileImage(user, apiBaseUrl);
  if (profileImage) {
    user.profileImage = profileImage;
  }

  if (typeof user.avatar === 'string') {
    const avatarUrl = resolveMediaUrl(user.avatar, apiBaseUrl);
    if (avatarUrl) user.avatar = { url: avatarUrl };
  }

  if (typeof user.profilePicture === 'string') {
    const pictureUrl = resolveMediaUrl(user.profilePicture, apiBaseUrl);
    if (pictureUrl) user.profilePicture = { url: pictureUrl };
  }

  return user;
};

export const normalizeUsersDeep = (value, apiBaseUrl = API_URL, seen = new WeakSet()) => {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => normalizeUsersDeep(item, apiBaseUrl, seen));
    return value;
  }

  Object.keys(value).forEach((key) => {
    normalizeUsersDeep(value[key], apiBaseUrl, seen);
  });

  if (looksLikeUserEntity(value)) {
    normalizeUserEntity(value, apiBaseUrl);
  }

  return value;
};

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
const MAX_RETRIES = 1;
const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);
const NON_RETRY_URL_MARKERS = ['/api/scans/upload', '/api/latex/batch', '/upload', '/batch'];

const getErrorMessage = (error) => {
  if (!error) return 'Request failed';

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object') {
    const fromResponse = error?.response?.data;
    if (typeof fromResponse === 'string' && fromResponse.trim()) {
      return fromResponse;
    }

    const fromPayload =
      fromResponse?.error ||
      fromResponse?.message ||
      error?.error ||
      error?.message;
    if (fromPayload) {
      return String(fromPayload);
    }
  }

  return 'Request failed';
};

const normalizeApiError = (error) => {
  const payload = error?.response?.data;
  const message = getErrorMessage(error);

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...payload,
      message: payload.message || payload.error || message,
      error: payload.error || payload.message || message,
    };
  }

  return { success: false, message, error: message };
};

const shouldRetryRequest = (error, config) => {
  if (!config || config.__skipRetry) return false;

  const method = String(config.method || 'get').toLowerCase();
  if (!RETRYABLE_METHODS.has(method)) return false;
  if (config.data instanceof FormData) return false;

  const requestUrl = `${config.baseURL || ''}${config.url || ''}`.toLowerCase();
  if (NON_RETRY_URL_MARKERS.some((marker) => requestUrl.includes(marker))) {
    return false;
  }

  const status = Number(error?.response?.status || 0);
  return status >= 500 || error?.code === 'ECONNABORTED' || error?.message === 'Network Error';
};

api.interceptors.response.use(
  (response) => {
    const payload = response.data;
    normalizeUsersDeep(payload);
    return payload;
  },
  async (error) => {
    const config = error.config;
    
    // Initialize retry count if not present
    if (config && typeof config.retryCount !== 'number') {
      config.retryCount = 0;
    }

    const canRetry = shouldRetryRequest(error, config);

    if (canRetry) {
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
    
    return Promise.reject(normalizeApiError(error));
  }
);

// Auth API
// Add to existing authAPI object
export const authAPI = {
  login: (data) => api.post('/api/auth/login', data),
  register: (data) => api.post('/api/auth/register', data),
  getMe: async () => {
    try {
      return await api.get('/api/v1/users/me');
    } catch {
      return api.get('/api/auth/me');
    }
  },
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

const extractObjectPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
};

const extractArrayPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
    return payload.data;
  }
  return null;
};

const parseNumericCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const cloneFormData = (formData) => {
  if (!formData || !Array.isArray(formData?._parts)) {
    return formData;
  }

  const cloned = new FormData();
  formData._parts.forEach(([key, value]) => {
    cloned.append(key, value);
  });
  return cloned;
};

const parseFetchJson = async (res) => {
  const text = await res.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { success: res.ok, message: text };
  }
};

const isLikelyTransportError = (error) => {
  const message = String(
    error?.message ||
    error?.error ||
    ''
  ).toLowerCase();

  if (!message) return false;

  return (
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('connection refused') ||
    message.includes('socket') ||
    message.includes('timed out')
  );
};

// User API
export const userAPI = {
  // Keep mobile aligned with web follow/profile endpoints (v1 compat routes).
  getProfile: async (id) => {
    const baseRes = await api.get(`/api/v1/users/${id}`);
    const basePayload = extractObjectPayload(baseRes) || {};
    const merged = { ...basePayload };

    const [statsRes, followersRes, followingRes] = await Promise.all([
      api.get(`/api/v1/users/${id}/stats`).catch(() => null),
      api.get(`/api/v1/users/${id}/followers`).catch(() => null),
      api.get(`/api/v1/users/${id}/following`).catch(() => null),
    ]);

    const statsPayload = extractObjectPayload(statsRes);
    if (statsPayload && typeof statsPayload === 'object') {
      merged.stats = { ...(merged.stats || {}), ...statsPayload };
    }

    const followersList = extractArrayPayload(followersRes);
    if (Array.isArray(followersList)) {
      merged.followers = followersList;
    }

    const followingList = extractArrayPayload(followingRes);
    if (Array.isArray(followingList)) {
      merged.following = followingList;
    }

    const followersFromStats =
      parseNumericCount(merged?.stats?.totalFollowers) ??
      parseNumericCount(merged?.stats?.followers);
    const followingFromStats =
      parseNumericCount(merged?.stats?.totalFollowing) ??
      parseNumericCount(merged?.stats?.following);

    const followersCount =
      parseNumericCount(merged?.followersCount) ??
      followersFromStats ??
      (Array.isArray(merged?.followers) ? merged.followers.length : 0);
    const followingCount =
      parseNumericCount(merged?.followingCount) ??
      followingFromStats ??
      (Array.isArray(merged?.following) ? merged.following.length : 0);

    merged.followersCount = followersCount;
    merged.followingCount = followingCount;
    merged.stats = {
      ...(merged.stats || {}),
      totalFollowers: followersCount,
      totalFollowing: followingCount,
      followers: followersCount,
      following: followingCount,
    };

    const normalized = normalizeUserEntity(merged);
    const responseMeta = (baseRes && typeof baseRes === 'object' && !Array.isArray(baseRes)) ? baseRes : {};

    return {
      ...responseMeta,
      success: typeof responseMeta.success === 'boolean' ? responseMeta.success : true,
      data: normalized,
    };
  },
  getFollowStatus: (id) => api.get(`/api/v1/users/${id}/follow-status`),
  followUser: (id) => api.post(`/api/v1/users/${id}/follow`),
  unfollowUser: (id) => api.delete(`/api/v1/users/${id}/unfollow`),
  toggleFollow: async (id) => {
    try {
      const statusRes = await api.get(`/api/v1/users/${id}/follow-status`);
      const isFollowingNow = Boolean(statusRes?.isFollowing);

      if (isFollowingNow) {
        const res = await api.delete(`/api/v1/users/${id}/unfollow`);
        return { ...(res || {}), isFollowing: false };
      }

      const res = await api.post(`/api/v1/users/${id}/follow`);
      return { ...(res || {}), isFollowing: true };
    } catch (error) {
      // Backward-compatible fallback if follow-status/v1 follow endpoints are unavailable.
      const fallbackRes = await api.put(`/api/users/${id}/follow`);
      return fallbackRes;
    }
  },
  blockUser: async (id) => {
    try {
      return await api.put(`/api/v1/users/${id}/block`);
    } catch {
      return api.put(`/api/users/${id}/block`);
    }
  },
  unblockUser: async (id) => {
    try {
      return await api.put(`/api/v1/users/${id}/unblock`);
    } catch {
      return api.put(`/api/users/${id}/unblock`);
    }
  },
  updateProfile: async (formData) => {
    const token = await AsyncStorage.getItem('token');
    const emulatorBase = Platform.OS === 'android'
      ? getAndroidEmulatorBaseURL(API_URL)
      : null;
    const baseCandidates = [API_URL];
    if (emulatorBase && !baseCandidates.includes(emulatorBase)) {
      baseCandidates.push(emulatorBase);
    }

    const endpointCandidates = ['/api/v1/users/me/update', '/api/users/profile'];
    let lastError = null;

    for (const endpoint of endpointCandidates) {
      for (const base of baseCandidates) {
        const url = `${String(base || '').replace(/\/$/, '')}${endpoint}`;
        try {
          const res = await fetch(url, {
            method: 'PUT',
            headers: {
              Authorization: token ? `Bearer ${token}` : undefined,
              'Bypass-Tunnel-Reminder': 'true',
            },
            body: cloneFormData(formData),
          });

          const json = await parseFetchJson(res);
          if (!res.ok) {
            throw json;
          }

          return json;
        } catch (error) {
          const reason =
            error?.error ||
            error?.message ||
            error?.details ||
            (typeof error === 'string' ? error : JSON.stringify(error));
          console.log(`[updateProfile] fetch failed for ${url}:`, reason);
          lastError = error;
        }
      }
    }

    throw lastError || { error: 'Profile update failed' };
  },
};

// Message API
export const messageAPI = {
  getConversations: () => api.get('/api/messages/conversations'),
  getRequests: () => api.get('/api/messages/requests'),
  getStatus: (userId) => api.get(`/api/messages/status/${userId}`),
  respondToRequest: (senderId, action) => api.put(`/api/messages/requests/${senderId}`, { action }),
  getMessages: (userId) => api.get(`/api/messages/${userId}`),
  deleteMessage: (messageId) => api.delete(`/api/messages/${messageId}`),
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
    const token = await AsyncStorage.getItem('token');
    const primaryBase = api.defaults.baseURL || API_URL;
    const emulatorBase = Platform.OS === 'android'
      ? getAndroidEmulatorBaseURL(primaryBase)
      : null;
    const baseCandidates = [primaryBase];
    if (emulatorBase && !baseCandidates.includes(emulatorBase)) {
      baseCandidates.push(emulatorBase);
    }

    let lastError = null;

    for (const base of baseCandidates) {
      const url = `${String(base || '').replace(/\/$/, '')}/api/scans/upload`;
      let timeoutId;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 180000);

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: token ? `Bearer ${token}` : undefined,
            'Bypass-Tunnel-Reminder': 'true',
          },
          body: cloneFormData(formData),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const json = await parseFetchJson(res);
        if (!res.ok) {
          throw json;
        }

        return json;
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        lastError = error;
        const message = getErrorMessage(error);
        console.warn(`[scanAPI.upload] attempt failed for ${url}: ${message}`);

        const isAbort = String(error?.name || '').toLowerCase() === 'aborterror';
        const hasServerResponse =
          error &&
          typeof error === 'object' &&
          (Object.prototype.hasOwnProperty.call(error, 'success') ||
            Object.prototype.hasOwnProperty.call(error, 'error') ||
            Object.prototype.hasOwnProperty.call(error, 'message'));

        // Do not replay uploads after timeout or explicit server response to avoid duplicate heavy jobs.
        if (isAbort || hasServerResponse || !isLikelyTransportError(error)) {
          break;
        }
      }
    }

    if (lastError) {
      throw normalizeApiError(lastError);
    }

    throw {
      success: false,
      message: 'Upload failed. Please try again.',
      error: 'Upload failed. Please try again.',
    };
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

// Notification API
export const notificationAPI = {
  getAll: () => api.get('/api/notifications'),
  getUnread: () => api.get('/api/notifications/unread'),
  registerPushToken: (payload) => api.post('/api/notifications/push-token', payload),
  unregisterPushToken: (token) => api.delete('/api/notifications/push-token', { data: { token } }),
  markAsRead: (id) => api.put(`/api/notifications/${id}/read`, {}),
  markAllAsRead: () => api.put('/api/notifications/mark-all-read', {}),
  delete: (id) => api.delete(`/api/notifications/${id}`),
};

// Sync API (shared payload for web + mobile bootstrap)
export const syncAPI = {
  getAll: () => api.get('/api/sync/all'),
  getAllV1: () => api.get('/api/v1/sync/all'),
};

// Mail/announcement API aligned with web.
export const mailAPI = {
  getAnnouncements: () => api.get('/api/v1/mail/announcements'),
  markAnnouncementAsRead: (id) => api.put(`/api/v1/mail/announcements/${id}/read`, {}),
  getUnreadCount: () => api.get('/api/v1/mail/unread/count'),
  markAllAsRead: () => api.put('/api/v1/mail/mark-all-read', {}),
};

// Contact/Support API
export const contactAPI = {
  create: (data) => api.post('/api/contact', data),
  getMy: () => api.get('/api/contact/my'),
  getOne: (id) => api.get(`/api/contact/${id}`),
  reply: (id, text) => api.post(`/api/contact/${id}/reply`, { text }),
  markAsRead: (id) => api.put(`/api/contact/${id}/read`, {}),
};

export default api;
