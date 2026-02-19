import React, { useState, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  TextInput, 
  Modal, 
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Linking
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../context/AuthContext';
import { postAPI, userAPI } from '../services/api';
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

const MAX_FILE_SIZE = 50 * 1024 * 1024; // Increased to 50MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
// Expanded to match backend support + common types
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
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const hashBadWords = (text = '') => {
  let result = text;
  BAD_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, '#'.repeat(word.length));
  });
  return result;
};

const BlogScreen = ({ navigation, route }) => {
  const { user, refreshUser, updateFollowingOptimistic } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Polling for real-time updates
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const pollInterval = setInterval(() => {
        if (isActive && !refreshing) {
          // Silent refresh
          postAPI.getAll().then(response => {
            if (isActive && response.data) {
              setPosts(prevPosts => {
                // Only update if data changed to avoid re-renders
                if (JSON.stringify(prevPosts) !== JSON.stringify(response.data)) {
                  return response.data;
                }
                return prevPosts;
              });
            }
          }).catch(err => console.log('Polling error:', err));
        }
      }, 5000); // Poll every 5 seconds

      return () => {
        isActive = false;
        clearInterval(pollInterval);
      };
    }, [refreshing])
  );

  // Comment State
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // { id: commentId, name: userName }
  const [commentAttachments, setCommentAttachments] = useState([]);

  // Profile Modal State
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  // New Post State
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newPostAttachments, setNewPostAttachments] = useState([]);

  // Like Modal State
  const [likesModalVisible, setLikesModalVisible] = useState(false);
  const [viewingLikesPostId, setViewingLikesPostId] = useState(null);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editAttachments, setEditAttachments] = useState([]);
  const [editExistingAttachments, setEditExistingAttachments] = useState([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxAttachments, setLightboxAttachments] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [failedImages, setFailedImages] = useState({});

  const commentInputRef = useRef(null);
  const lightboxListRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const targetUserId = route?.params?.openProfileUserId;
      if (targetUserId) {
        handleViewProfile(targetUserId);
        navigation.setParams({ openProfileUserId: undefined });
      }
    }, [route?.params?.openProfileUserId])
  );

  const fetchPosts = async () => {
    try {
      const response = await postAPI.getAll();
      setPosts(response.data || []);
    } catch (error) {
      console.log('Error fetching posts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPosts();
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

  const handleImageError = (uri) => {
    if (!uri) return;
    setFailedImages(prev => ({ ...prev, [uri]: true }));
  };

  const openLightbox = (attachments, index) => {
    const items = (attachments || [])
      .filter(file => {
        const uri = typeof file === 'string' ? file : (file.url || file.uri);
        const name = typeof file === 'string' ? (file.split('/').pop() || '') : (file.name || file.originalName || '');
        const type = typeof file === 'string' ? '' : (file.type || file.mimeType || '');
        return uri && (type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name));
      });
    if (items.length === 0) return;
    const mappedIndex = Math.min(Math.max(index, 0), items.length - 1);
    setLightboxAttachments(items);
    setLightboxIndex(mappedIndex);
    setLightboxVisible(true);
    setTimeout(() => {
      lightboxListRef.current?.scrollToIndex({ index: mappedIndex, animated: false });
    }, 0);
  };

  const goToLightboxIndex = (index) => {
    const nextIndex = Math.min(Math.max(index, 0), lightboxAttachments.length - 1);
    setLightboxIndex(nextIndex);
    lightboxListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  };

  const removeExistingAttachment = (index) => {
    setEditExistingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const mergeUniqueAttachments = (prev, next) => {
    const existing = new Set((prev || []).map(getAttachmentKey));
    const filtered = (next || []).filter(file => {
      const key = getAttachmentKey(file);
      return key && !existing.has(key);
    });
    return [...prev, ...filtered];
  };

  const addMediaAttachment = async (setter, allowVideo = true) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow gallery access to upload photos or videos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: allowVideo ? ImagePicker.MediaTypeOptions.All : ImagePicker.MediaTypeOptions.Images,
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
        // Relaxed type checking
        const type = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        const isImage = type.startsWith('image/');
        const isVideo = type.startsWith('video/');

        if (size && size > MAX_FILE_SIZE) {
          skipped.push(`${name} exceeds 50MB`);
          return acc;
        }
        
        // More permissive type check
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
      setter(prev => mergeUniqueAttachments(prev, files));
    } catch (error) {
      console.log('Media picker error:', error);
      Alert.alert('Error', 'Failed to open image picker');
    }
  };

  const addFileAttachment = async (setter) => {
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
        
        // Check if type is roughly allowed (flexible check)
        const isAllowed = ALLOWED_FILE_TYPES.some(allowed => 
          type.includes(allowed) || 
          allowed.includes(type) || 
          type.startsWith(allowed.replace('/*', ''))
        ) || type.startsWith('image/') || type.startsWith('video/');

        if (!isAllowed) {
          // Fallback: check extension
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
      setter(prev => mergeUniqueAttachments(prev, files));
    } catch (error) {
      console.log('File picker error:', error);
      Alert.alert('Error', 'Failed to open file picker');
    }
  };

  const removeAttachment = (setter, index) => {
    setter(prev => prev.filter((_, i) => i !== index));
  };

  const refreshPostsAndSelection = async (postId) => {
    try {
      const response = await postAPI.getAll();
      const newPosts = response.data || [];
      setPosts(newPosts);
      if (postId) {
        const updated = newPosts.find(post => String(post._id) === String(postId));
        if (updated) setSelectedPost(updated);
      }
    } catch (error) {
      console.log('Refresh posts error:', error);
    }
  };

  const handleCreatePost = async () => {
    const hasTitle = newTitle.trim().length > 0;
    const hasContent = newContent.trim().length > 0;
    const hasAttachments = newPostAttachments.length > 0;
    if ((!hasTitle || !hasContent) && !hasAttachments) {
      Alert.alert('Error', 'Title and content are required');
      return;
    }

    setSubmitting(true);
    try {
      const title = hashBadWords(hasTitle ? newTitle.trim() : 'Media Post');
      const content = hashBadWords(hasContent ? newContent.trim() : 'Media post');
      if (hasAttachments) {
        const formData = buildFormData({ title, content }, newPostAttachments);
        await postAPI.createWithMedia(formData);
      } else {
        await postAPI.create({ title, content });
      }
      
      setModalVisible(false);
      setNewTitle('');
      setNewContent('');
      setNewPostAttachments([]);
      fetchPosts(); // Refresh list
      Alert.alert('Success', 'Post created successfully!');
    } catch (error) {
      console.log('Create post error:', error);
      const msg = typeof error === 'string' 
        ? error 
        : error?.error || error?.message || error?.response?.data?.error || 'Failed to create post';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (postId) => {
    try {
      // Optimistic update
      const currentUserId = user?._id || user?.id;
      setPosts(currentPosts => 
        currentPosts.map(post => {
          if (post._id === postId) {
            // Robust check for existing like (handles both ID strings and populated objects)
            const isLiked = post.likes && post.likes.some(like => {
              const likeId = typeof like === 'string' ? like : (like._id || like.id);
              return String(likeId) === String(currentUserId);
            });
            
            let newLikes = [...(post.likes || [])];
            if (isLiked) {
              newLikes = newLikes.filter(like => {
                const likeId = typeof like === 'string' ? like : (like._id || like.id);
                return String(likeId) !== String(currentUserId);
              });
            } else {
              // Push full user object for optimistic update so Modal works immediately
              newLikes.push({
                _id: currentUserId,
                name: user.name,
                profileImage: user.profileImage
              });
            }

            return {
              ...post,
              likes: newLikes
            };
          }
          return post;
        })
      );
      
      const response = await postAPI.toggleLike(postId);
      // Update with actual server response (which should be populated)
      if (response && response.data) {
         setPosts(currentPosts => 
          currentPosts.map(post => {
            if (post._id === postId) {
              return { ...post, likes: response.data };
            }
            return post;
          })
        );
      }
    } catch (error) {
      console.log('Error liking post:', error);
      fetchPosts(); // Revert on error
    }
  };

  const handleViewLikes = (post) => {
    setViewingLikesPostId(post._id);
    setLikesModalVisible(true);
  };

  const handleCommentPress = (post) => {
    setSelectedPost(post);
    setCommentModalVisible(true);
    setReplyingTo(null);
  };

  const closeCommentModal = () => {
    setCommentModalVisible(false);
    setReplyingTo(null);
    setCommentText('');
    setCommentAttachments([]);
  };

  const closePostModal = () => {
    setModalVisible(false);
    setNewTitle('');
    setNewContent('');
    setNewPostAttachments([]);
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setEditTarget(null);
    setEditTitle('');
    setEditContent('');
    setEditAttachments([]);
    setEditExistingAttachments([]);
  };

  const handleReply = (comment) => {
    setReplyingTo({ id: comment._id, name: comment.user?.name || comment.name });
    // Focus the input to bring up keyboard
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 100);
  };

  const handleViewProfile = async (userId) => {
    if (!userId) return;
    setLoadingProfile(true);
    setProfileModalVisible(true);
    try {
      const response = await userAPI.getProfile(userId);
      const profileData = response.data;
      
      // Use isFollowing status from backend
      setViewingUser(profileData);
    } catch (error) {
      console.log('Error fetching profile:', error);
      Alert.alert('Error', 'Failed to load user profile');
      setProfileModalVisible(false);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!viewingUser) return;
    
    try {
      // 1. Optimistic Update
      const isNowFollowing = !viewingUser.isFollowing;
      
      setViewingUser(prev => {
        let updatedFollowers = [...(prev.followers || [])];
        if (isNowFollowing) {
          if (!updatedFollowers.some(f => String(f._id || f) === String(user._id))) {
            updatedFollowers.push(user);
          }
        } else {
          updatedFollowers = updatedFollowers.filter(f => String(f._id || f) !== String(user._id));
        }
        return { ...prev, isFollowing: isNowFollowing, followers: updatedFollowers };
      });

      // 2. API Call
      const response = await userAPI.toggleFollow(viewingUser._id);
      
      updateFollowingOptimistic(viewingUser, isNowFollowing);
      
      // 3. Sync Global State
      await refreshUser();
      
      // 4. Update with actual server data if available
      if (response && response.followersCount !== undefined) {
         // Optionally we can re-fetch the full profile to be sure
         // const freshProfile = await userAPI.getProfile(viewingUser._id);
         // setViewingUser(freshProfile.data);
      }
    } catch (error) {
      console.log('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
      // Revert optimistic update
      const originalIsFollowing = !viewingUser.isFollowing; // Revert to what it was
       setViewingUser(prev => {
        let updatedFollowers = [...(prev.followers || [])];
        if (originalIsFollowing) {
           if (!updatedFollowers.some(f => String(f._id || f) === String(user._id))) {
            updatedFollowers.push(user);
          }
        } else {
           updatedFollowers = updatedFollowers.filter(f => String(f._id || f) !== String(user._id));
        }
        return { ...prev, isFollowing: originalIsFollowing, followers: updatedFollowers };
      });
    }
  };

  const handleSubmitComment = async () => {
    if (!selectedPost) return;
    const hasText = commentText.trim().length > 0;
    const hasAttachments = commentAttachments.length > 0;
    if (!hasText && !hasAttachments) return;

    setSubmittingComment(true);
    try {
      let response;
      const text = hasText ? hashBadWords(commentText.trim()) : '';
      if (replyingTo) {
        if (commentAttachments.length > 0) {
          const formData = buildFormData({ text }, commentAttachments);
          response = await postAPI.replyToCommentWithMedia(selectedPost._id, replyingTo.id, formData);
        } else {
          response = await postAPI.replyToComment(selectedPost._id, replyingTo.id, text);
        }
      } else {
        if (commentAttachments.length > 0) {
          const formData = buildFormData({ text }, commentAttachments);
          response = await postAPI.addCommentWithMedia(selectedPost._id, formData);
        } else {
          response = await postAPI.addComment(selectedPost._id, text);
        }
      }
      
      // Update local state
      const updatedComments = response.data;
      
      // Update posts list
      setPosts(currentPosts => 
        currentPosts.map(post => {
          if (post._id === selectedPost._id) {
            return { ...post, comments: updatedComments };
          }
          return post;
        })
      );

      // Update selected post
      setSelectedPost(prev => ({ ...prev, comments: updatedComments }));
      
      setCommentText('');
      setReplyingTo(null);
      setCommentAttachments([]);
    } catch (error) {
      console.log('Error commenting:', error);
      const msg = typeof error === 'string' 
        ? error 
        : error?.error || error?.message || error?.response?.data?.error || 'Failed to post comment';
      Alert.alert('Error', msg);
    } finally {
      setSubmittingComment(false);
    }
  };

  const isOwner = (resourceUser) => {
    const ownerId = resourceUser?._id || resourceUser?.id || resourceUser;
    const myId = user?._id || user?.id;
    return ownerId && myId && String(ownerId) === String(myId);
  };

  const openEditModal = (target) => {
    setEditTarget(target);
    setEditTitle(target.type === 'post' ? target.title || '' : '');
    setEditContent(target.text || target.content || '');
    setEditAttachments([]);
    setEditExistingAttachments(getAttachments(target) || []);
    setEditModalVisible(true);
  };

  const handleDeletePost = (post) => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await postAPI.deletePost(post._id);
          await refreshPostsAndSelection();
        } catch (error) {
          Alert.alert('Error', 'Failed to delete post');
        }
      }},
    ]);
  };

  const handleDeleteComment = (postId, commentId) => {
    Alert.alert('Delete Comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await postAPI.deleteComment(postId, commentId);
          await refreshPostsAndSelection(postId);
        } catch (error) {
          Alert.alert('Error', 'Failed to delete comment');
        }
      }},
    ]);
  };

  const handleDeleteReply = (postId, commentId, replyId) => {
    Alert.alert('Delete Reply', 'Are you sure you want to delete this reply?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await postAPI.deleteReply(postId, commentId, replyId);
          await refreshPostsAndSelection(postId);
        } catch (error) {
          Alert.alert('Error', 'Failed to delete reply');
        }
      }},
    ]);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const hasEditContent = editContent.trim().length > 0;
    const hasEditTitle = editTitle.trim().length > 0;
    const hasEditAttachments = editAttachments.length > 0;
    if (editTarget.type === 'post' && !hasEditTitle && !hasEditContent && !hasEditAttachments) return;
    if (editTarget.type !== 'post' && !hasEditContent && !hasEditAttachments) return;

    setSubmittingEdit(true);
    try {
      const payload = {
        title: editTarget.type === 'post' ? hashBadWords(hasEditTitle ? editTitle.trim() : 'Untitled') : undefined,
        content: editTarget.type === 'post' ? hashBadWords(editContent.trim()) : undefined,
        text: editTarget.type !== 'post' ? hashBadWords(editContent.trim()) : undefined,
      };
      const keepAttachments = editExistingAttachments
        .map(file => (typeof file === 'string' ? file : (file.url || file.uri || file.publicId || file.name)))
        .filter(Boolean);

      if (editTarget.type === 'post') {
        if (editAttachments.length > 0) {
          const formData = buildFormData({ title: payload.title, content: payload.content, keepAttachments: JSON.stringify(keepAttachments) }, editAttachments);
          await postAPI.updatePostWithMedia(editTarget.postId, formData);
        } else {
          await postAPI.updatePost(editTarget.postId, { title: payload.title, content: payload.content, keepAttachments });
        }
        await refreshPostsAndSelection(editTarget.postId);
      }

      if (editTarget.type === 'comment') {
        if (editAttachments.length > 0) {
          const formData = buildFormData({ text: payload.text, keepAttachments: JSON.stringify(keepAttachments) }, editAttachments);
          await postAPI.updateCommentWithMedia(editTarget.postId, editTarget.commentId, formData);
        } else {
          await postAPI.updateComment(editTarget.postId, editTarget.commentId, { text: payload.text, keepAttachments });
        }
        await refreshPostsAndSelection(editTarget.postId);
      }

      if (editTarget.type === 'reply') {
        if (editAttachments.length > 0) {
          const formData = buildFormData({ text: payload.text, keepAttachments: JSON.stringify(keepAttachments) }, editAttachments);
          await postAPI.updateReplyWithMedia(editTarget.postId, editTarget.commentId, editTarget.replyId, formData);
        } else {
          await postAPI.updateReply(editTarget.postId, editTarget.commentId, editTarget.replyId, { text: payload.text, keepAttachments });
        }
        await refreshPostsAndSelection(editTarget.postId);
      }

      setEditModalVisible(false);
      setEditTarget(null);
      setEditTitle('');
      setEditContent('');
      setEditAttachments([]);
    } catch (error) {
      Alert.alert('Error', 'Failed to update');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const openPostActions = (post) => {
    Alert.alert('Post Options', '', [
      { text: 'Edit', onPress: () => openEditModal({ type: 'post', postId: post._id, title: post.title, content: post.content, attachments: getAttachments(post) }) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDeletePost(post) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCommentActions = (postId, comment) => {
    Alert.alert('Comment Options', '', [
      { text: 'Edit', onPress: () => openEditModal({ type: 'comment', postId, commentId: comment._id, text: comment.text }) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteComment(postId, comment._id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openReplyActions = (postId, commentId, reply) => {
    Alert.alert('Reply Options', '', [
      { text: 'Edit', onPress: () => openEditModal({ type: 'reply', postId, commentId, replyId: reply._id, text: reply.text }) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteReply(postId, commentId, reply._id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const getAttachments = (resource) => {
    return resource?.attachments || resource?.media || resource?.files || [];
  };

  const handleDownload = (uri) => {
    if (!uri) return;
    Linking.openURL(uri).catch(err => {
      Alert.alert('Error', 'Could not open file link');
    });
  };

  const renderAttachments = (attachments) => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <View style={styles.attachmentsGrid}>
        {attachments.map((file, index) => {
          const isString = typeof file === 'string';
          const uri = isString ? file : (file.url || file.uri);
          const name = isString ? (file.split('/').pop() || 'Attachment') : (file.name || file.originalName || 'Attachment');
          const typeGuess = /\.(png|jpe?g|gif|webp)$/i.test(name) ? 'image/*' :
                            /\.(mp4|mov|webm)$/i.test(name) ? 'video/*' : '';
          const type = isString ? typeGuess : (file.type || file.mimeType || typeGuess);
          const isImage = type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name);
          const isVideo = type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(name);
          const isFailed = uri ? failedImages[uri] : false;
          return (
            <View key={`${name}-${index}`} style={styles.attachmentItem}>
              {isImage && uri ? (
                isFailed ? (
                  <View style={styles.attachmentFile}>
                    <Ionicons name="image" size={18} color={theme.colors.textSecondary} />
                    <Text style={styles.attachmentName} numberOfLines={1}>Image failed to load</Text>
                  </View>
                ) : (
                  <View style={styles.imageWrapper}>
                    <TouchableOpacity 
                      onPress={() => openLightbox(attachments, index)} 
                      accessibilityRole="button"
                      accessibilityLabel={`Open image ${name}`}
                      style={styles.imageButton}
                    >
                      <Image 
                        source={{ uri, cache: 'force-cache' }} 
                        style={styles.attachmentImage} 
                        onError={() => handleImageError(uri)}
                        resizeMode="cover"
                        accessibilityLabel={name}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.downloadOverlay}
                      onPress={() => handleDownload(uri)}
                      accessibilityLabel={`Download ${name}`}
                    >
                      <Ionicons name="download-outline" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                )
              ) : (
                <View style={styles.attachmentFileContainer}>
                  <TouchableOpacity 
                    style={styles.attachmentFile}
                    onPress={() => handleDownload(uri)}
                  >
                    <Ionicons name={isVideo ? 'videocam' : 'document'} size={18} color={theme.colors.textSecondary} />
                    <Text style={styles.attachmentName} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.downloadButton}
                    onPress={() => handleDownload(uri)}
                  >
                    <Ionicons name="download-outline" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderDraftAttachments = (attachments, setter) => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <View style={styles.draftAttachments}>
        {attachments.map((file, index) => (
          <View key={`${file.name || 'draft'}-${index}`} style={styles.draftItem}>
            <Text style={styles.draftName} numberOfLines={1}>{file.name || 'Attachment'}</Text>
            <TouchableOpacity onPress={() => removeAttachment(setter, index)}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  const renderExistingAttachments = (attachments) => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <View style={styles.draftAttachments}>
        <Text style={styles.draftHeader}>Existing Files</Text>
        {attachments.map((file, index) => {
          const name = typeof file === 'string' ? (file.split('/').pop() || 'Attachment') : (file.name || file.originalName || 'Attachment');
          return (
            <View key={`${name}-${index}`} style={styles.draftItem}>
              <Text style={styles.draftName} numberOfLines={1}>{name}</Text>
              <TouchableOpacity onPress={() => removeExistingAttachment(index)} accessibilityRole="button" accessibilityLabel={`Remove ${name}`}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const currentUserId = user?._id || user?.id;
    const isLiked = item.likes && item.likes.some(like => {
      const likeId = typeof like === 'string' ? like : (like._id || like.id);
      return String(likeId) === String(currentUserId);
    });
    const attachments = getAttachments(item);
    const owner = isOwner(item.user);
    
    return (
      <View style={styles.postCard}>
        {/* Header */}
        <View style={styles.postHeader}>
          <TouchableOpacity 
            style={styles.userInfo}
            onPress={() => handleViewProfile(item.user?._id)}
          >
            {item.user?.profileImage ? (
              <Image source={{ uri: item.user.profileImage }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>
                  {(item.user?.name || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View>
              <Text style={styles.userName}>{item.user?.name || 'Unknown User'}</Text>
              <Text style={styles.postDate}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </TouchableOpacity>
          {owner && (
            <TouchableOpacity style={styles.moreButton} onPress={() => openPostActions(item)}>
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        <Text style={styles.postTitle}>{hashBadWords(item.title)}</Text>
        <Text style={styles.postContent}>{hashBadWords(item.content)}</Text>
        {renderAttachments(attachments)}

        {/* Actions */}
        <View style={styles.postActions}>
          <View style={styles.actionButton}>
            <TouchableOpacity onPress={() => handleLike(item._id)}>
              <Ionicons 
                name={isLiked ? "heart" : "heart-outline"} 
                size={24} 
                color={isLiked ? theme.colors.error : theme.colors.textSecondary} 
              />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => handleViewLikes(item)} 
              style={{ marginLeft: 8, padding: 4 }} // Increased touch target
            >
              <Text style={[styles.actionText, isLiked && { color: theme.colors.error }, { marginLeft: 0 }]}>
                {item.likes.length} {item.likes.length === 1 ? 'Like' : 'Likes'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleCommentPress(item)}
          >
            <Ionicons name="chatbubble-outline" size={22} color={theme.colors.textSecondary} />
            <Text style={styles.actionText}>{item.comments?.length || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community Blog</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.iconButton}
            onPress={() => navigation.navigate('Inbox')}
          >
            <Ionicons name="chatbubbles-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={item => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="post-outline" size={60} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No posts yet. Be the first to share!</Text>
          </View>
        }
      />

      {/* Comments Modal */}
      <Modal
        visible={commentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeCommentModal}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.commentModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={closeCommentModal}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={selectedPost?.comments || []}
              keyExtractor={(item, index) => item._id || index.toString()}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <TouchableOpacity onPress={() => handleViewProfile(item.user?._id)}>
                    {item.user?.profileImage ? (
                      <Image source={{ uri: item.user.profileImage }} style={styles.commentAvatar} />
                    ) : (
                      <View style={[styles.commentAvatar, styles.avatarPlaceholder]}>
                        <Text style={styles.commentAvatarText}>
                          {(item.user?.name || item.name || 'U').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.commentContent}>
                    <Text style={styles.commentUser}>{item.user?.name || item.name || 'Unknown'}</Text>
                    <Text style={styles.commentText}>{hashBadWords(item.text)}</Text>
                    {renderAttachments(getAttachments(item))}
                    <View style={styles.commentActions}>
                      <Text style={styles.commentDate}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                      <View style={styles.commentActionButtons}>
                        <TouchableOpacity onPress={() => handleReply(item)}>
                          <Text style={styles.replyButtonText}>Reply</Text>
                        </TouchableOpacity>
                        {isOwner(item.user) && (
                          <TouchableOpacity onPress={() => openCommentActions(selectedPost?._id, item)}>
                            <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textSecondary} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Replies */}
                    {item.replies && item.replies.length > 0 && (
                      <View style={styles.repliesContainer}>
                        {item.replies.map((reply, rIndex) => (
                          <View key={rIndex} style={styles.replyItem}>
                            <TouchableOpacity onPress={() => handleViewProfile(reply.user?._id)}>
                              {reply.user?.profileImage ? (
                                <Image source={{ uri: reply.user.profileImage }} style={styles.replyAvatar} />
                              ) : (
                                <View style={[styles.replyAvatar, styles.avatarPlaceholder]}>
                                  <Text style={styles.replyAvatarText}>
                                    {(reply.user?.name || reply.name || 'U').charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                            <View style={styles.replyContent}>
                              <Text style={styles.commentUser}>{reply.user?.name || reply.name || 'Unknown'}</Text>
                              <Text style={styles.commentText}>{hashBadWords(reply.text)}</Text>
                              {renderAttachments(getAttachments(reply))}
                              <View style={styles.commentActions}>
                                <Text style={styles.commentDate}>
                                  {new Date(reply.createdAt).toLocaleDateString()}
                                </Text>
                                <View style={styles.commentActionButtons}>
                                  {isOwner(reply.user) && (
                                    <TouchableOpacity onPress={() => openReplyActions(selectedPost?._id, item._id, reply)}>
                                      <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textSecondary} />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyComments}>No comments yet</Text>
              }
              contentContainerStyle={styles.commentsList}
            />

            <View style={styles.commentInputContainer}>
              {replyingTo && (
                <View style={styles.replyingToContainer}>
                  <Text style={styles.replyingToText}>Replying to {replyingTo.name}</Text>
                  <TouchableOpacity onPress={() => setReplyingTo(null)}>
                    <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.attachActions}>
                <TouchableOpacity style={styles.attachButton} onPress={() => addMediaAttachment(setCommentAttachments, true)}>
                  <Ionicons name="image-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.attachText}>Photo/Video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachButton} onPress={() => addFileAttachment(setCommentAttachments)}>
                  <Ionicons name="document-attach-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.attachText}>File</Text>
                </TouchableOpacity>
              </View>
              {renderDraftAttachments(commentAttachments, setCommentAttachments)}
              <View style={styles.inputWrapper}>
                <TextInput
                  ref={commentInputRef}
                  style={styles.commentInput}
                  placeholder={replyingTo ? "Write a reply..." : "Write a comment..."}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholderTextColor={theme.colors.textLight}
                />
                <TouchableOpacity 
                  style={[styles.sendButton, ((!commentText.trim() && commentAttachments.length === 0) || submittingComment) && { opacity: 0.5 }]}
                  onPress={handleSubmitComment}
                  disabled={(!commentText.trim() && commentAttachments.length === 0) || submittingComment}
                >
                  {submittingComment ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="send" size={20} color="#FFF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Profile Modal */}
      <Modal
        visible={profileModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.profileModalContent}>
            <TouchableOpacity 
              style={styles.closeModalButton}
              onPress={() => setProfileModalVisible(false)}
            >
              <Ionicons name="close-circle" size={30} color={theme.colors.textLight} />
            </TouchableOpacity>

            {loadingProfile ? (
              <ActivityIndicator size="large" color={theme.colors.primary} style={styles.profileLoader} />
            ) : viewingUser ? (
              <View style={styles.profileContainer}>
                {/* New Horizontal Header Layout */}
                <View style={styles.profileHeaderRow}>
                  <View style={styles.avatarContainer}>
                    {viewingUser.profileImage ? (
                      <Image source={{ uri: viewingUser.profileImage }} style={styles.profileModalAvatar} />
                    ) : (
                      <View style={[styles.profileModalAvatar, styles.avatarPlaceholder]}>
                        <Text style={styles.profileAvatarText}>
                          {(viewingUser.name || 'U').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.profileInfoColumn}>
                    <Text style={styles.profileName} numberOfLines={1}>{viewingUser.name}</Text>
                    <Text style={styles.profileEmail} numberOfLines={1}>@{viewingUser.email.split('@')[0]}</Text>
                    
                    <View style={styles.locationContainer}>
                      <Ionicons name="location-sharp" size={12} color={theme.colors.textSecondary} />
                      <Text style={styles.locationText}>{viewingUser.location || 'Rubber Plantation'}</Text>
                    </View>
                  </View>
                </View>

                {/* Horizontal Stats Row */}
                <View style={styles.statsRow}>
                  <View style={styles.statItemCompact}>
                    <Text style={styles.statNumberCompact}>{(viewingUser.followersCount ?? viewingUser.followers?.length ?? 0)}</Text>
                    <Text style={styles.statLabelCompact}>Followers</Text>
                  </View>

                  {/* Show Following only if it's NOT the user's own profile */}
                  {user?._id && viewingUser?._id && String(user._id) !== String(viewingUser._id) && (
                    <View style={styles.statItemCompact}>
                      <Text style={styles.statNumberCompact}>{(viewingUser.followingCount ?? viewingUser.following?.length ?? 0)}</Text>
                      <Text style={styles.statLabelCompact}>Following</Text>
                    </View>
                  )}

                  <View style={styles.statItemCompact}>
                    <Text style={styles.statNumberCompact}>{viewingUser.stats?.trees || 0}</Text>
                    <Text style={styles.statLabelCompact}>Trees</Text>
                  </View>

                  <View style={styles.statItemCompact}>
                    <Text style={styles.statNumberCompact}>{viewingUser.stats?.posts || 0}</Text>
                    <Text style={styles.statLabelCompact}>Posts</Text>
                  </View>
                </View>

                {/* Actions Row (Only for others) */}
                {viewingUser?._id && String(user?._id) !== String(viewingUser._id) && (
                  <View style={styles.profileActionsRow}>
                    <TouchableOpacity 
                      style={[
                        styles.followButtonCompact,
                        viewingUser.isFollowing && styles.followingButtonCompact
                      ]}
                      onPress={handleToggleFollow}
                    >
                      <Text style={[
                        styles.followButtonTextCompact,
                        viewingUser.isFollowing && styles.followingButtonTextCompact
                      ]}>
                        {viewingUser.isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.messageButtonCompact}
                      onPress={() => {
                        setProfileModalVisible(false);
                        navigation.navigate('Chat', { otherUser: viewingUser });
                      }}
                    >
                      <Text style={styles.messageButtonTextCompact}>Message</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.errorText}>Failed to load profile</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Create Post Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closePostModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Post</Text>
              <TouchableOpacity onPress={closePostModal}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.modalScroll} 
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <TextInput
                style={styles.inputTitle}
                placeholder="Title"
                value={newTitle}
                onChangeText={setNewTitle}
                placeholderTextColor={theme.colors.textLight}
              />

              <TextInput
                style={styles.inputContent}
                placeholder="What's on your mind?"
                value={newContent}
                onChangeText={setNewContent}
                multiline
                textAlignVertical="top"
                placeholderTextColor={theme.colors.textLight}
                scrollEnabled={false} 
              />

              <View style={styles.attachActions}>
                <TouchableOpacity style={styles.attachButton} onPress={() => addMediaAttachment(setNewPostAttachments, true)}>
                  <Ionicons name="image-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.attachText}>Photo/Video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachButton} onPress={() => addFileAttachment(setNewPostAttachments)}>
                  <Ionicons name="document-attach-outline" size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.attachText}>File</Text>
                </TouchableOpacity>
              </View>
              {renderDraftAttachments(newPostAttachments, setNewPostAttachments)}
              {submitting && (
                <View style={styles.uploadStatus}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.uploadStatusText}>Uploading...</Text>
                </View>
              )}

              <TouchableOpacity 
                style={[
                  styles.submitButton, 
                  (submitting || ((!newTitle.trim() || !newContent.trim()) && newPostAttachments.length === 0)) && { opacity: 0.5 }
                ]}
                onPress={handleCreatePost}
                disabled={submitting || ((!newTitle.trim() || !newContent.trim()) && newPostAttachments.length === 0)}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Post</Text>
                )}
              </TouchableOpacity>
              <View style={{height: 20}} /> 
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editTarget?.type === 'post' ? 'Edit Post' : editTarget?.type === 'comment' ? 'Edit Comment' : 'Edit Reply'}
              </Text>
              <TouchableOpacity onPress={closeEditModal}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {editTarget?.type === 'post' && (
              <TextInput
                style={styles.inputTitle}
                placeholder="Title"
                value={editTitle}
                onChangeText={setEditTitle}
                placeholderTextColor={theme.colors.textLight}
              />
            )}

            <TextInput
              style={styles.inputContent}
              placeholder="Update your content..."
              value={editContent}
              onChangeText={setEditContent}
              multiline
              textAlignVertical="top"
              placeholderTextColor={theme.colors.textLight}
            />

            {editTarget?.type === 'post' && renderExistingAttachments(editExistingAttachments)}

            <View style={styles.attachActions}>
              <TouchableOpacity style={styles.attachButton} onPress={() => addMediaAttachment(setEditAttachments, true)}>
                <Ionicons name="image-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.attachText}>Photo/Video</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachButton} onPress={() => addFileAttachment(setEditAttachments)}>
                <Ionicons name="document-attach-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.attachText}>File</Text>
              </TouchableOpacity>
            </View>
            {renderDraftAttachments(editAttachments, setEditAttachments)}
            {submittingEdit && (
              <View style={styles.uploadStatus}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.uploadStatusText}>Uploading...</Text>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.submitButton, submittingEdit && { opacity: 0.7 }]}
              onPress={handleSaveEdit}
              disabled={submittingEdit}
            >
              {submittingEdit ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={lightboxVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setLightboxVisible(false)}
      >
        <View style={styles.lightboxOverlay}>
          <View style={styles.lightboxHeader}>
            <TouchableOpacity onPress={() => setLightboxVisible(false)} accessibilityRole="button" accessibilityLabel="Close image viewer">
              <Ionicons name="close" size={26} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.lightboxCounter}>
              {lightboxIndex + 1} / {lightboxAttachments.length}
            </Text>
            <View style={styles.lightboxSpacer} />
          </View>
          <FlatList
            ref={lightboxListRef}
            data={lightboxAttachments}
            keyExtractor={(item, index) => `${getAttachmentKey(item)}-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setLightboxIndex(index);
            }}
            renderItem={({ item }) => {
              const uri = typeof item === 'string' ? item : (item.url || item.uri);
              const name = typeof item === 'string' ? (item.split('/').pop() || 'Image') : (item.name || item.originalName || 'Image');
              return (
                <ScrollView
                  style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT - 120 }}
                  maximumZoomScale={3}
                  minimumZoomScale={1}
                  contentContainerStyle={styles.lightboxItem}
                  centerContent
                >
                  <Image
                    source={{ uri, cache: 'force-cache' }}
                    style={styles.lightboxImage}
                    resizeMode="contain"
                    accessibilityLabel={name}
                  />
                </ScrollView>
              );
            }}
          />
          <View style={styles.lightboxControls}>
            <TouchableOpacity
              onPress={() => goToLightboxIndex(lightboxIndex - 1)}
              disabled={lightboxIndex === 0}
              style={[styles.lightboxButton, lightboxIndex === 0 && { opacity: 0.4 }]}
              accessibilityRole="button"
              accessibilityLabel="Previous image"
            >
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => goToLightboxIndex(lightboxIndex + 1)}
              disabled={lightboxIndex >= lightboxAttachments.length - 1}
              style={[styles.lightboxButton, lightboxIndex >= lightboxAttachments.length - 1 && { opacity: 0.4 }]}
              accessibilityRole="button"
              accessibilityLabel="Next image"
            >
              <Ionicons name="chevron-forward" size={28} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Likes Modal */}
      <Modal
        visible={likesModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setLikesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.likesModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Likes</Text>
              <TouchableOpacity onPress={() => setLikesModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[...(posts.find(p => p._id === viewingLikesPostId)?.likes || [])].reverse()}
              keyExtractor={(item) => (typeof item === 'string' ? item : item._id) || Math.random().toString()}
              renderItem={({ item }) => {
                const userObj = typeof item === 'string' ? { name: 'User', _id: item } : item;
                return (
                  <TouchableOpacity 
                    style={styles.likeUserItem}
                    onPress={() => {
                      setLikesModalVisible(false);
                      if (userObj._id) handleViewProfile(userObj._id);
                    }}
                  >
                    {userObj.profileImage ? (
                      <Image source={{ uri: userObj.profileImage }} style={styles.likeAvatar} />
                    ) : (
                      <View style={[styles.likeAvatar, styles.avatarPlaceholder]}>
                        <Text style={styles.likeAvatarText}>
                          {(userObj.name || 'U').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View>
                      <Text style={styles.likeUserName}>{userObj.name || 'Unknown User'}</Text>
                      {/* We don't have timestamp in the likes array usually, just user references */}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>No likes yet</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  postCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  avatar: {
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
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  postDate: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  postContent: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  attachmentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  attachmentItem: {
    width: '48%',
    backgroundColor: theme.colors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  attachmentImage: {
    width: '100%',
    height: 120,
  },
  attachmentFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
  },
  attachmentName: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  draftAttachments: {
    gap: 8,
    marginBottom: 12,
  },
  draftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  draftName: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginRight: 10,
  },
  draftHeader: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  attachActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  uploadStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  uploadStatusText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  lightboxHeader: {
    height: 60,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lightboxCounter: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  lightboxSpacer: {
    width: 26,
  },
  lightboxItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 120,
  },
  lightboxControls: {
    height: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  lightboxButton: {
    padding: 6,
  },
  attachText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  postActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  actionText: {
    marginLeft: 6,
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textLight,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  inputTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingVertical: 12,
    marginBottom: 16,
  },
  inputContent: {
    fontSize: 16,
    color: theme.colors.text,
    minHeight: 120, // Replaced flex: 1 with minHeight
    marginBottom: 20,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Comment Styles
  commentModalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: 16,
  },
  commentsList: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#F8FAFC',
  },
  commentAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  commentContent: {
    flex: 1,
    backgroundColor: theme.colors.inputBg,
    borderRadius: 16,
    padding: 12,
    borderTopLeftRadius: 4,
  },
  commentUser: {
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
    color: theme.colors.text,
  },
  commentText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 6,
    lineHeight: 22,
  },
  commentDate: {
    fontSize: 11,
    color: theme.colors.textLight,
  },
  emptyComments: {
    textAlign: 'center',
    color: theme.colors.textLight,
    marginTop: 40,
    fontSize: 16,
  },
  commentInputContainer: {
    flexDirection: 'column',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
    paddingBottom: Platform.OS === 'ios' ? 40 : 16,
    ...theme.shadows.lg,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
  },
  commentInput: {
    flex: 1,
    backgroundColor: theme.colors.inputBg,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 12,
    color: theme.colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
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
  
  // New Styles
  profileModalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 0,
    maxHeight: '85%',
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  commentActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  replyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  repliesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  replyItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  replyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  replyAvatarText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  replyContent: {
    flex: 1,
  },
  replyingToContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    width: '100%',
  },
  replyingToText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  profileContainer: {
    paddingBottom: 24,
    width: '100%',
  },
  closeModalButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    padding: 5,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    paddingTop: 30,
    paddingBottom: 16,
  },
  avatarContainer: {
    padding: 3,
    backgroundColor: '#FFF',
    borderRadius: 50,
    ...theme.shadows.md,
    marginRight: 20,
  },
  profileModalAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  profileInfoColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: theme.colors.textLight,
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 4,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 20,
  },
  statItemCompact: {
    alignItems: 'center',
  },
  statNumberCompact: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statLabelCompact: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 4,
  },
  profileActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 24,
  },
  followButtonCompact: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },
  followingButtonCompact: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  followButtonTextCompact: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },
  followingButtonTextCompact: {
    color: theme.colors.primary,
  },
  messageButtonCompact: {
    flex: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButtonTextCompact: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  profileLoader: {
    marginVertical: 40,
  },
  errorText: {
    textAlign: 'center',
    marginVertical: 40,
    color: theme.colors.error,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
  },
  imageButton: {
    width: '100%',
  },
  downloadOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },
  attachmentFileContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  downloadButton: {
    padding: 4,
  },
  
  // Likes Modal Styles
  likesModalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '60%',
    padding: 24,
  },
  likeUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  likeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  likeAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  likeUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
});

export default BlogScreen;
