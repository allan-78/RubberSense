// ============================================
// 🔑 Enhanced Login Screen
// ============================================

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import theme from '../styles/theme';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';

const LoginScreen = () => {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.success) {
      Alert.alert('Login Failed', result.error);
    }
  };

  const handleRegister = async () => {
    // Validation
    if (!name || !email || !password || !phoneNumber) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    const result = await register(name, email, password, phoneNumber);
    setLoading(false);

    if (result.success) {
      Alert.alert(
        'Registration Successful! 🎉',
        'Account created successfully. You are now logged in.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Registration Failed', result.error);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPhoneNumber('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      
      {/* Background Gradient */}
      <LinearGradient
        colors={theme.gradients.primary}
        style={styles.background}
      />

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>🌳</Text>
          </View>
          <Text style={styles.title}>RubberSense</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Welcome back, farmer!' : 'Join the community'}
          </Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {isLogin ? 'Login to your account' : 'Create an account'}
            </Text>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <CustomInput
                label="Full Name"
                placeholder="John Doe"
                value={name}
                onChangeText={setName}
                icon="person-outline"
                editable={!loading}
                autoCapitalize="words"
              />
            )}

            <CustomInput
              label="Email Address"
              placeholder="your@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              icon="mail-outline"
              editable={!loading}
              autoCapitalize="none"
            />

            {!isLogin && (
              <CustomInput
                label="Phone Number"
                placeholder="+63 912 345 6789"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                icon="call-outline"
                editable={!loading}
              />
            )}

            <CustomInput
              label="Password"
              placeholder="Enter password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon="lock-closed-outline"
              editable={!loading}
            />

            {!isLogin && (
              <CustomInput
                label="Confirm Password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                icon="lock-closed-outline"
                editable={!loading}
              />
            )}

            <CustomButton
              title={isLogin ? 'Login' : 'Create Account'}
              onPress={isLogin ? handleLogin : handleRegister}
              loading={loading}
              style={styles.submitButton}
            />

            {isLogin && (
              <CustomButton
                title="Forgot Password?"
                variant="outline"
                onPress={() => {}}
                style={styles.forgotButton}
                size="sm"
              />
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
          </Text>
          <CustomButton
            title={isLogin ? 'Sign Up' : 'Login'}
            variant="outline"
            onPress={toggleMode}
            size="sm"
            style={styles.switchButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '45%',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logoContainer: {
    width: 100,
    height: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  logo: {
    fontSize: 50,
  },
  title: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: '#FFFFFF',
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.lg,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    ...theme.shadows.lg,
    marginBottom: theme.spacing.lg,
  },
  formHeader: {
    marginBottom: theme.spacing.lg,
  },
  formTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  form: {
    gap: theme.spacing.sm,
  },
  submitButton: {
    marginTop: theme.spacing.md,
  },
  forgotButton: {
    marginTop: theme.spacing.sm,
    borderWidth: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  switchButton: {
    borderWidth: 0,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 0,
    minHeight: 0,
  }
});

export default LoginScreen;
