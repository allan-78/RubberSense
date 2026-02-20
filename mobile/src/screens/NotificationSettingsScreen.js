import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotification } from '../context/NotificationContext';

const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#64748B',
  primary: '#556B2F',
  border: '#E2E8F0',
};

const NotificationSettingsScreen = ({ navigation }) => {
  const { settings, toggleSetting, setAllNotificationSettings } = useNotification();
  const current = settings || {};
  const isAllOn = Object.values(current).length > 0 && Object.values(current).every(Boolean);

  const Row = ({ icon, label, value, onValueChange }) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={COLORS.textSecondary} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={!!value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E2E8F0', true: COLORS.primary }}
        thumbColor="#FFF"
        ios_backgroundColor="#E2E8F0"
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Triggers</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Row
            icon="notifications"
            label="Overall Notifications"
            value={isAllOn}
            onValueChange={setAllNotificationSettings}
          />
          <View style={styles.divider} />
          <Row
            icon="trending-up"
            label="Market Alerts"
            value={current.marketAlerts}
            onValueChange={() => toggleSetting('marketAlerts')}
          />
          <View style={styles.divider} />
          <Row
            icon="partly-sunny"
            label="Weather Alerts"
            value={current.weatherAlerts}
            onValueChange={() => toggleSetting('weatherAlerts')}
          />
          <View style={styles.divider} />
          <Row
            icon="people"
            label="Community Updates"
            value={current.blogMonitor}
            onValueChange={() => toggleSetting('blogMonitor')}
          />
          <View style={styles.divider} />
          <Row
            icon="mail"
            label="Message Requests"
            value={current.messageRequests}
            onValueChange={() => toggleSetting('messageRequests')}
          />
          <View style={styles.divider} />
          <Row
            icon="megaphone"
            label="Admin Announcements"
            value={current.adminAnnouncements}
            onValueChange={() => toggleSetting('adminAnnouncements')}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 24) + 20,
    paddingBottom: 14,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 32,
  },
});

export default NotificationSettingsScreen;
