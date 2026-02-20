// ============================================
// 🔐 Auth Context (MongoDB + Email Verification)
// ============================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, userAPI, API_URL } from '../services/api';
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

  // Refresh user data from backend
  const refreshUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return null;

      const response = await authAPI.getMe();
      const userData = response?.data?.user;
      
      if (userData) {
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        return userData;
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
      let updatedFollowing;
      if (isNowFollowing) {
        const exists = existing.some(u => String((u && u._id) || u) === String(targetUser._id));
        if (!exists) {
          const minimal = { _id: targetUser._id, name: targetUser.name, profileImage: targetUser.profileImage };
          updatedFollowing = [...existing, minimal];
        } else {
          updatedFollowing = existing;
        }
      } else {
        updatedFollowing = existing.filter(u => String((u && u._id) || u) !== String(targetUser._id));
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
          const { token: newToken, user: refreshedUser } = res.data || res;
          if (newToken) {
            await AsyncStorage.setItem('token', newToken);
          }
          if (refreshedUser) {
            await AsyncStorage.setItem('user', JSON.stringify(refreshedUser));
            setUser(refreshedUser);
          } else if (userData) {
            setUser(JSON.parse(userData));
          }
        } catch (e) {
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('user');
          disconnectSocket();
          setUser(null);
        }
      } else if (userData) {
        setUser(JSON.parse(userData));
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
      
      // Fix: response is already response.data from interceptor
      const { user: userData, token } = response.data || response;
      
      if (token) {
        // Only save token for API calls in current session
        await AsyncStorage.setItem('token', token);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        return { success: true };
      } else {
         return { success: false, error: 'No token received' };
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

      // Fix: accessing response.data directly as response is already the response body (due to interceptor)
      const { user: userData, token } = response.data || response;
      
      // Auto-login after registration
      if (token && userData) {
        console.log('💾 [AuthContext] Auto-login: Saving user state temporarily');
        // Do NOT save to AsyncStorage for persistent login
        // await AsyncStorage.setItem('token', token);
        // await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        // We still need to save the token in memory/state for API calls to work in this session
        // But since we removed AsyncStorage, we need a way to pass the token to API service
        // For now, let's keep AsyncStorage for token (needed for API interceptor) but clear it on app close/start
        // OR better: Just don't restore it in checkAuth
        await AsyncStorage.setItem('token', token); 
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
      // API returns { success: true, data: user, message: '...' }
      // Our api interceptor returns response.data directly.
      // Wait, api interceptor returns response.data.
      // If backend sends res.json({ success: true, ... }), then response (which is response.data) is { success: true, ... }
      // So response.data is the user object.
      
      if (response.success && response.data) {
        const updatedUser = response.data;
        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        return { success: true, user: updatedUser };
      }
      return { success: false, error: response.error || 'Update failed' };
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
