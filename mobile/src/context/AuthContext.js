// ============================================
// 🔐 Auth Context (MongoDB + Email Verification)
// ============================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  authAPI,
  userAPI,
  API_URL,
  normalizeUserEntity,
  resolveUserProfileImage,
} from '../services/api';
import { disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    checkAuth();
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const value = await AsyncStorage.getItem('hasSeenOnboarding');
      if (value === 'true') {
        setHasSeenOnboarding(true);
      }
    } catch (error) {
      console.log('Error checking onboarding status:', error);
    }
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      setHasSeenOnboarding(true);
    } catch (error) {
      console.log('Error saving onboarding status:', error);
    }
  };

  const resetOnboarding = async () => {
    try {
      await AsyncStorage.removeItem('hasSeenOnboarding');
      setHasSeenOnboarding(false);
    } catch (error) {
      console.log('Error resetting onboarding status:', error);
    }
  };

  const extractUserPayload = (payload) => {
    const userData =
      payload?.user ||
      payload?.data?.user ||
      payload?.data?.data?.user ||
      payload?.data ||
      null;

    if (!userData || typeof userData !== 'object') return null;

    return normalizeUserEntity({ ...userData });
  };

  const extractTokenPayload = (payload) => {
    return payload?.token || payload?.data?.token || payload?.data?.data?.token || null;
  };

  const hydrateUserFromProfile = async (baseUser) => {
    const normalizedBase = normalizeUserEntity({ ...(baseUser || {}) });
    const userId = normalizedBase?._id || normalizedBase?.id || normalizedBase?.userId;
    if (!userId) return normalizedBase;

    try {
      const profileRes = await userAPI.getProfile(userId);
      const profileData = profileRes?.data || profileRes;
      if (profileData && typeof profileData === 'object') {
        return normalizeUserEntity({
          ...normalizedBase,
          ...profileData,
          _id: profileData?._id || normalizedBase?._id || normalizedBase?.id || normalizedBase?.userId,
        });
      }
    } catch (error) {
      console.log('Hydrate user profile fallback error:', error);
    }

    return normalizedBase;
  };

  // Refresh user data from backend
  const refreshUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return null;

      const response = await authAPI.getMe();
      const userData = extractUserPayload(response);
      
      if (userData) {
        const hydratedUser = await hydrateUserFromProfile(userData);
        await AsyncStorage.setItem('user', JSON.stringify(hydratedUser));
        setUser(hydratedUser);
        return hydratedUser;
      }
      return null;
    } catch (error) {
      console.log('Refresh user error:', error);
      return null;
    }
  };

  const updateFollowingOptimistic = async (targetUser, isNowFollowing) => {
    setUser(prev => {
      if (!prev) return prev;
      const existing = Array.isArray(prev.following) ? prev.following : [];
      const targetUserId = targetUser?._id || targetUser?.id || targetUser?.userId;
      let updatedFollowing;
      if (isNowFollowing) {
        const exists = existing.some(u => String((u && (u._id || u.id || u.userId)) || u) === String(targetUserId));
        if (!exists) {
          const minimal = {
            _id: targetUserId,
            name: targetUser?.name,
            profileImage: resolveUserProfileImage(targetUser),
          };
          updatedFollowing = [...existing, minimal];
        } else {
          updatedFollowing = existing;
        }
      } else {
        updatedFollowing = existing.filter(u => String((u && (u._id || u.id || u.userId)) || u) !== String(targetUserId));
      }
      const updated = {
        ...prev,
        following: updatedFollowing,
        followingCount: updatedFollowing.length,
        followingIds: updatedFollowing.map(u => (u && u._id) ? u._id : u)
      };
      AsyncStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  // Check if user is logged in
  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userData = await AsyncStorage.getItem('user');
      
      if (token) {
        try {
          const res = await authAPI.refresh();
          const newToken = extractTokenPayload(res);
          const refreshedUser = extractUserPayload(res);
          if (newToken) {
            await AsyncStorage.setItem('token', newToken);
          }
          if (refreshedUser) {
            const hydratedUser = await hydrateUserFromProfile(refreshedUser);
            await AsyncStorage.setItem('user', JSON.stringify(hydratedUser));
            setUser(hydratedUser);
          } else if (userData) {
            const parsedUser = JSON.parse(userData);
            const normalizedUser = normalizeUserEntity({ ...(parsedUser || {}) });
            setUser(normalizedUser);
            await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
          }
        } catch (e) {
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('user');
          disconnectSocket();
          setUser(null);
        }
      } else if (userData) {
        const parsedUser = JSON.parse(userData);
        const normalizedUser = normalizeUserEntity({ ...(parsedUser || {}) });
        setUser(normalizedUser);
        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
      }
    } catch (error) {
      console.log('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Email/Password Login
  const login = async (email, password) => {
    try {
      const response = await authAPI.login({ email, password });
      
      const token = extractTokenPayload(response);
      const userData = extractUserPayload(response);
      
      if (token && userData) {
        // Only save token for API calls in current session
        await AsyncStorage.setItem('token', token); 
        const hydratedUser = await hydrateUserFromProfile(userData);
        await AsyncStorage.setItem('user', JSON.stringify(hydratedUser));
        setUser(hydratedUser);
        return { success: true };
      } else {
         return { success: false, error: 'No token or user received' };
      }
    } catch (error) {
      console.log('Login error:', error);
      const errorMessage = error?.error || error?.message || (typeof error === 'string' ? error : 'Login failed');
      return { 
        success: false, 
        error: errorMessage
      };
    }
  };

  // Register new user
  const register = async (name, email, password, phoneNumber) => {
    console.log('🚀 [AuthContext] Registering user:', { name, email, phoneNumber });
    console.log('🔗 [AuthContext] Using API URL:', API_URL);
    
    try {
      console.log('📡 [AuthContext] Sending POST to /api/auth/register...');
      const response = await authAPI.register({
        name,
        email,
        password,
        phoneNumber,
      });

      console.log('✅ [AuthContext] Registration API response received');

      const token = extractTokenPayload(response);
      const userData = extractUserPayload(response);
      
      // Auto-login after registration
      if (token && userData) {
        console.log('💾 [AuthContext] Auto-login: Saving user state temporarily');
        // Do NOT save to AsyncStorage for persistent login
        // await AsyncStorage.setItem('token', token);
        // await AsyncStorage.setItem('user', JSON.stringify(userData));
        // Hydrate from /api/v1/users/:id so avatar/profilePicture-only accounts sync on mobile.
        // We still need to save the token in memory/state for API calls to work in this session
        // But since we removed AsyncStorage, we need a way to pass the token to API service
        // For now, let's keep AsyncStorage for token (needed for API interceptor) but clear it on app close/start
        // OR better: Just don't restore it in checkAuth
        await AsyncStorage.setItem('token', token); 
        const hydratedUser = await hydrateUserFromProfile(userData);
        await AsyncStorage.setItem('user', JSON.stringify(hydratedUser));
        setUser(hydratedUser);
      }

      return { 
        success: true,
        message: response.message 
      };
    } catch (error) {
      console.log('❌ [AuthContext] FULL Error Object:', JSON.stringify(error, null, 2));
      
      if (error.message === 'Network Error') {
         console.log('🌐 [AuthContext] NETWORK ERROR DETECTED');
         console.log('💡 Tip: Ensure your phone/emulator is on the same Wi-Fi as your PC.');
         console.log(`💡 Tip: Check if backend is running at ${API_URL}`);
      }

      const errorMessage = error?.error || error?.message || (typeof error === 'string' ? error : 'Registration failed');
      console.log('❌ [AuthContext] Extracted error message:', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  // Logout
  const logout = async () => {
    try {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      // Also reset onboarding so user goes back to onboarding screen
      await AsyncStorage.removeItem('hasSeenOnboarding');
      setHasSeenOnboarding(false);
      
      disconnectSocket();
      setUser(null);
    } catch (error) {
      console.log('Logout error:', error);
    }
  };

  // Resend verification email
  const resendVerificationEmail = async (email) => {
    try {
      const response = await authAPI.resendVerification(email);
      return { success: true, message: response.message || response.data?.message };
    } catch (error) {
      console.log('Resend verification error:', error);
      const errorMessage = error?.error || error?.message || (typeof error === 'string' ? error : 'Failed to resend email');
      return { success: false, error: errorMessage };
    }
  };

  // Forgot Password
  const forgotPassword = async (email) => {
    try {
      await authAPI.forgotPassword(email);
      return { success: true };
    } catch (error) {
      console.log('Forgot password error:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to send reset email',
      };
    }
  };

  const updateProfile = async (formData) => {
    try {
      const response = await userAPI.updateProfile(formData);
      
      // Handle both v1 and standard response formats
      const updatedUser = response?.user || response?.data || extractUserPayload(response);

      if (response?.success && updatedUser) {
        const hydratedUser = await hydrateUserFromProfile(updatedUser);
        await AsyncStorage.setItem('user', JSON.stringify(hydratedUser));
        setUser(hydratedUser);
        return { success: true, user: hydratedUser };
      }
      return { success: false, error: response?.error || 'Update failed' };
    } catch (error) {
      console.log('Update profile error:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || error.message || 'Failed to update profile' 
      };
    }
  };

  const changePassword = async ({ currentPassword, newPassword, confirmPassword }) => {
    try {
      const response = await authAPI.changePassword({ currentPassword, newPassword, confirmPassword });
      return {
        success: true,
        message: response?.message || 'Password updated successfully',
      };
    } catch (error) {
      const errorMessage = error?.error || error?.message || 'Failed to update password';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const deactivateAccount = async ({ password }) => {
    try {
      const response = await authAPI.deactivateAccount({ password });
      await logout();
      return {
        success: true,
        message: response?.message || 'Account deactivated successfully',
      };
    } catch (error) {
      const errorMessage = error?.error || error?.message || 'Failed to deactivate account';
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    resendVerificationEmail,
    isAuthenticated: !!user,
    refreshUser,
    updateProfile,
    updateFollowingOptimistic,
    hasSeenOnboarding,
    completeOnboarding,
    resetOnboarding,
    forgotPassword,
    changePassword,
    deactivateAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
