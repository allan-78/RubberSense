import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { contactAPI } from '../services/api';

const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#64748B',
  primary: '#556B2F',
  border: '#E2E8F0',
  danger: '#DC2626',
  success: '#047857',
};

const STATUS_META = {
  unread: { label: 'Unread', bg: '#FEF3C7', text: '#92400E' },
  read: { label: 'Read', bg: '#E0F2FE', text: '#075985' },
  replied: { label: 'Replied', bg: '#DCFCE7', text: '#166534' },
  archived: { label: 'Archived', bg: '#E5E7EB', text: '#374151' },
  conversation: { label: 'Conversation', bg: '#F3E8FF', text: '#6B21A8' },
};

const normalizeSingleLine = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const formatDateTime = (value) => {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const ContactCard = ({ item }) => {
  const statusKey = String(item?.status || '').toLowerCase();
  const statusMeta = STATUS_META[statusKey] || { label: statusKey || 'Open', bg: '#E5E7EB', text: '#374151' };
  const adminReply = String(item?.reply || '').trim();

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <Text style={styles.historySubject} numberOfLines={1}>
          {item?.subject || 'No subject'}
        </Text>
        <View style={[styles.statusChip, { backgroundColor: statusMeta.bg }]}>
          <Text style={[styles.statusChipText, { color: statusMeta.text }]}>{statusMeta.label}</Text>
        </View>
      </View>

      <Text style={styles.historyDate}>Submitted {formatDateTime(item?.createdAt)}</Text>
      <Text style={styles.historyMessage}>{item?.message || '-'}</Text>

      {adminReply ? (
        <View style={styles.replyBox}>
          <Text style={styles.replyLabel}>Admin Reply</Text>
          <Text style={styles.replyText}>{adminReply}</Text>
          <Text style={styles.replyDate}>{formatDateTime(item?.repliedAt)}</Text>
        </View>
      ) : null}
    </View>
  );
};

const ContactUsScreen = ({ navigation }) => {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [loadingHistory, setLoadingHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const nextName = normalizeSingleLine(user?.name || '');
    const nextEmail = normalizeEmail(user?.email || '');
    if (nextName) setName(nextName);
    if (nextEmail) setEmail(nextEmail);
  }, [user?.name, user?.email]);

  const fetchHistory = useCallback(async (options = {}) => {
    const silent = Boolean(options.silent);
    try {
      if (!silent) setLoadingHistory(true);
      const response = await contactAPI.getMy();
      const list = Array.isArray(response?.data) ? response.data : [];
      setHistory(list);
    } catch (error) {
      if (!silent) {
        const messageText = error?.error || error?.message || 'Failed to load contact history';
        Alert.alert('Contact Us', messageText);
      }
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory({ silent: true });
    }, [fetchHistory])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory({ silent: true });
  }, [fetchHistory]);

  const canSubmit = useMemo(() => {
    return normalizeSingleLine(name).length > 0
      && normalizeEmail(email).length > 0
      && normalizeSingleLine(subject).length > 0
      && String(message || '').trim().length > 0
      && !submitting;
  }, [email, message, name, subject, submitting]);

  const handleSubmit = useCallback(async () => {
    const payload = {
      name: normalizeSingleLine(name),
      email: normalizeEmail(email),
      subject: normalizeSingleLine(subject),
      message: String(message || '').trim(),
    };

    if (!payload.name) return Alert.alert('Validation', 'Please enter your name.');
    if (!payload.email) return Alert.alert('Validation', 'Please enter your email.');
    if (!payload.subject) return Alert.alert('Validation', 'Please enter a subject.');
    if (!payload.message) return Alert.alert('Validation', 'Please enter your message.');

    try {
      setSubmitting(true);
      const response = await contactAPI.create(payload);
      if (response?.success === false) {
        throw new Error(response?.error || response?.message || 'Failed to send message');
      }

      setSubject('');
      setMessage('');
      Alert.alert('Message Sent', 'Your message was sent successfully. We will get back to you soon.');
      fetchHistory({ silent: true });
    } catch (error) {
      const messageText = error?.error || error?.message || 'Failed to send message';
      Alert.alert('Contact Us', messageText);
    } finally {
      setSubmitting(false);
    }
  }, [email, fetchHistory, message, name, subject]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Us</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        >
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Send a Message</Text>
            <Text style={styles.sectionHint}>
              Need help with your account, scans, market data, or app issues? Send us the details below.
            </Text>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder="Your full name"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="words"
            />

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholder="you@email.com"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              style={styles.input}
              placeholder="What is this about?"
              placeholderTextColor={COLORS.textSecondary}
              maxLength={200}
            />

            <View style={styles.messageHeaderRow}>
              <Text style={styles.inputLabel}>Message</Text>
              <Text style={styles.counterText}>{String(message || '').length}/5000</Text>
            </View>
            <TextInput
              value={message}
              onChangeText={setMessage}
              style={[styles.input, styles.messageInput]}
              placeholder="Tell us the issue and what happened..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />

            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitText}>Send Message</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Recent Requests</Text>
            {loadingHistory ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading requests...</Text>
              </View>
            ) : history.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="mail-open-outline" size={24} color={COLORS.textSecondary} />
                <Text style={styles.emptyTitle}>No requests yet</Text>
                <Text style={styles.emptyText}>
                  Your previous Contact Us messages will appear here.
                </Text>
              </View>
            ) : (
              history.map((item, index) => (
                <ContactCard
                  key={String(item?._id || `${item?.createdAt || 'contact'}-${index}`)}
                  item={item}
                />
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
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
    paddingBottom: 36,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionHint: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  inputLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  messageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counterText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  messageInput: {
    minHeight: 130,
    maxHeight: 220,
  },
  submitButton: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  historySection: {
    marginTop: 20,
  },
  loadingWrap: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    marginTop: 8,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  emptyCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 4,
    fontSize: 13,
    textAlign: 'center',
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  historyCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historySubject: {
    flex: 1,
    marginRight: 10,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  historyDate: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  historyMessage: {
    marginTop: 10,
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
  },
  replyBox: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#ECFDF5',
    padding: 10,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.success,
  },
  replyText: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  replyDate: {
    marginTop: 8,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});

export default ContactUsScreen;
