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
  SafeAreaView,
  Linking,
  Alert,
  ScrollView
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../context/AuthContext';
import { messageAPI } from '../services/api';
import theme from '../styles/theme';

const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'piss', 'cunt', 
  'fucker', 'motherfucker', 'slut', 'whore'
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = [
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
  'text/plain', 
  'application/zip',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm'
];

const hashBadWords = (text = '') => {
  let result = text;
  BAD_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, '#'.repeat(word.length));
  });
  return result;
};

const ChatScreen = ({ route, navigation }) => {
  const { user } = useAuth();
  const { otherUser } = route.params || {}; 
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
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
      if (loading) setLoading(false);
    } catch (error) {
      console.log('Error fetching messages:', error);
      setLoading(false);
    }
  };

  const normalizeUri = (uri) => {
    if (!uri) return uri;
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(uri);
    if (Platform.OS === 'android' && !hasScheme) {
      return `file://${uri}`;
    }
    return uri;
  };

  const buildFormData = (fields, attachments) => {
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });
    (attachments || []).forEach((file, index) => {
      if (!file?.uri) return;
      formData.append('files', {
        uri: normalizeUri(file.uri),
        type: file.type || 'application/octet-stream',
        name: file.name || `attachment-${index}`,
      });
    });
    return formData;
  };

  const getAttachmentKey = (file) => {
    if (!file) return '';
    if (typeof file === 'string') return file;
    return file.url || file.uri || file.publicId || file.name || '';
  };

  const mergeUniqueAttachments = (prev, next) => {
    const existing = new Set((prev || []).map(getAttachmentKey));
    const filtered = (next || []).filter(file => {
      const key = getAttachmentKey(file);
      return key && !existing.has(key);
    });
    return [...prev, ...filtered];
  };

  const addMediaAttachment = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow gallery access to upload photos or videos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (result.canceled) return;
      
      const assets = result.assets || [];
      const skipped = [];
      const files = assets.reduce((acc, asset) => {
        const size = asset.fileSize || asset.size || 0;
        const name = asset.fileName || asset.uri?.split('/').pop() || `media-${Date.now()}`;
        const type = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        const isImage = type.startsWith('image/');
        const isVideo = type.startsWith('video/');

        if (size && size > MAX_FILE_SIZE) {
          skipped.push(`${name} exceeds 50MB`);
          return acc;
        }
        
        if (!isImage && !isVideo) {
          skipped.push(`${name} is not a supported media type`);
          return acc;
        }

        acc.push({
          uri: asset.uri,
          name,
          type,
          kind: asset.type || (isVideo ? 'video' : 'image'),
        });
        return acc;
      }, []);

      if (skipped.length > 0) {
        Alert.alert('Some files were skipped', skipped.join('\n'));
      }
      setAttachments(prev => mergeUniqueAttachments(prev, files));
    } catch (error) {
      console.log('Media picker error:', error);
      Alert.alert('Error', 'Failed to open image picker');
    }
  };

  const addFileAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const skipped = [];
      const files = (result.assets || []).reduce((acc, asset) => {
        const size = asset.size || asset.fileSize || 0;
        const name = asset.name;
        const type = asset.mimeType || 'application/octet-stream';
        
        if (size && size > MAX_FILE_SIZE) {
          skipped.push(`${name} exceeds 50MB`);
          return acc;
        }
        
        const isAllowed = ALLOWED_FILE_TYPES.some(allowed => 
          type.includes(allowed) || 
          allowed.includes(type) || 
          type.startsWith(allowed.replace('/*', ''))
        ) || type.startsWith('image/') || type.startsWith('video/');

        if (!isAllowed) {
          const ext = name.split('.').pop().toLowerCase();
          const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'mp4', 'mov', 'avi', 'webm'];
          if (!allowedExts.includes(ext)) {
            skipped.push(`${name} has unsupported file type`);
            return acc;
          }
        }

        acc.push({
          uri: asset.uri,
          name,
          type,
          kind: 'file',
        });
        return acc;
      }, []);

      if (skipped.length > 0) {
        Alert.alert('Some files were skipped', skipped.join('\n'));
      }
      setAttachments(prev => mergeUniqueAttachments(prev, files));
    } catch (error) {
      console.log('File picker error:', error);
      Alert.alert('Error', 'Failed to open file picker');
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleDownload = (uri) => {
    if (!uri) return;
    Linking.openURL(uri).catch(err => {
      Alert.alert('Error', 'Could not open file link');
    });
  };

  const handleSend = async () => {
    const hasText = inputText.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    
    if ((!hasText && !hasAttachments) || !user) return;

    setSending(true);

    try {
      const text = hasText ? hashBadWords(inputText.trim()) : '';
      
      // Optimistic update
      const tempMessage = {
        _id: Date.now().toString(),
        text,
        sender: { _id: user._id },
        createdAt: new Date().toISOString(),
        pending: true,
        attachments: attachments.map(a => ({
          url: a.uri,
          name: a.name,
          type: a.type
        }))
      };
      
      setMessages(prev => [...(prev || []), tempMessage]);
      setInputText('');
      setAttachments([]);

      if (hasAttachments) {
        const formData = buildFormData({ receiverId: otherUser._id, text }, attachments);
        await messageAPI.sendMessageWithMedia(formData);
      } else {
        await messageAPI.sendMessage(otherUser._id, text);
      }
      
      fetchMessages(); // Refresh to get real message from server
    } catch (error) {
      console.log('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const renderAttachmentsList = (files) => {
    if (!files || files.length === 0) return null;
    return (
      <View style={styles.messageAttachments}>
        {files.map((file, index) => {
          const uri = file.url || file.uri;
          const isImage = (file.type && file.type.startsWith('image/')) || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '');
          
          if (isImage) {
            return (
              <TouchableOpacity key={index} onPress={() => handleDownload(uri)} style={styles.imageAttachment}>
                 <Image source={{ uri }} style={styles.messageImage} resizeMode="cover" />
              </TouchableOpacity>
            );
          }
          
          return (
            <View key={index} style={styles.fileAttachment}>
              <Ionicons name="document-text" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.fileName} numberOfLines={1}>{file.name || 'Attachment'}</Text>
              <TouchableOpacity onPress={() => handleDownload(uri)} style={styles.downloadButton}>
                <Ionicons name="cloud-download-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  const renderMessage = ({ item }) => {
    const sender = item.sender;
    const senderId = sender?._id || sender?.id || (typeof sender !== 'object' ? sender : null);
    const myId = user?._id || user?.id;
    const isMe = senderId && myId && String(senderId) === String(myId);
    const isRead = item.read || false;

    return (
      <View style={[
        styles.messageBubble, 
        isMe ? styles.myMessage : styles.theirMessage
      ]}>
        {item.text ? (
          <Text style={[
            styles.messageText,
            isMe ? styles.myMessageText : styles.theirMessageText
          ]}>
            {hashBadWords(item.text)}
          </Text>
        ) : null}
        
        {renderAttachmentsList(item.attachments)}

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
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
          <View>
            <Text style={styles.headerTitle}>{otherUser.name}</Text>
            <Text style={styles.headerStatus}>Online</Text>
          </View>
        </View>
      </View>

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
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={styles.inputContainer}>
          {attachments.length > 0 && (
            <ScrollView horizontal style={styles.draftAttachments} showsHorizontalScrollIndicator={false}>
              {attachments.map((file, index) => (
                <View key={index} style={styles.draftItem}>
                  <Text style={styles.draftName} numberOfLines={1}>{file.name}</Text>
                  <TouchableOpacity onPress={() => removeAttachment(index)}>
                    <Ionicons name="close-circle" size={20} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          
          <View style={styles.inputRow}>
            <TouchableOpacity onPress={addMediaAttachment} style={styles.attachButton}>
              <Ionicons name="image-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={addFileAttachment} style={styles.attachButton}>
              <Ionicons name="attach-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={inputText}
              onChangeText={setInputText}
              multiline
              placeholderTextColor={theme.colors.textLight}
            />
            
            <TouchableOpacity 
              style={[
                styles.sendButton, 
                ((!inputText.trim() && attachments.length === 0) || sending) && styles.sendButtonDisabled
              ]}
              onPress={handleSend}
              disabled={(!inputText.trim() && attachments.length === 0) || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="send" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Lighter background for modern feel
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...theme.shadows.sm,
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerStatus: {
    fontSize: 12,
    color: theme.colors.success,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 32,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 20,
    marginBottom: 12,
    ...theme.shadows.sm,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  myMessageText: {
    color: '#FFF',
  },
  theirMessageText: {
    color: theme.colors.text,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  messageTime: {
    fontSize: 10,
  },
  myMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  theirMessageTime: {
    color: theme.colors.textLight,
  },
  statusIcon: {
    marginLeft: 2,
  },
  inputContainer: {
    padding: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
    color: theme.colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.7,
  },
  attachButton: {
    padding: 8,
  },
  draftAttachments: {
    marginBottom: 12,
    maxHeight: 50,
  },
  draftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  draftName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    maxWidth: 150,
    marginRight: 6,
  },
  messageAttachments: {
    marginTop: 4,
    gap: 4,
  },
  imageAttachment: {
    marginBottom: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    borderRadius: 8,
    gap: 8,
  },
  fileName: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.text,
  },
  downloadButton: {
    padding: 4,
  },
});

export default ChatScreen;
