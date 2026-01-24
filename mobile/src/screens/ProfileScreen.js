import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import theme from '../styles/theme';

const ProfileScreen = () => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', onPress: logout, style: 'destructive' },
    ]);
  };

  const profileInfo = [
    { label: 'Email', value: user?.email, icon: '📧' },
    { label: 'Role', value: user?.role || 'User', icon: '👥' },
    { label: 'Phone', value: user?.phoneNumber || 'Not provided', icon: '📱' },
    { label: 'Location', value: user?.location || 'Not provided', icon: '📍' },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <MaterialIcons name="person" size={44} color={theme.colors.primary} />
          </View>
          <Text style={styles.profileName}>{user?.name}</Text>
          <View style={styles.verificationBadge}>
            <MaterialIcons 
              name={user?.isVerified ? 'verified' : 'schedule'} 
              size={16} 
              color={user?.isVerified ? theme.colors.success : theme.colors.warning}
            />
            <Text style={[styles.verificationText, {
              color: user?.isVerified ? theme.colors.success : theme.colors.warning
            }]}>
              {user?.isVerified ? 'Verified' : 'Verification Pending'}
            </Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.quickStat}>
            <MaterialIcons name="star" size={20} color={theme.colors.primary} />
            <Text style={styles.quickStatValue}>4.8</Text>
            <Text style={styles.quickStatLabel}>Rating</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.quickStat}>
            <MaterialIcons name="grade" size={20} color={theme.colors.primary} />
            <Text style={styles.quickStatValue}>50</Text>
            <Text style={styles.quickStatLabel}>Points</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.quickStat}>
            <MaterialIcons name="camera-alt" size={20} color={theme.colors.primary} />
            <Text style={styles.quickStatValue}>12</Text>
            <Text style={styles.quickStatLabel}>Scans</Text>
          </View>
        </View>
      </View>

      {/* Account Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Info</Text>
        {profileInfo.map((info, index) => (
          <View key={index} style={styles.infoCard}>
            <View style={styles.infoIconWrapper}>
              {info.icon === '📧' && <MaterialIcons name="email" size={24} color={theme.colors.primary} />}
              {info.icon === '👥' && <MaterialIcons name="group" size={24} color={theme.colors.primary} />}
              {info.icon === '📱' && <MaterialIcons name="phone" size={24} color={theme.colors.primary} />}
              {info.icon === '📍' && <MaterialIcons name="location-on" size={24} color={theme.colors.primary} />}
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{info.label}</Text>
              <Text style={styles.infoValue}>{info.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="notifications-active" size={24} color={theme.colors.primary} />
            <View>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Text style={styles.settingDesc}>Enabled</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={theme.colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="dark-mode" size={24} color={theme.colors.primary} />
            <View>
              <Text style={styles.settingLabel}>Dark Mode</Text>
              <Text style={styles.settingDesc}>Off</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={theme.colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="lock" size={24} color={theme.colors.primary} />
            <View>
              <Text style={styles.settingLabel}>Change Password</Text>
              <Text style={styles.settingDesc}>Security</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color={theme.colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>RubberSense v1.0</Text>
        <Text style={styles.footerSubtext}>Tree monitoring made easy</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  
  // Header
  header: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.surface,
  },
  
  // Profile Card
  profileCard: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingVertical: theme.spacing.xl,
    ...theme.shadows.md,
  },
  avatarSection: {
    alignItems: 'center',
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginHorizontal: theme.spacing.lg,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  profileName: {
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing.sm,
  },
  verificationText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  
  // Quick Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    justifyContent: 'space-around',
  },
  quickStat: {
    alignItems: 'center',
    flex: 1,
  },
  quickStatValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  quickStatLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.md,
  },
  
  // Section
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.surface,
    marginBottom: theme.spacing.md,
  },
  
  // Info Cards
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
    gap: theme.spacing.md,
  },
  infoIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  infoValue: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  
  // Settings Items
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.md,
  },
  settingLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  settingDesc: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  
  // Logout Button
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
    ...theme.shadows.md,
  },
  logoutIcon: {
    fontSize: 24,
  },
  logoutText: {
    fontSize: theme.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.error,
  },
  
  // Footer
  footer: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: theme.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.surface,
    marginBottom: theme.spacing.xs,
  },
  footerSubtext: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.7)',
  },
});

export default ProfileScreen;
