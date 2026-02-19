import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  ScrollView, 
  Animated, 
  Dimensions, 
  Image, 
  Modal, 
  FlatList, 
  Switch, 
  Platform, 
  UIManager,
  StatusBar 
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons, Ionicons, FontAwesome5, Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { scanAPI, latexAPI, treeAPI, postAPI, authAPI, userAPI } from '../services/api';
import theme from '../styles/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

// Light Theme Palette
const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#64748B',
  primary: '#556B2F', // Olive Green
  primaryLight: '#8FBC8F',
  border: '#E2E8F0',
  error: '#EF4444',
  success: '#10B981',
};

const TEAM_MEMBERS = [
  {
    id: 'advisor',
    name: "Prof. Pops Madriaga",
    role: "Project Advisor",
    bio: "Guiding the intersection of agriculture and technology.",
    image: "https://ui-avatars.com/api/?name=Pops+Madriaga&background=556B2F&color=fff&size=200"
  },
  {
    id: 'lead',
    name: "Allan Monforte",
    role: "Lead Developer",
    bio: "Passionate about creating intuitive user experiences.",
    image: "https://ui-avatars.com/api/?name=Allan+Monforte&background=8FBC8F&color=fff&size=400"
  },
  {
    id: '2',
    name: "Dwayne Casay",
    role: "Developer",
    bio: "Backend architecture & data integration.",
    image: "https://ui-avatars.com/api/?name=Dwayne+Casay&background=8FBC8F&color=fff&size=200"
  },
  {
    id: '3',
    name: "Thea Arnado",
    role: "UI/UX Design",
    bio: "Making technology accessible to everyone.",
    image: "https://ui-avatars.com/api/?name=Thea+Arnado&background=8FBC8F&color=fff&size=200"
  },
  {
    id: '4',
    name: "Lance David",
    role: "Developer",
    bio: "Quality assurance & performance optimization.",
    image: "https://ui-avatars.com/api/?name=Lance+David&background=8FBC8F&color=fff&size=200"
  }
];

const ProfileScreen = ({ navigation, route }) => {
  const { user, logout } = useAuth();
  const [profileData, setProfileData] = useState(user);
  const [scanCount, setScanCount] = useState(0);
  const [treeCount, setTreeCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [isOtherUser, setIsOtherUser] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  
  // Modal States
  const [showListModal, setShowListModal] = useState(false);
  const [listType, setListType] = useState('followers');
  const [showAboutModal, setShowAboutModal] = useState(false);
  
  // Settings State
  const [pushNotifications, setPushNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  
  const scrollY = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      fetchData();
      if (route.params?.showAbout) {
        setShowAboutModal(true);
        navigation.setParams({ showAbout: false });
      }
    }, [route.params?.userId, route.params?.showAbout])
  );

  const fetchData = async () => {
    try {
      const targetUserId = route.params?.userId;
      const isOther = targetUserId && targetUserId !== user._id;
      setIsOtherUser(isOther);

      if (isOther) {
        const userRes = await userAPI.getProfile(targetUserId);
        const userData = userRes.data;
        setProfileData(userData);
        setIsFollowing(userData.isFollowing);
        setScanCount(userData.stats?.scans || 0);
        setTreeCount(userData.stats?.trees || 0);
        setPostCount(userData.stats?.posts || 0);
      } else {
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
      const willBeFollowing = !isFollowing;
      setIsFollowing(willBeFollowing);
      
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

      await userAPI.toggleFollow(profileData._id);
      
      const updated = await authAPI.getMe().then(res => res.data.user);
      if (!isOtherUser && updated) {
        setProfileData(updated);
      }
    } catch (error) {
      console.log('Error toggling follow:', error);
      Alert.alert('Error', 'Could not update follow status');
      fetchData();
    }
  };

  useEffect(() => {
    if (!isOtherUser && user) {
      setProfileData(user);
    }
  }, [user?.followers?.length, user?.following?.length, isOtherUser]);

  const handleMessage = () => {
    navigation.navigate('Chat', { otherUser: profileData });
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', onPress: logout, style: 'destructive' },
    ]);
  };

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

  const renderTeamMember = ({ item }) => (
    <View style={styles.teamCard}>
      <Image source={{ uri: item.image }} style={styles.teamImage} />
      <View style={styles.teamContent}>
        <Text style={styles.teamName}>{item.name}</Text>
        <Text style={styles.teamRole}>{item.role}</Text>
        <Text style={styles.teamBio} numberOfLines={3}>{item.bio}</Text>
      </View>
    </View>
  );

  const InfoRow = ({ icon, label, value }) => (
    <View style={styles.infoRow}>
      <View style={styles.infoIconBox}>
        <Ionicons name={icon} size={20} color={COLORS.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
    </View>
  );

  const SettingRow = ({ icon, label, hasSwitch, value, onValueChange, onPress }) => (
    <TouchableOpacity 
      style={styles.settingRow} 
      onPress={onPress}
      disabled={hasSwitch}
      activeOpacity={hasSwitch ? 1 : 0.7}
    >
      <View style={styles.settingLeft}>
        <Ionicons name={icon} size={22} color={COLORS.textSecondary} />
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {hasSwitch ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#E2E8F0', true: COLORS.primary }}
          thumbColor={'#FFF'}
          ios_backgroundColor="#E2E8F0"
        />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBarButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>PROFILE</Text>
        <TouchableOpacity style={styles.topBarButton}>
          <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {profileData?.profileImage ? (
              <Image source={{ uri: profileData.profileImage }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{(profileData?.name || 'U').charAt(0)}</Text>
              </View>
            )}
            {profileData?.isVerified && (
              <View style={styles.verifiedBadge}>
                <MaterialIcons name="verified" size={16} color="#FFF" />
              </View>
            )}
          </View>
          
          <Text style={styles.userName}>{profileData?.name || 'Rubber Farmer'}</Text>
          <Text style={styles.userRole}>
            Rubber Farmer • {profileData?.location ? profileData.location.split(',')[0] : 'Mindanao, PH'}
          </Text>
          
          {profileData?.isVerified && (
            <View style={styles.statusPill}>
              <MaterialIcons name="verified-user" size={14} color={COLORS.primary} />
              <Text style={styles.statusText}>VERIFIED GROWER</Text>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{scanCount}</Text>
            <Text style={styles.statLabel}>SCANS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{treeCount}</Text>
            <Text style={styles.statLabel}>TREES</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statItem} onPress={() => openList('followers')}>
            <Text style={styles.statValue}>{(profileData?.followersCount ?? profileData?.followers?.length ?? 0)}</Text>
            <Text style={styles.statLabel}>FOLLOWERS</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        {!isOtherUser ? (
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={styles.primaryButton} 
              activeOpacity={0.8}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Ionicons name="pencil" size={18} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Edit Profile</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.secondaryButton} 
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Market')}
            >
              <Ionicons name="storefront" size={18} color={COLORS.text} style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Marketplace</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.primaryButton, isFollowing && styles.followingButton]} 
              activeOpacity={0.8}
              onPress={handleFollow}
            >
              <Text style={[styles.primaryButtonText, isFollowing && styles.followingButtonText]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.secondaryButton} 
              activeOpacity={0.8}
              onPress={handleMessage}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.text} style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Message</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Personal Information */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>
          <View style={styles.cardContainer}>
            <InfoRow 
              icon="mail" 
              label="Email" 
              value={profileData?.email} 
            />
            <View style={styles.rowDivider} />
            <InfoRow 
              icon="call" 
              label="Phone" 
              value={profileData?.phoneNumber || '+63 912 345 6789'} 
            />
            <View style={styles.rowDivider} />
            <InfoRow 
              icon="location" 
              label="Location" 
              value={profileData?.location || 'Davao City, Philippines'} 
            />
          </View>
        </View>

        {/* Preferences */}
        {!isOtherUser && (
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>PREFERENCES</Text>
          <View style={styles.cardContainer}>
            <SettingRow 
              icon="notifications" 
              label="Push Notifications" 
              hasSwitch 
              value={pushNotifications}
              onValueChange={setPushNotifications}
            />
            <View style={styles.rowDivider} />
            <SettingRow 
              icon="moon" 
              label="Dark Mode" 
              hasSwitch 
              value={darkMode}
              onValueChange={setDarkMode}
            />
             <View style={styles.rowDivider} />
            <SettingRow 
              icon="information-circle" 
              label="About Us" 
              onPress={() => setShowAboutModal(true)}
            />
          </View>
        </View>
        )}

        {/* Logout */}
        {!isOtherUser && (
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <Ionicons name="log-out-outline" size={20} color="#D97706" style={{ marginRight: 8 }} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
            <Text style={styles.versionText}>RubberSense v2.4.0 (Build 302)</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* About Us Modal - Dark Theme Redesign */}
      <Modal
        animationType="slide"
        presentationStyle="fullScreen"
        visible={showAboutModal}
        onRequestClose={() => setShowAboutModal(false)}
      >
        <View style={styles.darkContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#2F3E1B" />
          
          {/* Header Nav */}
          <View style={styles.darkHeader}>
            <TouchableOpacity onPress={() => setShowAboutModal(false)} style={styles.darkBackButton}>
              <Ionicons name="arrow-back" size={20} color="#8FBC8F" />
            </TouchableOpacity>
            <Text style={styles.darkHeaderTitle}>RUBBERSENSE</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.darkContent}>
            
            {/* University Branding */}
            <View style={styles.brandingSectionDark}>
              <View style={styles.logoCircle}>
                <Ionicons name="school" size={32} color="#8FBC8F" />
              </View>
              <Text style={styles.uniTitle}>
                Technological <Text style={styles.uniTitleItalic}>University</Text> of the Philippines
              </Text>
              <Text style={styles.campusSubtitle}>TAGUIG CAMPUS</Text>
            </View>

            {/* Vision Section */}
            <View style={styles.visionSection}>
              <Text style={styles.visionTitle}>The Vision</Text>
              <Text style={styles.visionQuote}>
                "Empowering rubber farmers with precise, data-driven insights to maximize yield."
              </Text>
              
              <View style={styles.visionMetaRow}>
                <View>
                  <Text style={styles.metaLabel}>YEAR OF DEV</Text>
                  <Text style={styles.metaValue}>2023-2024</Text>
                </View>
                <View>
                  <Text style={styles.metaLabel}>PROJECT LEAD</Text>
                  <Text style={styles.metaValue}>Allan Monforte</Text>
                </View>
              </View>
            </View>

            {/* Team Section */}
            <View style={styles.teamSectionDark}>
              <View style={styles.teamHeaderRow}>
                <Text style={styles.teamSectionTitleDark}>The Team</Text>
                <View style={styles.teamDivider} />
                <Text style={styles.contributorsLabel}>CONTRIBUTORS</Text>
              </View>

              {/* Advisor Card */}
              {TEAM_MEMBERS.filter(m => m.id === 'advisor').map(advisor => (
                <View key={advisor.id} style={styles.advisorCard}>
                  <Image source={{ uri: advisor.image }} style={styles.advisorImage} />
                  <View style={styles.advisorContent}>
                    <Text style={styles.advisorRole}>PROJECT ADVISOR</Text>
                    <Text style={styles.advisorName}>{advisor.name}</Text>
                    <Text style={styles.advisorBio}>{advisor.bio}</Text>
                  </View>
                </View>
              ))}

              {/* Dev Grid */}
              <View style={styles.devGrid}>
                {/* Lead Developer (Left Column) */}
                <View style={styles.leadColumn}>
                  {TEAM_MEMBERS.filter(m => m.id === 'lead').map(lead => (
                    <View key={lead.id} style={styles.leadCard}>
                      <Image source={{ uri: lead.image }} style={styles.leadImage} />
                      <View style={styles.leadContent}>
                        <Text style={styles.leadName}>{lead.name}</Text>
                        <Text style={styles.leadRole}>{lead.role.toUpperCase()}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Other Devs (Right Column) */}
                <View style={styles.othersColumn}>
                  {TEAM_MEMBERS.filter(m => m.id !== 'advisor' && m.id !== 'lead').map(member => (
                    <View key={member.id} style={styles.memberCard}>
                      <View style={styles.memberIconBox}>
                        <Ionicons name="person" size={16} color="#E2E8F0" />
                      </View>
                      <View>
                        <Text style={styles.memberName}>{member.name}</Text>
                        <Text style={styles.memberRole}>{member.role.toUpperCase()}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.darkFooter}>
              <Text style={styles.footerBrand}>RubberSense</Text>
              <Text style={styles.footerCopy}>CAPSTONE PROJECT © 2023</Text>
              <Text style={styles.footerVer}>v2.4.0 (302)</Text>
            </View>

          </ScrollView>
        </View>
      </Modal>
      
      {/* Followers Modal */}
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
                <Ionicons name="close" size={24} color={COLORS.text} />
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
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  
  // Top Bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 24) + 20,
    paddingBottom: 16,
    backgroundColor: COLORS.background,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  topBarButton: {
    padding: 8,
  },

  // Profile Header
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    marginBottom: 16,
    position: 'relative',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFF',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
    marginBottom: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(85, 107, 47, 0.1)', // Light olive bg
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },

  // Stats Card
  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },

  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 16,
    marginBottom: 32,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  followingButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  followingButtonText: {
    color: COLORS.primary,
  },

  // Sections
  sectionContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 40,
  },
  
  // Info Row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(85, 107, 47, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  logoutText: {
    color: '#D97706', // Amber-600
    fontSize: 14,
    fontWeight: '600',
  },
  versionText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
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
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  listContent: {
    paddingBottom: 20,
  },
  userListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  listAvatarPlaceholder: {
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listAvatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  listName: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  emptyList: {
    padding: 20,
    alignItems: 'center',
  },
  emptyListText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  // About Modal Styles (Dark Theme)
  darkContainer: {
    flex: 1,
    backgroundColor: '#2F3E1B', // Deep Olive Base
  },
  darkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 24) + 20,
    paddingBottom: 10,
  },
  darkBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(143, 188, 143, 0.3)', // #8FBC8F
    justifyContent: 'center',
    alignItems: 'center',
  },
  darkHeaderTitle: {
    color: 'rgba(143, 188, 143, 0.5)',
    fontSize: 12,
    letterSpacing: 4,
    fontWeight: '600',
  },
  darkContent: {
    paddingBottom: 60,
  },
  brandingSectionDark: {
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 40,
    marginBottom: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(143, 188, 143, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  uniTitle: {
    fontSize: 26,
    color: '#E2E8F0',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
    // fontFamily: 'serif', // React Native default serif
  },
  uniTitleItalic: {
    fontStyle: 'italic',
    color: '#8FBC8F',
    fontWeight: '300',
  },
  campusSubtitle: {
    fontSize: 10,
    color: '#8FBC8F',
    letterSpacing: 2,
    fontWeight: '600',
    opacity: 0.8,
  },
  
  // Vision
  visionSection: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  visionTitle: {
    fontSize: 32,
    color: '#8FBC8F',
    marginBottom: 16,
    // fontFamily: 'serif',
    fontWeight: '400',
  },
  visionQuote: {
    fontSize: 18,
    color: '#E2E8F0',
    fontStyle: 'italic',
    lineHeight: 28,
    marginBottom: 32,
    opacity: 0.9,
  },
  visionMetaRow: {
    flexDirection: 'row',
    gap: 40,
  },
  metaLabel: {
    fontSize: 10,
    color: '#8FBC8F',
    letterSpacing: 1,
    marginBottom: 4,
    opacity: 0.7,
  },
  metaValue: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },

  // Team
  teamSectionDark: {
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  teamSectionTitleDark: {
    fontSize: 24,
    color: '#E2E8F0',
    // fontFamily: 'serif',
  },
  teamDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#8FBC8F',
    opacity: 0.2,
    marginHorizontal: 16,
  },
  contributorsLabel: {
    fontSize: 10,
    color: '#8FBC8F',
    letterSpacing: 1,
    opacity: 0.6,
  },
  
  // Cards
  advisorCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(58, 74, 30, 0.5)', // #3A4A1E
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(143, 188, 143, 0.1)',
    alignItems: 'center',
    marginBottom: 20,
  },
  advisorImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
    backgroundColor: '#2F3E1B',
  },
  advisorContent: {
    flex: 1,
  },
  advisorRole: {
    fontSize: 10,
    color: '#8FBC8F',
    letterSpacing: 1,
    marginBottom: 4,
  },
  advisorName: {
    fontSize: 18,
    color: '#FFF',
    fontWeight: '600', // Using serif here if possible
    marginBottom: 4,
  },
  advisorBio: {
    fontSize: 12,
    color: '#E2E8F0',
    opacity: 0.7,
    lineHeight: 16,
  },

  devGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  leadColumn: {
    flex: 1,
  },
  othersColumn: {
    flex: 1,
    gap: 12,
  },
  leadCard: {
    backgroundColor: 'rgba(58, 74, 30, 0.3)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(143, 188, 143, 0.1)',
    height: 240,
    justifyContent: 'flex-end',
  },
  leadImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#8FBC8F',
  },
  leadContent: {},
  leadName: {
    fontSize: 18,
    color: '#FFF',
    marginBottom: 4,
    // fontFamily: 'serif',
  },
  leadRole: {
    fontSize: 10,
    color: '#8FBC8F',
    letterSpacing: 1,
  },

  memberCard: {
    backgroundColor: 'rgba(58, 74, 30, 0.3)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(143, 188, 143, 0.1)',
    justifyContent: 'center',
    height: 114, // Half of lead card + gap approx
  },
  memberIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(143, 188, 143, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  memberName: {
    fontSize: 14,
    color: '#FFF',
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 9,
    color: '#8FBC8F',
    letterSpacing: 0.5,
  },

  // Footer
  darkFooter: {
    alignItems: 'center',
    marginTop: 40,
    opacity: 0.5,
  },
  footerBrand: {
    fontSize: 16,
    color: '#8FBC8F',
    fontStyle: 'italic',
    marginBottom: 8,
    // fontFamily: 'serif',
  },
  footerCopy: {
    fontSize: 10,
    color: '#E2E8F0',
    letterSpacing: 2,
    marginBottom: 4,
  },
  footerVer: {
    fontSize: 9,
    color: '#8FBC8F',
  },
});

export default ProfileScreen;
