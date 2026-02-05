import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  Image,
  ActivityIndicator,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { messageAPI } from '../services/api';
import theme from '../styles/theme';

const ChatScreen = ({ route, navigation }) => {
  const { user } = useAuth();
  const { otherUser } = route.params || {}; 
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    if (!otherUser?._id) {
        navigation.goBack();
        return;
    }
    fetchMessages();
    // In a real app, you'd use socket.io for real-time updates
    const interval = setInterval(fetchMessages, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [otherUser?._id]);

  if (!otherUser) return null;

  const fetchMessages = async () => {
    try {
      const response = await messageAPI.getMessages(otherUser._id);
      // Handle both { data: [] } and [] response formats
      const messagesData = response.data || response;
      setMessages(Array.isArray(messagesData) ? messagesData : []);
      setLoading(false);
    } catch (error) {
      console.log('Error fetching messages:', error);
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !user) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      // Optimistic update
      const tempMessage = {
        _id: Date.now().toString(),
        text,
        sender: { _id: user._id },
        createdAt: new Date().toISOString(),
        pending: true
      };
      setMessages(prev => [...(prev || []), tempMessage]);

      await messageAPI.sendMessage(otherUser._id, text);
      fetchMessages(); // Refresh to get real message from server
    } catch (error) {
      console.log('Error sending message:', error);
      // Revert or show error (simplified here)
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    // Robust check for isMe
    const sender = item.sender;
    // Handle: 1. sender is object with _id, 2. sender is object with id, 3. sender is string/number ID
    const senderId = sender?._id || sender?.id || (typeof sender !== 'object' ? sender : null);
    
    // Handle: 1. user has _id, 2. user has id
    const myId = user?._id || user?.id;
    
    const isMe = senderId && myId && String(senderId) === String(myId);
    
    // Read status (default to false if not present)
    const isRead = item.read || false;

    return (
      <View style={[
        styles.messageBubble, 
        isMe ? styles.myMessage : styles.theirMessage
      ]}>
        <Text style={[
          styles.messageText,
          isMe ? styles.myMessageText : styles.theirMessageText
        ]}>
          {item.text}
        </Text>
        <View style={styles.messageFooter}>
          <Text style={[
            styles.messageTime,
            isMe ? styles.myMessageTime : styles.theirMessageTime
          ]}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isMe && (
            <Ionicons 
              name={isRead ? "checkmark-done" : "checkmark"} 
              size={16} 
              color={isRead ? "#FFFFFF" : "rgba(255,255,255,0.6)"} 
              style={styles.statusIcon}
            />
          )}
        </View>
      </View>
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
        
        <View style={styles.headerContent}>
          {otherUser.profileImage ? (
            <Image source={{ uri: otherUser.profileImage }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>
                {(otherUser.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.headerTitle}>{otherUser.name}</Text>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item._id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendButton, !inputText.trim() && { opacity: 0.5 }]} 
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            {sending ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="send" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadows.md,
    zIndex: 10,
  },
  backButton: {
    marginRight: 15,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: 20,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 14,
    borderRadius: 20,
    marginBottom: 12,
    ...theme.shadows.sm,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
    marginLeft: 40,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    marginRight: 40,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  myMessageText: {
    color: '#FFFFFF',
  },
  theirMessageText: {
    color: theme.colors.text,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
  },
  myMessageTime: {
    color: 'rgba(255,255,255,0.8)',
  },
  theirMessageTime: {
    color: theme.colors.textLight,
  },
  statusIcon: {
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    marginRight: 10,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ChatScreen;
