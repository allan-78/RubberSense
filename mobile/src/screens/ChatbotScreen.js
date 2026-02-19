import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../styles/theme';
import { chatAPI } from '../services/api';

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

const SUGGESTIONS = [
  "How to treat leaf blight?",
  "Current rubber market price",
  "Best time to tap rubber?",
  "Signs of root disease",
  "How to increase latex yield?",
  "Fertilizer recommendations"
];

const hashBadWords = (text = '') => {
  let result = text;
  BAD_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, '#'.repeat(word.length));
  });
  return result;
};

const ChatbotScreen = ({ navigation, route }) => {
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: 'Hello! I am your RubberSense Assistant. I can help you with rubber farming or we can just chat. How can I help you today?',
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef();

  const handleSend = async (textOverride = null) => {
    const textToSend = typeof textOverride === 'string' ? textOverride : inputText;
    
    if (textToSend.trim() === '') return;

    const sanitizedText = hashBadWords(textToSend);
    const userMessage = {
      id: Date.now().toString(),
      text: sanitizedText,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    try {
      // Call Backend API (which calls Wit.ai)
      const response = await chatAPI.sendMessage(userMessage.text);
      
      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: hashBadWords(response.response || "I'm having trouble connecting to my brain right now."),
        sender: 'bot',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: hashBadWords("Sorry, I'm having trouble connecting to the server. Please try again later."),
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  // Handle initial prompt from navigation (e.g., from ScanDetailScreen)
  useEffect(() => {
    if (route.params?.initialPrompt) {
      const { initialPrompt, autoSend } = route.params;
      
      if (autoSend) {
        handleSend(initialPrompt);
        // Clear params to prevent re-sending on re-renders
        navigation.setParams({ initialPrompt: null, autoSend: false });
      } else {
        setInputText(initialPrompt);
        // Clear params so it doesn't keep overwriting input
        navigation.setParams({ initialPrompt: null });
      }
    }
  }, [route.params]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages, isTyping]);

  const renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[
        styles.messageBubble, 
        isUser ? styles.userBubble : styles.botBubble
      ]}>
        {!isUser && (
          <View style={styles.botIconContainer}>
             <MaterialIcons name="smart-toy" size={16} color="#FFF" />
          </View>
        )}
        <View style={[
          styles.bubbleContent, 
          isUser ? styles.userBubbleContent : styles.botBubbleContent
        ]}>
          <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.botMessageText]}>
            {hashBadWords(item.text)}
          </Text>
          <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.botTimestamp]}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <LinearGradient
        colors={[theme.colors.surface, theme.colors.background]}
        style={styles.background}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
           <Text style={styles.headerTitle}>AI Assistant</Text>
           <View style={styles.onlineIndicator}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
           </View>
        </View>
        <TouchableOpacity style={styles.menuButton}>
           <MaterialIcons name="more-vert" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Chat Area */}
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.chatContainer}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isTyping ? (
            <View style={styles.typingContainer}>
               <View style={styles.botIconContainer}>
                  <MaterialIcons name="smart-toy" size={16} color="#FFF" />
               </View>
               <View style={styles.typingBubble}>
                 <ActivityIndicator size="small" color={theme.colors.primary} />
               </View>
            </View>
          ) : null
        }
      />

      {/* Input Area */}
      <View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.suggestionsContainer}
          keyboardShouldPersistTaps="always"
        >
          {SUGGESTIONS.map((suggestion, index) => (
            <TouchableOpacity 
              key={index} 
              style={styles.suggestionChip}
              onPress={() => {
                handleSend(suggestion); 
              }}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.attachButton}>
          <MaterialIcons name="add" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity 
          style={[styles.sendButton, { backgroundColor: inputText.trim() ? theme.colors.primary : '#E0E0E0' }]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
    marginRight: 4,
  },
  onlineText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  menuButton: {
    padding: 8,
  },
  chatContainer: {
    padding: 15,
    paddingBottom: 20,
  },
  messageBubble: {
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  userBubble: {
    justifyContent: 'flex-end',
  },
  botBubble: {
    justifyContent: 'flex-start',
  },
  botIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  bubbleContent: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
  },
  userBubbleContent: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  botBubbleContent: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  botMessageText: {
    color: theme.colors.text,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userTimestamp: {
    color: 'rgba(255,255,255,0.7)',
  },
  botTimestamp: {
    color: theme.colors.textSecondary,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 15,
  },
  typingBubble: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    elevation: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  attachButton: {
    padding: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    maxHeight: 100,
    marginHorizontal: 10,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsContainer: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  suggestionChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  suggestionText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});

export default ChatbotScreen;
