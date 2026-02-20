// ============================================
// 🧭 App Navigation
// ============================================

import React, { useRef, useCallback, useEffect } from 'react';
import { View, Platform, PanResponder, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
import HistoryScreen from '../screens/HistoryScreen';
import MarketScreen from '../screens/MarketScreen';
import BlogScreen from '../screens/BlogScreen';
import ChatbotScreen from '../screens/ChatbotScreen';
import ScanDetailScreen from '../screens/ScanDetailScreen';
import LatexDetailScreen from '../screens/LatexDetailScreen';
import AddTreeScreen from '../screens/AddTreeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import PrivacySecurityScreen from '../screens/PrivacySecurityScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import ChatScreen from '../screens/ChatScreen';
import InboxScreen from '../screens/InboxScreen';
import NotificationScreen from '../screens/NotificationScreen';
import CustomTabBar from './CustomTabBar';
import { theme } from '../styles/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => {
        const parentState = props.state;
        const parentRoute = parentState.routes[parentState.index];
        const routeOptions = props.descriptors[parentRoute.key].options;
        const tabBarStyle = routeOptions.tabBarStyle;

        return <CustomTabBar {...props} style={tabBarStyle} />;
      }}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen}
      />
      <Tab.Screen 
        name="Camera" 
        component={CameraScreen}
        options={{
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tab.Screen 
        name="Blog" 
        component={BlogScreen}
      />
      <Tab.Screen 
        name="Profile"  
        component={ProfileScreen}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  const { isAuthenticated, loading, hasSeenOnboarding, logout } = useAuth();

  // Auto Logout Logic
  const timerRef = useRef(null);
  const IDLE_LOGOUT_LIMIT = 15 * 60 * 1000; // 15 minutes

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    
    if (isAuthenticated) {
      timerRef.current = setTimeout(() => {
        console.log('User idle for too long, logging out...');
        logout();
      }, IDLE_LOGOUT_LIMIT);
    }
  }, [isAuthenticated, logout]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        resetTimer();
        return false;
      },
      onMoveShouldSetPanResponderCapture: () => {
        resetTimer();
        return false;
      },
    })
  ).current;

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, resetTimer]);

  if (loading) {
    return null; // Or loading screen
  }

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="Market" component={MarketScreen} />
              <Stack.Screen name="EditProfile" component={EditProfileScreen} />
              <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
              <Stack.Screen name="PrivacySecurity" component={PrivacySecurityScreen} />
              <Stack.Screen name="Chatbot" component={ChatbotScreen} />
              <Stack.Screen name="ScanDetail" component={ScanDetailScreen} />
              <Stack.Screen name="LatexDetail" component={LatexDetailScreen} />
              <Stack.Screen name="AddTree" component={AddTreeScreen} />
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="Inbox" component={InboxScreen} />
              <Stack.Screen name="Notifications" component={NotificationScreen} />
            </>
          ) : (
            <>
              {!hasSeenOnboarding && (
                <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              )}
              <Stack.Screen name="Login" component={LoginScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
};

export default AppNavigator;
