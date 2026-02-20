import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Image,
  RefreshControl,
  StatusBar,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../styles/theme';
import { useNotification } from '../context/NotificationContext';
import { format, isToday, isYesterday, formatDistanceToNowStrict } from 'date-fns';

const NotificationScreen = () => {
  const navigation = useNavigation();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    refreshNotifications,
    lastSyncedAt,
  } = useNotification();
  const [activeTab, setActiveTab] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const TABS = ['All', 'Market', 'Weather', 'System'];

  const filteredNotifications = useMemo(() => {
    let filtered = notifications;
    if (activeTab === 'Market') filtered = notifications.filter(n => n.type === 'market');
    else if (activeTab === 'Weather') filtered = notifications.filter(n => n.type === 'alert' || n.type === 'info');
    else if (activeTab === 'System') filtered = notifications.filter(n => n.type === 'system' || n.type === 'social');
    
    // Sort by date desc
    return filtered.sort((a, b) => new Date(b.time) - new Date(a.time));
  }, [notifications, activeTab]);

  const sections = useMemo(() => {
    const groups = filteredNotifications.reduce((acc, notification) => {
      const date = new Date(notification.time);
      let title = format(date, 'MMMM d, yyyy');
      
      if (isToday(date)) title = 'Today';
      else if (isYesterday(date)) title = 'Yesterday';

      if (!acc[title]) {
        acc[title] = [];
      }
      acc[title].push(notification);
      return acc;
    }, {});

    return Object.keys(groups).map(title => ({
      title,
      data: groups[title]
    }));
  }, [filteredNotifications]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshNotifications({ silent: true });
    } finally {
      setRefreshing(false);
    }
  };

  const getIcon = (type, iconName) => {
    const size = 22;
    if (type === 'market') return <Feather name={iconName || 'trending-up'} size={size} color="#fff" />;
    if (type === 'alert') return <Ionicons name={iconName || 'warning'} size={size} color="#fff" />;
    if (type === 'system') return <MaterialIcons name={iconName || 'info'} size={size} color="#fff" />;
    if (type === 'social') return <MaterialIcons name={iconName || 'forum'} size={size} color="#fff" />;
    if (type === 'info') return <Feather name={iconName || 'sun'} size={size} color="#fff" />;
    return <Ionicons name="notifications" size={size} color="#fff" />;
  };

  const getIconBg = (type, color) => {
      if (color) return color;
      if (type === 'market') return '#10B981';
      if (type === 'alert') return '#EF4444';
      if (type === 'system') return '#3B82F6';
      if (type === 'social') return '#8B5CF6';
      return theme.colors.primary;
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.card, !item.read && styles.unreadCard]}
      onPress={() => markAsRead(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconBox, { backgroundColor: getIconBg(item.type, item.color) }]}>
        {getIcon(item.type, item.icon)}
      </View>
      
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.title, !item.read && styles.unreadTitle]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.time}>
            {format(new Date(item.time), 'h:mm a')}
          </Text>
        </View>
        
        <Text style={[styles.message, !item.read && styles.unreadMessage]} numberOfLines={3}>
          {item.message}
        </Text>
      </View>

      {!item.read && <View style={styles.dot} />}
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section: { title } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {lastSyncedAt ? (
              <Text style={styles.syncText}>
                Updated {formatDistanceToNowStrict(new Date(lastSyncedAt), { addSuffix: true })}
              </Text>
            ) : null}
          </View>
          <View style={styles.actions}>
             {notifications.some(n => !n.read) && (
                <TouchableOpacity onPress={markAllAsRead} style={styles.actionBtn}>
                    <Ionicons name="checkmark-done" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
             )}
             <TouchableOpacity 
                onPress={() => {
                  Alert.alert(
                    'Clear All',
                    'Delete all notifications?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', onPress: clearAll, style: 'destructive' }
                    ]
                  );
                }} 
                style={[styles.actionBtn, { marginLeft: 8 }]}
             >
                <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
             </TouchableOpacity>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabsWrapper}>
          <View style={styles.tabsContainer}>
            {TABS.map((tab) => (
                <TouchableOpacity
                    key={tab}
                    style={[styles.tab, activeTab === tab && styles.activeTab]}
                    onPress={() => setActiveTab(tab)}
                >
                    <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                        {tab}
                    </Text>
                </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBg}>
                <Ionicons name="notifications-off-outline" size={40} color="#CBD5E1" />
            </View>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'All' 
                ? "You're all caught up! Check back later." 
                : `No ${activeTab.toLowerCase()} notifications found.`}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight + 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  headerTitleBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncText: {
    marginTop: 2,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
  },
  actions: {
    flexDirection: 'row',
  },
  actionBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
  },
  tabsWrapper: {
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unreadCard: {
    backgroundColor: '#fff',
    borderColor: theme.colors.primary + '30',
    shadowOpacity: 0.08,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  content: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
    marginRight: 8,
  },
  unreadTitle: {
    fontWeight: '700',
    color: '#0F172A',
  },
  time: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  message: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
  },
  unreadMessage: {
    color: '#334155',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    position: 'absolute',
    top: 16,
    right: 16,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default NotificationScreen;
