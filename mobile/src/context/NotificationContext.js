import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { marketAPI, postAPI, messageAPI } from '../services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NotificationContext = createContext();

const DEFAULT_SETTINGS = {
  marketAlerts: true,
  weatherAlerts: true,
  adminAnnouncements: true,
  blogMonitor: true,
  messageRequests: true,
};

const DEFAULT_SYNC_STATE = {
  initialized: false,
  lastMarketPrice: null,
  lastMarketTimestamp: null,
  lastPostId: null,
  seenRequestKeys: [],
  lastSyncedAt: null,
};

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [syncState, setSyncState] = useState(DEFAULT_SYNC_STATE);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [ready, setReady] = useState(false);

  const notificationsRef = useRef([]);
  const syncStateRef = useRef(DEFAULT_SYNC_STATE);
  const settingsRef = useRef(DEFAULT_SETTINGS);

  useEffect(() => {
    notificationsRef.current = notifications;
    setUnreadCount(notifications.filter(n => !n.read).length);
  }, [notifications]);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const registerForPushNotificationsAsync = async () => {
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
      console.log('Failed to get push token for push notification');
    }
  };

  const commitNotifications = useCallback(async (list) => {
    const normalized = Array.isArray(list) ? list : [];
    const sorted = normalized
      .map(item => ({
        id: String(item.id || item.eventKey || Date.now()),
        eventKey: item.eventKey ? String(item.eventKey) : null,
        type: item.type || 'system',
        title: item.title || 'Notification',
        message: item.message || '',
        icon: item.icon || 'notifications',
        color: item.color || '#3B82F6',
        read: Boolean(item.read),
        time: item.time ? new Date(item.time).toISOString() : new Date().toISOString(),
      }))
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 300);

    notificationsRef.current = sorted;
    setNotifications(sorted);
    await AsyncStorage.setItem('notifications', JSON.stringify(sorted));
  }, []);

  const addNotification = useCallback(async (notification, options = {}) => {
    const schedule = options.schedule !== false;
    const eventKey = notification?.eventKey ? String(notification.eventKey) : null;
    const existing = notificationsRef.current.some(n =>
      (eventKey && n.eventKey === eventKey) || (notification?.id && String(n.id) === String(notification.id))
    );

    if (existing) return false;

    const created = {
      id: String(notification?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      eventKey,
      type: notification?.type || 'system',
      title: notification?.title || 'Notification',
      message: notification?.message || '',
      icon: notification?.icon || 'notifications',
      color: notification?.color || '#3B82F6',
      read: false,
      time: notification?.time ? new Date(notification.time).toISOString() : new Date().toISOString(),
    };

    const updated = [created, ...notificationsRef.current]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 300);

    await commitNotifications(updated);

    if (schedule) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: created.title,
            body: created.message,
            data: { eventKey: created.eventKey || created.id },
          },
          trigger: null,
        });
      } catch (e) {
        console.log('Failed to schedule local notification', e);
      }
    }

    return true;
  }, [commitNotifications]);

  const markAsRead = useCallback(async (id) => {
    const updated = notificationsRef.current.map(n =>
      String(n.id) === String(id) ? { ...n, read: true } : n
    );
    await commitNotifications(updated);
  }, [commitNotifications]);

  const markAllAsRead = useCallback(async () => {
    const updated = notificationsRef.current.map(n => ({ ...n, read: true }));
    await commitNotifications(updated);
  }, [commitNotifications]);

  const clearAll = useCallback(async () => {
    await commitNotifications([]);
  }, [commitNotifications]);

  const saveSettings = useCallback(async (newSettings) => {
    const merged = { ...DEFAULT_SETTINGS, ...newSettings };
    setSettings(merged);
    settingsRef.current = merged;
    await AsyncStorage.setItem('notificationSettings', JSON.stringify(merged));
    return merged;
  }, []);

  const toggleSetting = useCallback((key) => {
    const current = settingsRef.current || DEFAULT_SETTINGS;
    const next = { ...current, [key]: !current[key] };
    saveSettings(next);
    return next[key];
  }, [saveSettings]);

  const setAllNotificationSettings = useCallback((enabled) => {
    const next = Object.keys(DEFAULT_SETTINGS).reduce((acc, key) => {
      acc[key] = Boolean(enabled);
      return acc;
    }, {});
    saveSettings(next);
    return next;
  }, [saveSettings]);

  const saveSyncState = useCallback(async (state) => {
    const next = { ...DEFAULT_SYNC_STATE, ...(state || {}) };
    setSyncState(next);
    syncStateRef.current = next;
    setLastSyncedAt(next.lastSyncedAt || null);
    await AsyncStorage.setItem('notificationSyncState', JSON.stringify(next));
    return next;
  }, []);

  const bootstrapFromCurrentData = useCallback(async (data) => {
    const market = data.marketData || {};
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const requests = Array.isArray(data.requests) ? data.requests : [];

    const seenRequestKeys = requests.map(req => {
      const senderId = req?.user?._id || req?._id;
      const lastMessageId = req?.lastMessage?._id || req?.lastMessage?.id || 'latest';
      return `msgreq-${senderId}-${lastMessageId}`;
    });

    return saveSyncState({
      initialized: true,
      lastMarketPrice: Number.isFinite(Number(market?.price)) ? Number(market.price) : null,
      lastMarketTimestamp: market?.timestamp || null,
      lastPostId: posts[0]?._id || null,
      seenRequestKeys: seenRequestKeys.slice(-400),
      lastSyncedAt: new Date().toISOString(),
    });
  }, [saveSyncState]);

  const refreshNotifications = useCallback(async (options = {}) => {
    const silent = options?.silent !== false;
    const currentSettings = settingsRef.current || DEFAULT_SETTINGS;
    const currentSync = syncStateRef.current || DEFAULT_SYNC_STATE;

    try {
      const [marketRes, postsRes, requestsRes, userRaw] = await Promise.all([
        currentSettings.marketAlerts ? marketAPI.getForecast().catch(() => null) : Promise.resolve(null),
        currentSettings.blogMonitor ? postAPI.getAll().catch(() => null) : Promise.resolve(null),
        messageAPI.getRequests().catch(() => null),
        AsyncStorage.getItem('user'),
      ]);

      const marketData = marketRes?.data || marketRes || {};
      const postsDataRaw = postsRes?.data || postsRes || [];
      const posts = Array.isArray(postsDataRaw) ? postsDataRaw : [];
      const requestsDataRaw = requestsRes?.data || requestsRes || [];
      const requests = Array.isArray(requestsDataRaw) ? requestsDataRaw : [];
      const me = userRaw ? JSON.parse(userRaw) : null;
      const myUserId = String(me?._id || me?.id || '');

      if (!currentSync.initialized) {
        await bootstrapFromCurrentData({ marketData, posts, requests });
        return { success: true, added: 0, initialized: true };
      }

      const generated = [];
      const nextSync = { ...currentSync };

      if (currentSettings.marketAlerts && Number.isFinite(Number(marketData?.price))) {
        const currentPrice = Number(marketData.price);
        const previousPrice = Number(nextSync.lastMarketPrice);
        const hasPrevious = Number.isFinite(previousPrice) && previousPrice > 0;
        const fallbackChange = hasPrevious ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;
        const changePct = Number.isFinite(Number(marketData?.priceChange))
          ? Number(marketData.priceChange)
          : fallbackChange;
        const isSignificant = Math.abs(changePct) >= 1;

        if (hasPrevious && isSignificant) {
          const trend = String(marketData?.trend || (changePct >= 0 ? 'RISE' : 'FALL')).toUpperCase();
          const direction = changePct >= 0 ? 'increased' : 'dropped';
          const eventKey = `market-${marketData?.timestamp || `${currentPrice}-${changePct.toFixed(2)}`}`;
          generated.push({
            eventKey,
            type: 'market',
            title: `Market ${trend === 'RISE' ? 'Uptrend' : trend === 'FALL' ? 'Downtrend' : 'Update'}`,
            message: `RSS3 price ${direction} by ${Math.abs(changePct).toFixed(2)}% to PHP ${currentPrice.toFixed(2)}.`,
            icon: trend === 'RISE' ? 'trending-up' : trend === 'FALL' ? 'trending-down' : 'activity',
            color: trend === 'RISE' ? '#10B981' : trend === 'FALL' ? '#EF4444' : '#3B82F6',
          });
        }

        if (marketData?.stale) {
          const dayKey = new Date().toISOString().slice(0, 10);
          generated.push({
            eventKey: `market-stale-${dayKey}`,
            type: 'system',
            title: 'Market Data Delay',
            message: 'Using latest stored market data while live feed is unavailable.',
            icon: 'alert-circle',
            color: '#F59E0B',
          });
        }

        nextSync.lastMarketPrice = currentPrice;
        nextSync.lastMarketTimestamp = marketData?.timestamp || nextSync.lastMarketTimestamp;
      }

      if (currentSettings.blogMonitor && posts.length > 0) {
        const latestPost = posts[0];
        const latestPostId = latestPost?._id;
        const authorId = String(latestPost?.user?._id || latestPost?.user || '');
        if (latestPostId && latestPostId !== nextSync.lastPostId && authorId !== myUserId) {
          const authorName = latestPost?.user?.name || 'Community member';
          generated.push({
            eventKey: `post-${latestPostId}`,
            type: 'system',
            title: 'New Community Post',
            message: `${authorName} posted: ${(latestPost?.title || 'Untitled').slice(0, 80)}`,
            icon: 'article',
            color: '#8B5CF6',
          });
        }
        nextSync.lastPostId = latestPostId || nextSync.lastPostId;
      }

      if (currentSettings.messageRequests && Array.isArray(requests) && requests.length > 0) {
        const seen = new Set(Array.isArray(nextSync.seenRequestKeys) ? nextSync.seenRequestKeys : []);
        requests.forEach((requestItem) => {
          const senderId = requestItem?.user?._id || requestItem?._id;
          const senderName = requestItem?.user?.name || 'Someone';
          const lastMessageId = requestItem?.lastMessage?._id || requestItem?.lastMessage?.id || 'latest';
          const eventKey = `msgreq-${senderId}-${lastMessageId}`;

          if (!seen.has(eventKey)) {
            generated.push({
              eventKey,
              type: 'system',
              title: 'New Message Request',
              message: `${senderName} sent you a message request.`,
              icon: 'mail',
              color: '#6366F1',
            });
            seen.add(eventKey);
          }
        });
        nextSync.seenRequestKeys = [...seen].slice(-400);
      }

      for (const item of generated) {
        // Silent refresh should still sync notification center without system pop-up.
        await addNotification(item, { schedule: !silent });
      }

      nextSync.lastSyncedAt = new Date().toISOString();
      await saveSyncState(nextSync);

      return { success: true, added: generated.length };
    } catch (error) {
      console.log('Notification refresh failed', error);
      return { success: false, added: 0 };
    }
  }, [addNotification, bootstrapFromCurrentData, saveSyncState]);

  const checkWeatherAlert = useCallback(async (weatherData) => {
    if (!(settingsRef.current?.weatherAlerts)) return;

    try {
      const stored = await AsyncStorage.getItem('lastNotifiedWeather');
      const lastState = stored ? JSON.parse(stored) : null;

      const tempRaw = weatherData?.temperature ?? weatherData?.temp ?? weatherData?.tempC ?? '';
      const windRaw = weatherData?.windSpeed ?? weatherData?.wind ?? '';
      const conditionRaw = String(weatherData?.condition || 'Unknown');
      const currentTemp = Number.parseFloat(String(tempRaw).replace(/[^0-9.\-]/g, '')) || 0;
      const currentWind = Number.parseFloat(String(windRaw).replace(/[^0-9.\-]/g, '')) || 0;
      const currentCondition = conditionRaw;

      let shouldNotify = false;
      let notificationMsg = '';
      let notificationType = 'info';

      if (!lastState) {
        if (currentCondition.toLowerCase().includes('rain') || currentCondition.toLowerCase().includes('storm')) {
          shouldNotify = true;
          notificationMsg = `Rain detected (${currentCondition}). Tapping is not recommended.`;
          notificationType = 'alert';
        }
      } else {
        const tempDiff = Math.abs(currentTemp - Number(lastState.temp || 0));
        const windDiff = Math.abs(currentWind - Number(lastState.wind || 0));
        const conditionChanged = currentCondition !== lastState.condition;

        if (tempDiff > 3) {
          shouldNotify = true;
          notificationMsg = `Significant temperature change detected (${lastState.temp}C to ${currentTemp}C).`;
        }

        if (windDiff > 10) {
          shouldNotify = true;
          notificationMsg = `Wind speed changed significantly (${lastState.wind} to ${currentWind} km/h).`;
        }

        if (conditionChanged) {
          shouldNotify = true;
          if (currentCondition.toLowerCase().includes('rain') || currentCondition.toLowerCase().includes('storm')) {
            notificationMsg = `Weather alert: conditions changed to ${currentCondition}. Stop tapping immediately.`;
            notificationType = 'alert';
          } else if (
            (String(lastState.condition || '').toLowerCase().includes('rain') || String(lastState.condition || '').toLowerCase().includes('storm'))
            && (currentCondition.toLowerCase().includes('clear') || currentCondition.toLowerCase().includes('sunny'))
          ) {
            notificationMsg = `Weather cleared (${currentCondition}). Safe to resume field work.`;
            notificationType = 'success';
          } else {
            notificationMsg = `Weather changed to ${currentCondition}.`;
          }
        }
      }

      if (shouldNotify && notificationMsg) {
        const eventKey = `weather-${currentCondition}-${Math.round(currentTemp)}-${Math.round(currentWind)}`;
        await addNotification({
          eventKey,
          type: notificationType === 'alert' ? 'alert' : 'info',
          title: notificationType === 'alert' ? 'Weather Alert' : 'Weather Update',
          message: notificationMsg,
          icon: notificationType === 'alert' ? 'warning' : 'sunny',
          color: notificationType === 'alert' ? '#EF4444' : '#F59E0B',
        });
      }

      await AsyncStorage.setItem('lastNotifiedWeather', JSON.stringify({
        temp: currentTemp,
        wind: currentWind,
        condition: currentCondition,
        timestamp: Date.now(),
      }));
    } catch (e) {
      console.log('Weather alert processing failed', e);
    }
  }, [addNotification]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const [storedNotifications, storedSettings, storedSync] = await Promise.all([
          AsyncStorage.getItem('notifications'),
          AsyncStorage.getItem('notificationSettings'),
          AsyncStorage.getItem('notificationSyncState'),
        ]);

        if (storedNotifications) {
          const parsed = JSON.parse(storedNotifications);
          if (Array.isArray(parsed)) {
            notificationsRef.current = parsed;
            setNotifications(parsed);
          }
        }

        if (storedSettings) {
          const parsedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) };
          settingsRef.current = parsedSettings;
          setSettings(parsedSettings);
        }

        if (storedSync) {
          const parsedSync = { ...DEFAULT_SYNC_STATE, ...JSON.parse(storedSync) };
          syncStateRef.current = parsedSync;
          setSyncState(parsedSync);
          setLastSyncedAt(parsedSync.lastSyncedAt || null);
        }

        await registerForPushNotificationsAsync();
      } catch (error) {
        console.log('Failed to initialize notifications context', error);
      } finally {
        setReady(true);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    if (!ready) return;
    refreshNotifications({ silent: true });

    const interval = setInterval(() => {
      refreshNotifications({ silent: true });
    }, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [ready, refreshNotifications]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      settings,
      lastSyncedAt,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      toggleSetting,
      setAllNotificationSettings,
      refreshNotifications,
      checkWeatherAlert,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
