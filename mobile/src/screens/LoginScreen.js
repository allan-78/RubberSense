// ============================================
// 🔑 Enhanced Login Screen
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
  LayoutAnimation,
  UIManager,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';

// Enable LayoutAnimation for Android
// if (Platform.OS === 'android') {
//   if (UIManager.setLayoutAnimationEnabledExperimental) {
//     UIManager.setLayoutAnimationEnabledExperimental(true);
//   }
// }

const { width, height } = Dimensions.get('window');

const LoginScreen = ({ route }) => {
  const { login, register, resetOnboarding, forgotPassword } = useAuth();
  // Default to login unless isRegister param is true
  const initialMode = route?.params?.isRegister ? false : true;
  const [isLogin, setIsLogin] = useState(initialMode);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  // const scrollY = useRef(new Animated.Value(0)).current; // Removed scroll-driven animation

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 10,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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
        'Registration Successful',
        'Account created successfully. You are now logged in.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Registration Failed', result.error);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    const result = await forgotPassword(email);
    setLoading(false);

    if (result.success) {
      Alert.alert(
        'Email Sent',
        'Please check your email for the password reset link.',
        [{ text: 'OK', onPress: () => toggleForgotPassword() }]
      );
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const toggleForgotPassword = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsForgotPassword(!isForgotPassword);
  };

  const toggleMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsLogin(!isLogin);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPhoneNumber('');
  };

  // Scroll Animations (Removed for stability)
  // const headerOpacity = scrollY.interpolate({ ... });
  // const headerTranslateY = scrollY.interpolate({ ... });
  // const logoTranslateY = scrollY.interpolate({ ... });
  // const sheetTranslateY = scrollY.interpolate({ ... });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Background Gradient & Header */}
      <LinearGradient
        colors={theme.gradients.primary}
        style={styles.headerContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View 
          style={[
            styles.logoContainer,
            { 
              transform: [
                { scale: logoScale },
                // { translateY: logoTranslateY }
              ] 
            }
          ]}
        >
          <Ionicons name="leaf" size={48} color="#FFF" />
        </Animated.View>
        
        <Animated.View 
          style={{ 
            opacity: fadeAnim, // Removed headerOpacity
            alignItems: 'center',
            // transform: [{ translateY: headerTranslateY }]
          }}
        >
          <Text style={styles.title}>RubberSense</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Welcome back, farmer!' : 'Join our community'}
          </Text>
        </Animated.View>
        
        {/* Abstract shapes in background */}
        <View style={styles.bgCircle1} />
        <View style={styles.bgCircle2} />
      </LinearGradient>

      {/* Bottom Form Sheet */}
      <Animated.View 
        style={[
          styles.formSheetWrapper,
          { 
            opacity: fadeAnim,
            transform: [
              { translateY: slideAnim } // Removed sheetTranslateY
            ]
          }
        ]}
      >
        <KeyboardAvoidingView
          style={styles.formSheet}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.sheetContent}>
            <ScrollView 
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              // Removed onScroll event
            >
              <Text style={styles.formTitle}>
                {isForgotPassword ? 'Reset Password' : (isLogin ? 'Login' : 'Sign Up')}
              </Text>
            
            <View style={styles.form}>
              {isForgotPassword ? (
                <>
                  <Text style={{marginBottom: 20, color: theme.colors.textSecondary, fontSize: 16}}>
                    Enter your email address and we'll send you a link to reset your password.
                  </Text>
                  
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

                  <CustomButton
                    title="Send Reset Link"
                    onPress={handleForgotPassword}
                    loading={loading}
                    style={styles.submitButton}
                    borderRadius={16}
                  />

                  <CustomButton
                    title="Back to Login"
                    variant="outline"
                    onPress={toggleForgotPassword}
                    style={{marginTop: 10, borderWidth: 0}}
                    textStyle={{color: theme.colors.textSecondary}}
                  />
                </>
              ) : (
                <>
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

                  {isLogin && (
                    <View style={styles.forgotContainer}>
                      <CustomButton
                        title="Forgot Password?"
                        variant="outline"
                        onPress={toggleForgotPassword}
                        style={styles.forgotButton}
                        textStyle={styles.forgotText}
                        size="sm"
                      />
                    </View>
                  )}

                  <CustomButton
                    title={isLogin ? 'Login' : 'Create Account'}
                    onPress={isLogin ? handleLogin : handleRegister}
                    loading={loading}
                    style={styles.submitButton}
                    borderRadius={16}
                  />
                </>
              )}
            </View>

            {/* Footer */}
            {!isForgotPassword && (
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
                  textStyle={styles.switchText}
                />
              </View>
            )}

            {/* Dev Helper: Reset Onboarding */}
            <TouchableOpacity 
              onPress={() => {
                resetOnboarding();
                // Optional: Alert to confirm
                // Alert.alert("Reset", "Onboarding reset. Restart app to see it.");
              }}
              style={{ alignItems: 'center', marginTop: 10, opacity: 0.5 }}
            >
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                Tap here to see Onboarding again
              </Text>
            </TouchableOpacity>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary, // Fallback
  },
  headerContainer: {
    height: height * 0.4, // Fixed height instead of flex
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
    position: 'relative',
    overflow: 'hidden',
  },
  bgCircle1: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bgCircle2: {
    position: 'absolute',
    bottom: 50,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  logoContainer: {
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...theme.shadows.md,
    backdropFilter: 'blur(10px)', // Works on web, ignored on native but good for intent
  },
  logo: {
    // Removed
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: theme.spacing.xs,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  
  // Form Sheet
  formSheetWrapper: {
    flex: 1, // Changed from fixed height to flex
    marginTop: -30,
    zIndex: 10,
    width: '100%', // Ensure full width
  },
  formSheet: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    ...theme.shadows.lg,
    elevation: 10, // Stronger shadow for Android
  },
  sheetContent: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: 150, // Increased to ensure scrollability for header animation
  },
  formTitle: {
    fontSize: 28, // Larger title
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    letterSpacing: -0.5,
  },
  form: {
    gap: theme.spacing.sm,
  },
  
  // Buttons & Inputs
  forgotContainer: {
    alignItems: 'flex-end',
    marginBottom: theme.spacing.sm,
  },
  forgotButton: {
    borderWidth: 0,
    paddingHorizontal: 0,
    minHeight: 0,
    paddingVertical: 4,
  },
  forgotText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: theme.spacing.sm,
    borderRadius: 16,
    height: 56,
  },
  
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  switchButton: {
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 0,
    minHeight: 0,
  },
  switchText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: theme.fontSize.md,
  }
});

export default LoginScreen;
