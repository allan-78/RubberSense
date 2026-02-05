import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { messageAPI } from '../services/api';
import theme from '../styles/theme';

const InboxScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const response = await messageAPI.getConversations();
      // Handle both { data: [] } and [] response formats
      const conversationsData = response.data || response;
      setConversations(Array.isArray(conversationsData) ? conversationsData : []);
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
              {isMe ? 'You: ' : ''}{lastMessage.text}
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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={theme.gradients.primary}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.user._id}
          renderItem={renderItem}
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
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  backButton: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  conversationItem: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
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
