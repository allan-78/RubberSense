import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { marketAPI, postAPI } from '../services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState({
    marketAlerts: true,
    weatherAlerts: true,
    adminAnnouncements: true,
    blogMonitor: true, // New setting
  });

  // Load initial data
  useEffect(() => {
    loadNotifications();
    loadSettings();
    registerForPushNotificationsAsync();
  }, []);

  async function registerForPushNotificationsAsync() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
  }

  // Update unread count whenever notifications change
  useEffect(() => {
    const unread = notifications.filter(n => !n.read).length;
    setUnreadCount(unread);
  }, [notifications]);

  const loadNotifications = async () => {
    try {
      const stored = await AsyncStorage.getItem('notifications');
      if (stored) {
        setNotifications(JSON.parse(stored));
      }
    } catch (e) {
      console.log('Failed to load notifications', e);
    }
  };

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('notificationSettings');
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (e) {
      console.log('Failed to load settings', e);
    }
  };

  const saveNotifications = async (newNotifications) => {
    try {
      setNotifications(newNotifications);
      await AsyncStorage.setItem('notifications', JSON.stringify(newNotifications));
    } catch (e) {
      console.log('Failed to save notifications', e);
    }
  };

  const saveSettings = async (newSettings) => {
    try {
      setSettings(newSettings);
      await AsyncStorage.setItem('notificationSettings', JSON.stringify(newSettings));
    } catch (e) {
      console.log('Failed to save settings', e);
    }
  };

  const addNotification = useCallback(async (notification) => {
    const newNotif = {
      id: Date.now().toString(),
      time: new Date().toISOString(), // Store as ISO string for sorting
      read: false,
      ...notification,
    };
    
    setNotifications(prev => {
      const updated = [newNotif, ...prev];
      AsyncStorage.setItem('notifications', JSON.stringify(updated));
      return updated;
    });

    // Schedule local system notification
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.message,
          data: { data: 'goes here' },
        },
        trigger: null, // Send immediately
      });
    } catch (e) {
      console.log('Failed to schedule system notification', e);
    }
  }, []);

  const markAsRead = (id) => {
    const updated = notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    saveNotifications(updated);
  };

  const markAllAsRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    saveNotifications(updated);
  };

  const clearAll = () => {
    saveNotifications([]);
  };

  const toggleSetting = (key) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    saveSettings(newSettings);
    return newSettings[key]; // Return new state for UI feedback
  };

  // ============================================
  // 🤖 SIMULATION LOGIC (Real-time triggers)
  // ============================================

  // 1. Simulate Market Alerts (Random checks)
  useEffect(() => {
    if (!settings.marketAlerts) return;

    const checkMarket = async () => {
      // 10% chance to trigger a market alert every check
      if (Math.random() > 0.9) {
        try {
            const res = await marketAPI.getForecast();
            if (res.success && res.data) {
                const { trend, price, priceChange } = res.data;
                // Use price from API (it might be 'price' or 'currentPrice' depending on endpoint version, safely fallback)
                const currentPrice = price || res.data.currentPrice || 0;
                
                if (Math.abs(priceChange) > 1.0) { // Significant change
                    addNotification({
                        type: 'market',
                        title: `Market Alert: Rubber ${trend === 'RISE' ? 'Up' : 'Down'}`,
                        message: `RSS3 price has ${trend === 'RISE' ? 'risen' : 'dropped'} by ${Math.abs(priceChange)}% to ₱${currentPrice}.`,
                        icon: 'trending-up',
                        color: trend === 'RISE' ? '#10B981' : '#EF4444'
                    });
                }
            }
        } catch (e) {
            console.log('Market check failed', e);
        }
      }
    };

    const interval = setInterval(checkMarket, 45000); // Check every 45s
    return () => clearInterval(interval);
  }, [settings.marketAlerts, addNotification]);

  // 2. Simulate Admin/System Announcements
  useEffect(() => {
    if (!settings.adminAnnouncements) return;

    const checkAdmin = () => {
        // 5% chance every minute
        if (Math.random() > 0.95) {
            const announcements = [
                { title: 'System Maintenance', message: 'Scheduled maintenance tonight at 12:00 AM. Services may be interrupted.', icon: 'build', color: '#F59E0B' },
                { title: 'New Feature', message: 'Try out the new AI Scanning mode for better accuracy!', icon: 'new-releases', color: '#3B82F6' },
                { title: 'Community Update', message: 'Check out the new blog post from Prof. Madriaga.', icon: 'article', color: '#8B5CF6' }
            ];
            const randomMsg = announcements[Math.floor(Math.random() * announcements.length)];
            addNotification({
                type: 'system',
                ...randomMsg
            });
        }
    };

    const interval = setInterval(checkAdmin, 60000); // Check every 60s
    return () => clearInterval(interval);
  }, [settings.adminAnnouncements, addNotification]);

  // 3. Blog Community Monitoring (Every 30 mins)
  useEffect(() => {
    if (!settings.blogMonitor) return;

    const checkNewPosts = async () => {
      try {
        const lastSeen = await AsyncStorage.getItem('lastSeenPostId');
        const res = await postAPI.getAll();
        if (res.data && res.data.length > 0) {
            const latestPost = res.data[0]; // Assuming sorted by date desc
            
            // If new post found
            if (!lastSeen || latestPost._id !== lastSeen) {
                // Check if it's actually new (within last 30 mins) to avoid spamming on fresh install
                const postTime = new Date(latestPost.createdAt).getTime();
                const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
                
                if (postTime > thirtyMinsAgo) {
                    addNotification({
                        type: 'social',
                        title: 'New Community Post',
                        message: `"${latestPost.title}" by ${latestPost.user?.name || 'Unknown'}: ${latestPost.content.substring(0, 50)}...`,
                        icon: 'forum',
                        color: '#8B5CF6'
                    });
                }
                
                // Update last seen
                await AsyncStorage.setItem('lastSeenPostId', latestPost._id);
            }
        }
      } catch (e) {
        console.log('Blog monitor check failed', e);
      }
    };

    // Initial check
    checkNewPosts();
    
    const interval = setInterval(checkNewPosts, 30 * 60 * 1000); // 30 mins
    return () => clearInterval(interval);
  }, [settings.blogMonitor, addNotification]);


  // Weather Logic with Smart Persistence
  const checkWeatherAlert = async (weatherData) => {
    if (!settings.weatherAlerts) return;

    try {
        const stored = await AsyncStorage.getItem('lastNotifiedWeather');
        let lastState = stored ? JSON.parse(stored) : null;
        
        // Ensure weatherData fields are strings before calling replace
        const tempStr = String(weatherData.temperature || '');
        const windStr = String(weatherData.windSpeed || '');
        
        const currentTemp = parseFloat(tempStr.replace('°C', '')) || 0;
        const currentWind = parseFloat(windStr.replace(' km/h', '')) || 0;
        const currentCondition = weatherData.condition || 'Unknown';

        let shouldNotify = false;
        let notificationMsg = '';
        let notificationType = 'info';

        // Initial notification logic (if no history)
        if (!lastState) {
            shouldNotify = true; // First time always notify? Maybe just save state.
            // Actually, let's only notify if bad weather on first run, otherwise just save
            if (currentCondition.includes('Rain') || currentCondition.includes('Storm')) {
                 notificationMsg = `Rain detected (${currentCondition}). Tapping is not recommended.`;
                 notificationType = 'alert';
            } else {
                 shouldNotify = false; // Silent first save for good weather
            }
        } else {
            // Change Detection Algorithm
            const tempDiff = Math.abs(currentTemp - lastState.temp);
            const windDiff = Math.abs(currentWind - lastState.wind);
            const conditionChanged = currentCondition !== lastState.condition;

            if (tempDiff > 3) {
                shouldNotify = true;
                notificationMsg = `Significant temperature change detected (${lastState.temp}°C -> ${currentTemp}°C).`;
            }
            
            if (windDiff > 10) {
                shouldNotify = true;
                notificationMsg = `Wind speed changed significantly (${lastState.wind} -> ${currentWind} km/h).`;
            }

            if (conditionChanged) {
                shouldNotify = true;
                if (currentCondition.includes('Rain') || currentCondition.includes('Storm')) {
                    notificationMsg = `Weather Alert: Conditions changed to ${currentCondition}. Stop tapping immediately.`;
                    notificationType = 'alert';
                } else if ((lastState.condition.includes('Rain') || lastState.condition.includes('Storm')) && (currentCondition.includes('Clear') || currentCondition.includes('Sunny'))) {
                    notificationMsg = `Weather Update: Conditions cleared (${currentCondition}). Safe to resume field work.`;
                    notificationType = 'success';
                } else {
                    notificationMsg = `Weather changed to ${currentCondition}.`;
                }
            }
        }

        if (shouldNotify && notificationMsg) {
             addNotification({
                type: notificationType === 'alert' ? 'alert' : 'info',
                title: notificationType === 'alert' ? 'Weather Alert' : 'Weather Update',
                message: notificationMsg,
                icon: notificationType === 'alert' ? 'thunderstorm' : 'wb-sunny',
                color: notificationType === 'alert' ? '#EF4444' : '#F59E0B'
            });
        }

        // Update state
        if (shouldNotify || !lastState) {
            await AsyncStorage.setItem('lastNotifiedWeather', JSON.stringify({
                temp: currentTemp,
                wind: currentWind,
                condition: currentCondition,
                timestamp: Date.now()
            }));
        }

    } catch (e) {
        console.log('Weather smart alert failed', e);
    }
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      settings,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      toggleSetting,
      checkWeatherAlert
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
