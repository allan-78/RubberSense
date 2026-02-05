import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Animated, Dimensions, Image, Modal, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { scanAPI, latexAPI, treeAPI, postAPI, authAPI, userAPI } from '../services/api';
import theme from '../styles/theme';

const { width } = Dimensions.get('window');

const ProfileScreen = ({ navigation, route }) => {
  const { user, logout, refreshUser, updateFollowingOptimistic } = useAuth();
  const [profileData, setProfileData] = useState(user);
  const [scanCount, setScanCount] = useState(0);
  const [treeCount, setTreeCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [isOtherUser, setIsOtherUser] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  
  // List Modal State
  const [showListModal, setShowListModal] = useState(false);
  const [listType, setListType] = useState('followers'); // 'followers' or 'following'
  
  const scrollY = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [route.params?.userId])
  );

  const fetchData = async () => {
    try {
      const targetUserId = route.params?.userId;
      const isOther = targetUserId && targetUserId !== user._id;
      setIsOtherUser(isOther);

      if (isOther) {
        // Fetch other user's profile
        const userRes = await userAPI.getProfile(targetUserId);
        const userData = userRes.data;
        setProfileData(userData);
        
        // Use isFollowing from backend response
        setIsFollowing(userData.isFollowing);

        setScanCount(userData.stats?.scans || 0);
        setTreeCount(userData.stats?.trees || 0);
        setPostCount(userData.stats?.posts || 0);

      } else {
        // Fetch my own profile stats AND fresh user data
        const [scansRes, latexRes, treesRes, postsRes, meRes] = await Promise.all([
          scanAPI.getAll(),
          latexAPI.getAll(),
          treeAPI.getAll(),
          postAPI.getMyPosts(),
          authAPI.getMe(),
        ]);
        
        const myData = meRes?.data?.user;
        setProfileData(myData);
        setIsOtherUser(false);

        const totalScans = (scansRes.data?.length || 0) + (latexRes.data?.length || 0);
        setScanCount(totalScans);
        
        const totalTrees = treesRes.data?.length || 0;
        setTreeCount(totalTrees);

        const totalPosts = postsRes.count || 0;
        setPostCount(totalPosts);
      }
      
    } catch (error) {
      console.log('Error fetching profile stats:', error);
    }
  };

  const handleFollow = async () => {
    try {
      // 1. Optimistic Update
      const willBeFollowing = !isFollowing;
      setIsFollowing(willBeFollowing);
      
      // Update local follower list optimistically
      setProfileData(prev => {
        let updatedFollowers = [...(prev.followers || [])];
        if (willBeFollowing) {
          if (!updatedFollowers.some(f => String(f._id || f) === String(user._id))) {
            updatedFollowers.push(user);
          }
        } else {
          updatedFollowers = updatedFollowers.filter(f => String(f._id || f) !== String(user._id));
        }
        return { ...prev, followers: updatedFollowers };
      });

      // 2. API Call
      const response = await userAPI.toggleFollow(profileData._id);
      
      updateFollowingOptimistic(profileData, willBeFollowing);
      
      // 3. Sync with Global State and Backend
      const updated = await refreshUser();
      if (!isOtherUser && updated) {
        setProfileData(updated);
      }
    } catch (error) {
      console.log('Error toggling follow:', error);
      Alert.alert('Error', 'Could not update follow status');
      // Revert optimistic update
      fetchData();
    }
  };

  useEffect(() => {
    if (!isOtherUser && user) {
      setProfileData(user);
    }
  }, [user?.followers?.length, user?.following?.length, isOtherUser]);

  const handleMessage = () => {
    // Navigate to ChatScreen with this user
    navigation.navigate('Chat', { otherUser: profileData });
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', onPress: logout, style: 'destructive' },
    ]);
  };

  const profileInfo = [
    { label: 'Email', value: profileData?.email, icon: 'mail' },
    { label: 'Role', value: profileData?.role || 'User', icon: 'shield-checkmark' },
    { label: 'Phone', value: profileData?.phoneNumber || 'Not provided', icon: 'call' },
    { label: 'Location', value: profileData?.location || 'Not provided', icon: 'location' },
  ];

  const SettingItem = ({ icon, label, desc, onPress, isDestructive }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={[styles.settingIconBox, { 
        backgroundColor: isDestructive ? `${theme.colors.error}10` : `${theme.colors.primary}10` 
      }]}>
        <Ionicons 
          name={icon} 
          size={22} 
          color={isDestructive ? theme.colors.error : theme.colors.primary} 
        />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, isDestructive && { color: theme.colors.error }]}>{label}</Text>
        {desc && <Text style={styles.settingDesc}>{desc}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textLight} />
    </TouchableOpacity>
  );

  const openList = (type) => {
    setListType(type);
    setShowListModal(true);
  };
  
  const renderUserItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.userListItem}
      onPress={() => {
        setShowListModal(false);
        navigation.navigate('Main', { screen: 'Blog', params: { openProfileUserId: item._id } });
      }}
    >
      <Image 
        source={item.profileImage ? { uri: item.profileImage } : null} 
        style={styles.listAvatar} 
      />
      {!item.profileImage && (
        <View style={[styles.listAvatar, styles.listAvatarPlaceholder]}>
          <Text style={styles.listAvatarText}>{(item.name || 'U').charAt(0)}</Text>
        </View>
      )}
      <Text style={styles.listName}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Animated.ScrollView 
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Creative Header */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={theme.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>My Profile</Text>
              
              <View style={styles.profileSection}>
                <View style={styles.avatarContainer}>
                  {profileData?.profileImage ? (
                    <Image source={{ uri: profileData.profileImage }} style={styles.avatarImage} />
                  ) : (
                    <LinearGradient
                      colors={['#F0FDF4', '#DCFCE7']}
                      style={styles.avatarPlaceholder}
                    >
                      <Text style={styles.avatarText}>{(profileData?.name || 'U').charAt(0)}</Text>
                    </LinearGradient>
                  )}
                  <View style={styles.verifiedBadge}>
                    <MaterialIcons name="verified" size={20} color={theme.colors.info} />
                  </View>
                </View>
                
                <Text style={styles.userName}>{profileData?.name || 'Rubber Farmer'}</Text>
                <Text style={styles.userStatus}>
                  {profileData?.isVerified ? 'Verified Producer' : 'Standard Member'}
                </Text>

                {isOtherUser && (
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity 
                      style={[
                        styles.actionButton, 
                        isFollowing ? styles.followingButton : styles.followButton
                      ]} 
                      onPress={handleFollow}
                    >
                      <Text style={[
                        styles.actionButtonText, 
                        isFollowing ? styles.followingButtonText : styles.followButtonText
                      ]}>
                        {isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.actionButton, styles.messageButton]} 
                      onPress={handleMessage}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={20} color="#FFF" />
                      <Text style={styles.messageButtonText}>Message</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>
          
          {/* Decorative Circles */}
          <View style={styles.circle1} />
          <View style={styles.circle2} />
        </View>

        {/* Stats Cards - Floating */}
        <View style={styles.statsContainer}>
          <View style={styles.statsCard}>
            <View style={[styles.statIconBox, { backgroundColor: `${theme.colors.primary}10` }]}>
              <FontAwesome5 name="camera" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.statValue}>{scanCount}</Text>
              <Text style={styles.statLabel}>Scans</Text>
            </View>
          </View>
          
          <View style={styles.statsDivider} />
          
          <View style={styles.statsCard}>
            <View style={[styles.statIconBox, { backgroundColor: `${theme.colors.primary}10` }]}>
              <FontAwesome5 name="tree" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.statValue}>{treeCount}</Text>
              <Text style={styles.statLabel}>Trees</Text>
            </View>
          </View>

          <View style={styles.statsDivider} />

          <View style={styles.statsCard}>
            <View style={[styles.statIconBox, { backgroundColor: `${theme.colors.primary}10` }]}>
              <FontAwesome5 name="newspaper" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.statValue}>{postCount}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
          </View>

          <View style={styles.statsDivider} />

          <TouchableOpacity style={styles.statsCard} onPress={() => openList('followers')}>
            <View style={[styles.statIconBox, { backgroundColor: `${theme.colors.primary}10` }]}>
              <FontAwesome5 name="users" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.statValue}>{(profileData?.followersCount ?? profileData?.followers?.length ?? 0)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.statsDivider} />

          <TouchableOpacity style={styles.statsCard} onPress={() => openList('following')}>
            <View style={[styles.statIconBox, { backgroundColor: `${theme.colors.primary}10` }]}>
              <FontAwesome5 name="user-friends" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.statValue}>{(profileData?.followingCount ?? profileData?.following?.length ?? 0)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Personal Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Personal Info</Text>
          <View style={styles.infoCard}>
            {profileInfo.map((info, index) => (
              <View key={index} style={[styles.infoRow, index !== profileInfo.length - 1 && styles.infoRowBorder]}>
                <View style={[styles.infoIconBox, { backgroundColor: `${theme.colors.primary}10` }]}>
                  <Ionicons name={info.icon} size={18} color={theme.colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>{info.label}</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>{info.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Settings Section */}
        {!isOtherUser && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Settings</Text>
          <View style={styles.settingsCard}>
            <SettingItem 
              icon="notifications" 
              label="Notifications" 
              desc="Manage your alerts" 
            />
            <SettingItem 
              icon="moon" 
              label="Dark Mode" 
              desc="Toggle app theme" 
            />
            <SettingItem 
              icon="lock-closed" 
              label="Privacy & Security" 
              desc="Password, 2FA" 
            />
            <SettingItem 
              icon="help-buoy" 
              label="Help & Support" 
              desc="FAQs, Contact Us" 
            />
            <SettingItem 
              icon="storefront" 
              label="Marketplace" 
              desc="Buy & Sell Rubber Products" 
              onPress={() => navigation.navigate('Market')}
            />
          </View>
        </View>
        )}

        {/* Logout */}
        {!isOtherUser && (
        <View style={styles.footerSection}>
          <TouchableOpacity 
            style={styles.logoutButton} 
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#FFF1F2', '#FFE4E6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoutGradient}
            >
              <View style={styles.logoutIconContainer}>
                <Ionicons name="log-out" size={20} color={theme.colors.error} />
              </View>
              <Text style={styles.logoutText}>Log Out</Text>
              <Ionicons name="chevron-forward" size={20} color="#FECDD3" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.versionText}>Version 1.0.2 • Build 2024</Text>
        </View>
        )}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showListModal}
        onRequestClose={() => setShowListModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {listType === 'followers' ? 'Followers' : 'Following'}
              </Text>
              <TouchableOpacity onPress={() => setShowListModal(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={listType === 'followers' ? profileData?.followers : profileData?.following}
              keyExtractor={(item) => (item && item._id) ? item._id.toString() : (item ? item.toString() : Math.random().toString())}
              renderItem={renderUserItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Text style={styles.emptyListText}>No users found</Text>
                </View>
              }
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
    backgroundColor: '#F8FAFC',
  },
  
  // Header Styles
  headerContainer: {
    height: 320,
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
    // marginBottom: 50, // Removed to use negative margin on stats
    ...theme.shadows.md,
  },
  headerGradient: {
    flex: 1,
    paddingTop: 60,
    alignItems: 'center',
  },
  headerContent: {
    alignItems: 'center',
    zIndex: 10,
    width: '100%',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 30,
  },
  profileSection: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
    ...theme.shadows.lg,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: theme.colors.primaryDark,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 2,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  userStatus: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
  
  // Decorative Circles
  circle1: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  circle2: {
    position: 'absolute',
    top: 50,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    // position: 'absolute', // Removed absolute positioning
    // top: 270,
    marginTop: -50, // Negative margin to overlap header
    marginHorizontal: 16, // Reduced margin
    marginBottom: 30, // Push content below down
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 12, // Reduced padding to fit 4 items
    justifyContent: 'space-between',
    alignItems: 'center',
    ...theme.shadows.lg,
    shadowOpacity: 0.15,
    elevation: 10,
    zIndex: 100, // Ensure it sits on top
  },
  statsCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4, // Reduced gap
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  statsDivider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.border,
  },

  // Section Styles
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
    marginLeft: 4,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    ...theme.shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },

  // Settings Styles
  settingsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 8,
    ...theme.shadows.sm,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  settingIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  settingDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // Footer
  footerSection: {
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 16,
  },
  logoutButton: {
    width: '100%',
    borderRadius: 16,
    ...theme.shadows.sm,
    overflow: 'hidden',
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  logoutIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  logoutText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.error,
  },
  versionText: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  
  // Action Buttons
  actionButtonsRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    justifyContent: 'center',
    minWidth: 100,
  },
  followButton: {
    backgroundColor: '#FFFFFF',
  },
  followingButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  messageButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    gap: 8,
  },
  actionButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  followButtonText: {
    color: theme.colors.primary,
  },
  followingButtonText: {
    color: '#FFFFFF',
  },
  messageButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // List Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  listContent: {
    paddingBottom: 20,
  },
  userListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  listAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  listAvatarPlaceholder: {
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  listName: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  emptyList: {
    padding: 20,
    alignItems: 'center',
  },
  emptyListText: {
    color: theme.colors.textLight,
    fontSize: 16,
  },
});

export default ProfileScreen;
