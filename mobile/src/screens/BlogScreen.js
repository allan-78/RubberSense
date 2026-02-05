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
  SafeAreaView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { postAPI, userAPI } from '../services/api';
import theme from '../styles/theme';

const BlogScreen = ({ navigation, route }) => {
  const { user, refreshUser, updateFollowingOptimistic } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Comment State
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // { id: commentId, name: userName }

  // Profile Modal State
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  // New Post State
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const commentInputRef = useRef(null);

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

  const handleCreatePost = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      await postAPI.create({
        title: newTitle,
        content: newContent,
        // image: null // TODO: Add image upload support later
      });
      
      setModalVisible(false);
      setNewTitle('');
      setNewContent('');
      fetchPosts(); // Refresh list
      Alert.alert('Success', 'Post created successfully!');
    } catch (error) {
      console.log('Create post error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (postId) => {
    try {
      // Optimistic update
      setPosts(currentPosts => 
        currentPosts.map(post => {
          if (post._id === postId) {
            // Robust check for existing like
            const isLiked = post.likes && post.likes.some(id => String(id) === String(user._id));
            
            let newLikes = [...(post.likes || [])];
            if (isLiked) {
              newLikes = newLikes.filter(id => String(id) !== String(user._id));
            } else {
              // Only push if not already there (double safety)
              if (!newLikes.some(id => String(id) === String(user._id))) {
                newLikes.push(user._id);
              }
            }

            return {
              ...post,
              likes: newLikes
            };
          }
          return post;
        })
      );
      
      await postAPI.toggleLike(postId);
    } catch (error) {
      console.log('Error liking post:', error);
      fetchPosts(); // Revert on error
    }
  };

  const handleCommentPress = (post) => {
    setSelectedPost(post);
    setCommentModalVisible(true);
    setReplyingTo(null);
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
    if (!commentText.trim() || !selectedPost) return;

    setSubmittingComment(true);
    try {
      let response;
      if (replyingTo) {
        response = await postAPI.replyToComment(selectedPost._id, replyingTo.id, commentText);
      } else {
        response = await postAPI.addComment(selectedPost._id, commentText);
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
    } catch (error) {
      console.log('Error commenting:', error);
      Alert.alert('Error', 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const renderItem = ({ item }) => {
    const isLiked = item.likes.includes(user?._id);
    
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
        </View>

        {/* Content */}
        <Text style={styles.postTitle}>{item.title}</Text>
        <Text style={styles.postContent}>{item.content}</Text>

        {/* Actions */}
        <View style={styles.postActions}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => handleLike(item._id)}
          >
            <Ionicons 
              name={isLiked ? "heart" : "heart-outline"} 
              size={24} 
              color={isLiked ? theme.colors.error : theme.colors.textSecondary} 
            />
            <Text style={[styles.actionText, isLiked && { color: theme.colors.error }]}>
              {item.likes.length}
            </Text>
          </TouchableOpacity>

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
      <LinearGradient
        colors={theme.gradients.primary}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>Community Blog</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity 
            style={[styles.addButton, { marginRight: 10, backgroundColor: 'rgba(255,255,255,0.2)' }]}
            onPress={() => navigation.navigate('Inbox')}
          >
            <Ionicons name="chatbubbles-outline" size={24} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

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
        onRequestClose={() => setCommentModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.commentModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentModalVisible(false)}>
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
                    <Text style={styles.commentText}>{item.text}</Text>
                    <View style={styles.commentActions}>
                      <Text style={styles.commentDate}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                      <TouchableOpacity onPress={() => handleReply(item)}>
                        <Text style={styles.replyButtonText}>Reply</Text>
                      </TouchableOpacity>
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
                              <Text style={styles.commentText}>{reply.text}</Text>
                              <Text style={styles.commentDate}>
                                {new Date(reply.createdAt).toLocaleDateString()}
                              </Text>
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
                  style={[styles.sendButton, (!commentText.trim() || submittingComment) && { opacity: 0.5 }]}
                  onPress={handleSubmitComment}
                  disabled={!commentText.trim() || submittingComment}
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
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Post</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

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
            />

            <TouchableOpacity 
              style={[styles.submitButton, submitting && { opacity: 0.7 }]}
              onPress={handleCreatePost}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...theme.shadows.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  postCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...theme.shadows.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: '#FFF',
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
    flex: 1,
    marginBottom: 20,
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
    backgroundColor: '#FFF',
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
    borderBottomColor: '#F1F5F9',
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
    backgroundColor: '#F8FAFC',
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
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFF',
    paddingBottom: Platform.OS === 'ios' ? 40 : 16,
    ...theme.shadows.lg,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 12,
    color: theme.colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
});

export default BlogScreen;
