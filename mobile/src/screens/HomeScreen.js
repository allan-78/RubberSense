// ============================================
// 🏠 Enhanced Home Screen
// ============================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ImageBackground
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { treeAPI, scanAPI, latexAPI } from '../services/api';
import theme from '../styles/theme';

const HomeScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalTrees: 0,
    scansToday: 0,
    healthyTrees: 0,
    alerts: 0,
    rubberTrees: 0,
    estimatedLatexYield: 0,
  });
  const [treeStats, setTreeStats] = useState(null);
  const [recentScans, setRecentScans] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [treesRes, scansRes, treeStatsRes] = await Promise.all([
        treeAPI.getAll(),
        scanAPI.getAll(),
        treeAPI.getStats(),
      ]);

      const trees = treesRes.data || [];
      const scans = scansRes.data || [];

      // Calculate today's scans
      const today = new Date().toDateString();
      const scansToday = scans.filter(
        (scan) => new Date(scan.createdAt).toDateString() === today
      ).length;

      // Calculate rubber trees
      const rubberTrees = trees.filter((tree) => tree.species === 'Rubber' || tree.isRubberTree).length;

      // Estimate latex yield (assume 50-100kg per tree)
      const estimatedLatexYield = rubberTrees * 75;

      setStats({
        totalTrees: trees.length,
        scansToday,
        healthyTrees: treeStatsRes.data?.healthyTrees || 0,
        alerts: treeStatsRes.data?.diseasedTrees || 0,
        rubberTrees,
        estimatedLatexYield,
      });

      setTreeStats(treeStatsRes.data);
      setRecentScans(scans.slice(0, 5));
    } catch (error) {
      console.log('Load data error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor="#fff" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Gradient */}
        <LinearGradient
          colors={theme.gradients.primary}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.greetingSubtitle}>Welcome back,</Text>
              <Text style={styles.greeting}>{user?.name}</Text>
            </View>
            <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('Profile')}>
              <ImageBackground
                source={{ uri: user?.profileImage || 'https://ui-avatars.com/api/?name=' + user?.name }}
                style={styles.profileImage}
                imageStyle={{ borderRadius: 20 }}
              >
                {!user?.profileImage && <Text style={styles.avatarText}>{user?.name?.charAt(0)}</Text>}
              </ImageBackground>
            </TouchableOpacity>
          </View>
          
          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={24} color={theme.colors.primary} />
            <Text style={styles.searchPlaceholder}>Search trees, scans...</Text>
          </View>
        </LinearGradient>

        <View style={styles.contentContainer}>
          {/* Stats Cards Row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={[styles.statIconBg, { backgroundColor: '#E0F2F1' }]}>
                <Ionicons name="leaf" size={20} color={theme.colors.primary} />
              </View>
              <Text style={styles.statNumber}>{stats.totalTrees}</Text>
              <Text style={styles.statLabel}>Total Trees</Text>
            </View>
            
            <View style={styles.statCard}>
              <View style={[styles.statIconBg, { backgroundColor: '#FFF3E0' }]}>
                <MaterialIcons name="warning" size={20} color={theme.colors.warning} />
              </View>
              <Text style={styles.statNumber}>{stats.alerts}</Text>
              <Text style={styles.statLabel}>Alerts</Text>
            </View>
            
            <View style={styles.statCard}>
              <View style={[styles.statIconBg, { backgroundColor: '#E8F5E9' }]}>
                <MaterialIcons name="check-circle" size={20} color={theme.colors.success} />
              </View>
              <Text style={styles.statNumber}>{stats.healthyTrees}</Text>
              <Text style={styles.statLabel}>Healthy</Text>
            </View>
          </View>

          {/* Rubber Trees & Latex Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rubber Yield Estimate</Text>
            <LinearGradient
              colors={['#FFF9C4', '#FFF59D']}
              style={styles.latexCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.latexInfo}>
                <Text style={styles.latexLabel}>Estimated Annual Yield</Text>
                <Text style={styles.latexValue}>{stats.estimatedLatexYield} kg</Text>
                <Text style={styles.latexSubtext}>From {stats.rubberTrees} active rubber trees</Text>
              </View>
              <MaterialIcons name="opacity" size={48} color="#FBC02D" style={styles.latexIcon} />
            </LinearGradient>
          </View>

          {/* Health Overview */}
          {treeStats && treeStats.totalTrees > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Orchard Health</Text>
                <View style={styles.healthBadge}>
                  <Text style={[styles.healthBadgeText, { color: treeStats.healthPercentage > 75 ? theme.colors.success : theme.colors.warning }]}>
                    {treeStats.healthPercentage > 75 ? 'Excellent' : 'Fair'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.healthCard}>
                <View style={styles.healthRow}>
                  <Text style={styles.healthPercentage}>{treeStats.healthPercentage}%</Text>
                  <Text style={styles.healthText}>of your trees are healthy</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <LinearGradient
                    colors={theme.gradients.success}
                    style={[styles.progressBarFill, { width: `${treeStats.healthPercentage}%` }]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Recent Scans */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity onPress={() => navigation.navigate('History')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            
            {recentScans.length > 0 ? (
              recentScans.map((scan) => (
                <TouchableOpacity 
                  key={scan._id} 
                  style={styles.scanItem}
                  onPress={() => navigation.navigate('History')}
                >
                  <View style={[
                    styles.scanIcon, 
                    { backgroundColor: scan.tree?.healthStatus === 'healthy' ? '#E8F5E9' : '#FFEBEE' }
                  ]}>
                    <MaterialIcons 
                      name={scan.tree?.healthStatus === 'healthy' ? 'check' : 'priority-high'} 
                      size={20} 
                      color={scan.tree?.healthStatus === 'healthy' ? theme.colors.success : theme.colors.error} 
                    />
                  </View>
                  <View style={styles.scanInfo}>
                    <Text style={styles.scanTitle}>{scan.tree?.treeID || 'Unknown Tree'}</Text>
                    <Text style={styles.scanDate}>{new Date(scan.createdAt).toLocaleDateString()} • {new Date(scan.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color={theme.colors.textLight} />
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>No recent scans</Text>
            )}
          </View>
        </View>
        
        {/* Bottom padding for FAB */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fabContainer}
        onPress={() => navigation.navigate('Camera')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={theme.gradients.primary}
          style={styles.fab}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <MaterialIcons name="qr-code-scanner" size={32} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
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
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  
  // Header
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 60,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...theme.shadows.md,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  greetingSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 2,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.full,
    ...theme.shadows.sm,
  },
  searchPlaceholder: {
    marginLeft: theme.spacing.sm,
    color: theme.colors.textLight,
    fontSize: theme.fontSize.md,
  },
  
  contentContainer: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: -20, // Overlap header
  },
  
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xl,
  },
  statCard: {
    width: '31%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  
  // Section
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  seeAllText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  
  // Latex Card
  latexCard: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...theme.shadows.sm,
  },
  latexInfo: {
    flex: 1,
  },
  latexLabel: {
    fontSize: theme.fontSize.sm,
    color: '#F9A825', // Dark Yellow
    fontWeight: '600',
    marginBottom: 4,
  },
  latexValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F57F17', // Darker Yellow/Orange
    marginBottom: 4,
  },
  latexSubtext: {
    fontSize: 12,
    color: '#FBC02D',
  },
  latexIcon: {
    opacity: 0.8,
  },
  
  // Health Card
  healthCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing.md,
  },
  healthPercentage: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  healthText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  healthBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: 12,
  },
  healthBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Scan Items
  scanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  scanIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  scanInfo: {
    flex: 1,
  },
  scanTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  scanDate: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textLight,
    padding: theme.spacing.lg,
  },
  
  // FAB
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    ...theme.shadows.glow,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default HomeScreen;
