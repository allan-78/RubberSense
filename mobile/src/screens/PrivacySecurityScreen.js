import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#64748B',
  primary: '#556B2F',
  border: '#E2E8F0',
  error: '#DC2626',
};

const PrivacySecurityScreen = ({ navigation }) => {
  const { changePassword, deactivateAccount } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing Fields', 'Please complete all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Weak Password', 'New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirm password do not match.');
      return;
    }

    try {
      setChangingPassword(true);
      const result = await changePassword({ currentPassword, newPassword, confirmPassword });
      if (!result?.success) {
        Alert.alert('Update Failed', result?.error || 'Could not change password.');
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', result?.message || 'Password updated successfully.');
    } catch (error) {
      console.log('Change password error:', error);
      Alert.alert('Error', 'Failed to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeactivate = () => {
    if (!deactivatePassword) {
      Alert.alert('Password Required', 'Enter your password to deactivate your account.');
      return;
    }

    Alert.alert(
      'Deactivate Account',
      'This will deactivate your account and log you out. This action cannot be undone automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeactivating(true);
              const result = await deactivateAccount({ password: deactivatePassword });
              if (!result?.success) {
                Alert.alert('Deactivate Failed', result?.error || 'Could not deactivate account.');
                return;
              }
              Alert.alert('Account Deactivated', result?.message || 'Your account has been deactivated.');
            } catch (error) {
              console.log('Deactivate account error:', error);
              Alert.alert('Error', 'Failed to deactivate account.');
            } finally {
              setDeactivating(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Current password"
            placeholderTextColor={COLORS.textSecondary}
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={COLORS.textSecondary}
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor={COLORS.textSecondary}
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <TouchableOpacity
            style={[styles.primaryButton, changingPassword && styles.disabledButton]}
            onPress={handleChangePassword}
            disabled={changingPassword}
          >
            {changingPassword ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Update Password</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, styles.dangerCard]}>
          <Text style={styles.cardTitle}>Deactivate Account</Text>
          <Text style={styles.helperText}>
            Enter your password to deactivate account access.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.textSecondary}
            secureTextEntry
            value={deactivatePassword}
            onChangeText={setDeactivatePassword}
          />

          <TouchableOpacity
            style={[styles.dangerButton, deactivating && styles.disabledButton]}
            onPress={handleDeactivate}
            disabled={deactivating}
          >
            {deactivating ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.dangerButtonText}>Deactivate Account</Text>
            )}
          </TouchableOpacity>
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
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dangerCard: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  helperText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 10,
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  dangerButton: {
    marginTop: 4,
    backgroundColor: COLORS.error,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default PrivacySecurityScreen;
