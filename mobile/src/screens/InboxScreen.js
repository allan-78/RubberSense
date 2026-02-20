import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAppRefresh } from '../context/AppRefreshContext';
import { messageAPI } from '../services/api';
import { connectSocket } from '../services/socket';
import theme from '../styles/theme';

const BAD_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'piss',
  'cunt',
  'fucker',
  'motherfucker',
  'slut',
  'whore',
];

const hashBadWords = (text = '') => {
  let result = text;
  BAD_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, '#'.repeat(word.length));
  });
  return result;
};

const extractList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
};

const InboxScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { refreshTick } = useAppRefresh();
  const [conversations, setConversations] = useState([]);
  const [messageRequests, setMessageRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const [conversationsResponse, requestsResponse] = await Promise.all([
        messageAPI.getConversations(),
        messageAPI.getRequests().catch(() => ({ data: [] }))
      ]);
      setConversations(extractList(conversationsResponse));
      setMessageRequests(extractList(requestsResponse));
    } catch (error) {
      console.log('Error fetching conversations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  useEffect(() => {
    if (refreshTick === 0) return;
    fetchConversations();
  }, [refreshTick]);

  useEffect(() => {
    const myUserId = user?._id || user?.id;
    if (!myUserId) return;

    let cleanup = () => {};
    let isMounted = true;

    const attachSocketListeners = async () => {
      const socket = await connectSocket(myUserId);
      if (!isMounted || !socket) return;

      const refreshInbox = () => {
        fetchConversations();
      };

      socket.on('message:new', refreshInbox);
      socket.on('message:request', refreshInbox);
      socket.on('message:request-updated', refreshInbox);
      socket.on('chat:block-updated', refreshInbox);

      cleanup = () => {
        socket.off('message:new', refreshInbox);
        socket.off('message:request', refreshInbox);
        socket.off('message:request-updated', refreshInbox);
        socket.off('chat:block-updated', refreshInbox);
      };
    };

    attachSocketListeners();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [user?._id, user?.id]);

  const handleRequestAction = async (senderId, action) => {
    try {
      await messageAPI.respondToRequest(senderId, action);
      if (action === 'accept') {
        const accepted = messageRequests.find(req => String(req?._id || req?.user?._id) === String(senderId));
        if (accepted?.user) {
          navigation.navigate('Chat', { otherUser: accepted.user });
        }
      }
      fetchConversations();
    } catch (error) {
      console.log('Error responding to request:', error);
      Alert.alert('Error', 'Failed to process message request');
    }
  };

  const renderItem = ({ item }) => {
    const otherUser = item.user;
    const lastMessage = item.lastMessage;
    // Robust check for isMe
    const sender = lastMessage?.sender;
    const senderId = sender?._id || sender?.id || (typeof sender !== 'object' ? sender : null);
    const myId = user?._id || user?.id;
    const isMe = senderId && myId && String(senderId) === String(myId);
    
    // Check if message is read (assuming read/seen property exists)
    const isRead = lastMessage?.read || false; 

    const getPreviewText = () => {
      if (lastMessage?.text) return hashBadWords(lastMessage.text);
      if (lastMessage?.attachments?.length > 0) {
        const count = lastMessage.attachments.length;
        const firstType = lastMessage.attachments[0].type || '';
        if (firstType.startsWith('image/')) return '📷 Sent an image';
        if (firstType.startsWith('video/')) return '🎥 Sent a video';
        return '📎 Sent an attachment';
      }
      return 'No content';
    };

    return (
      <TouchableOpacity 
        style={styles.conversationItem}
        onPress={() => navigation.navigate('Chat', { otherUser })}
      >
        <View style={styles.avatarContainer}>
          {otherUser.profileImage ? (
            <Image source={{ uri: otherUser.profileImage }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>
                {(otherUser.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.contentContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.name}>{otherUser.name}</Text>
            <Text style={styles.time}>
              {new Date(lastMessage.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
          </View>
          <View style={styles.messageRow}>
             <Text style={[
               styles.messagePreview, 
               !isRead && !isMe ? styles.unreadMessage : null
             ]} numberOfLines={1}>
              {isMe ? 'You: ' : ''}{getPreviewText()}
            </Text>
            {/* Unread indicator for received messages */}
            {!isRead && !isMe && (
              <View style={styles.unreadBadge} />
            )}
            {/* Read status for sent messages */}
            {isMe && (
              <Ionicons 
                name={isRead ? "checkmark-done" : "checkmark"} 
                size={16} 
                color={isRead ? theme.colors.primary : theme.colors.textLight} 
                style={styles.readIcon}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRequestItem = ({ item }) => {
    const requestUser = item.user;
    const preview = item.lastMessage?.text || (item.lastMessage?.attachments?.length ? 'Sent an attachment' : 'Message request');
    return (
      <View style={[styles.conversationItem, styles.requestItem]}>
        <View style={styles.avatarContainer}>
          {requestUser?.profileImage ? (
            <Image source={{ uri: requestUser.profileImage }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>
                {(requestUser?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.contentContainer}>
          <Text style={styles.name}>{requestUser?.name || 'Unknown'}</Text>
          <Text style={styles.messagePreview} numberOfLines={1}>{hashBadWords(preview)}</Text>
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={[styles.requestButton, styles.acceptButton]}
              onPress={() => handleRequestAction(requestUser?._id || item?._id, 'accept')}
            >
              <Text style={styles.requestButtonText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.requestButton, styles.rejectButton]}
              onPress={() => handleRequestAction(requestUser?._id || item?._id, 'reject')}
            >
              <Text style={styles.requestButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.user._id}
          renderItem={renderItem}
          ListHeaderComponent={
            <View style={styles.requestsSection}>
              <View style={styles.requestsMeta}>
                <Text style={styles.requestsTitle}>Message Requests</Text>
                <View style={styles.requestsCountBadge}>
                  <Text style={styles.requestsCountText}>{messageRequests.length}</Text>
                </View>
              </View>
              {messageRequests.length > 0 ? (
                <FlatList
                  data={messageRequests}
                  keyExtractor={(item) => String(item?.user?._id || item?._id)}
                  renderItem={renderRequestItem}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={styles.requestsEmpty}>No pending message requests.</Text>
              )}
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={60} color={theme.colors.textLight} />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubText}>Start a conversation from the blog!</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  backButton: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  requestsSection: {
    marginBottom: 16,
  },
  requestsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  requestsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  requestsCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  requestsCountText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  requestsEmpty: {
    fontSize: 13,
    color: theme.colors.textLight,
    paddingVertical: 4,
  },
  conversationItem: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  requestItem: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  time: {
    fontSize: 12,
    color: theme.colors.textLight,
    fontWeight: '500',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  requestButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  acceptButton: {
    backgroundColor: theme.colors.success,
  },
  rejectButton: {
    backgroundColor: theme.colors.error,
  },
  requestButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  messagePreview: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  unreadMessage: {
    fontWeight: '700',
    color: theme.colors.text,
  },
  unreadBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  readIcon: {
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginTop: 8,
  },
});

export default InboxScreen;
