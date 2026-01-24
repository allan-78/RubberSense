// ============================================
// 🔐 Auth Context (MongoDB + Email Verification)
// ============================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, API_URL } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  // Refresh user data from backend
  const refreshUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await authAPI.getMe();
      const userData = response.data || response;
      
      if (userData) {
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      }
    } catch (error) {
      console.log('Refresh user error:', error);
    }
  };

  // Check if user is logged in
  const checkAuth = async () => {
    try {
      // Clear any existing session on app start to force login
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      setUser(null);
      
      // const token = await AsyncStorage.getItem('token');
      // const userData = await AsyncStorage.getItem('user');
      
      // if (token && userData) {
      //   setUser(JSON.parse(userData));
      //   // Verify token validity and get fresh user data
      //   refreshUser();
      // }
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
        // Do NOT save user data persistently to ensure fresh login on restart
        // await AsyncStorage.setItem('user', JSON.stringify(userData));
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

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    resendVerificationEmail,
    isAuthenticated: !!user,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
