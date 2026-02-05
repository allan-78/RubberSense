// ============================================
// Scan History Screen
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { scanAPI, latexAPI } from '../services/api';
import theme from '../styles/theme';

const HistoryScreen = ({ navigation, route }) => {
  const { initialTab } = route.params || {};
  const [activeTab, setActiveTab] = useState(initialTab || 'trees'); // 'trees' or 'latex'
  const [scans, setScans] = useState([]);
  const [latexBatches, setLatexBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [activeTab])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'trees') {
        const response = await scanAPI.getAll();
        setScans(response.data || []);
      } else {
        const response = await latexAPI.getAll();
        setLatexBatches(response.data || []);
      }
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

  const getHealthColor = (status) => {
    switch (status) {
      case 'healthy':
        return theme.colors.success;
      case 'diseased':
        return theme.colors.error;
      case 'dying':
        return theme.colors.warning;
      default:
        return theme.colors.textSecondary;
    }
  };

  const getHealthIcon = (status) => {
    switch (status) {
      case 'healthy':
        return '✅';
      case 'diseased':
        return '⚠️';
      case 'dying':
        return '❌';
      default:
        return '❓';
    }
  };

  const getGradeColor = (grade) => {
    switch (grade) {
      case 'A': return theme.colors.success;
      case 'B': return '#3B82F6';
      case 'C': return theme.colors.warning;
      case 'D': return '#F97316';
      case 'F': return theme.colors.error;
      default: return theme.colors.textSecondary;
    }
  };

  const filteredScans = activeTab === 'trees' 
    ? scans.filter((scan) => {
        if (selectedFilter === 'all') return true;
        return scan.tree?.healthStatus === selectedFilter;
      })
    : latexBatches;

  const renderLatexItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.scanCard}
      onPress={() => navigation.navigate('LatexDetail', { batch: item })}
      activeOpacity={0.9}
    >
      <View style={styles.cardImageContainer}>
        <Image source={{ uri: item.imageURL }} style={styles.scanImage} />
        <View style={styles.cardTypeIcon}>
          <MaterialIcons name="opacity" size={14} color="#FFF" />
        </View>
      </View>
      
      <View style={styles.scanInfo}>
        <View style={styles.scanHeader}>
          <View style={styles.headerTopRow}>
            <Text style={styles.scanTreeName} numberOfLines={1}>Batch: {item.batchID}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getGradeColor(item.qualityClassification?.grade) + '15' },
              ]}
            >
              <Text style={[styles.statusText, { color: getGradeColor(item.qualityClassification?.grade) }]}>
                Grade {item.qualityClassification?.grade || '?'}
              </Text>
            </View>
          </View>
          <Text style={styles.scanDate}>
            {new Date(item.collectionDate || item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <MaterialIcons name="science" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.statValue}>
              {item.productYieldEstimation?.dryRubberContent ? `${item.productYieldEstimation.dryRubberContent}%` : '--'}
            </Text>
            <Text style={styles.statLabel}>DRC</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <MaterialIcons name="water-drop" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.statValue}>
              {item.quantityEstimation?.volume ? `${item.quantityEstimation.volume}L` : '--'}
            </Text>
            <Text style={styles.statLabel}>Vol</Text>
          </View>
        </View>
      </View>
      
      <MaterialIcons name="chevron-right" size={24} color={theme.colors.border} style={styles.chevron} />
    </TouchableOpacity>
  );

  const renderScanItem = ({ item }) => {
    // Determine the icon and label for the detected part
    const detectedPart = item.treeIdentification?.detectedPart || 'whole_tree';
    let partIcon = 'park'; // Default tree icon
    let partLabel = 'Tree';

    if (detectedPart === 'trunk') {
      partIcon = 'straighten'; // Or another icon representing trunk/height
      partLabel = 'Trunk';
    } else if (detectedPart === 'leaf') {
      partIcon = 'eco'; // Leaf icon
      partLabel = 'Leaf';
    }

    return (
    <TouchableOpacity 
      style={styles.scanCard}
      onPress={() => navigation.navigate('ScanDetail', { scan: item })}
      activeOpacity={0.9}
    >
      <View style={styles.cardImageContainer}>
        <Image source={{ uri: item.imageURL }} style={styles.scanImage} />
        <View style={[styles.cardTypeIcon, { backgroundColor: theme.colors.primary }]}>
          <MaterialIcons name={partIcon} size={14} color="#FFF" />
        </View>
      </View>
      
      <View style={styles.scanInfo}>
        <View style={styles.scanHeader}>
          <View style={styles.headerTopRow}>
            <Text style={styles.scanTreeName} numberOfLines={1}>Tree {item.tree?.treeID}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getHealthColor(item.tree?.healthStatus) + '15' },
              ]}
            >
              <MaterialIcons 
                name={item.tree?.healthStatus === 'healthy' ? 'check-circle' : item.tree?.healthStatus === 'diseased' ? 'error-outline' : 'warning'}
                size={12}
                color={getHealthColor(item.tree?.healthStatus)}
              />
              <Text style={[styles.statusText, { color: getHealthColor(item.tree?.healthStatus) }]}>
                {item.tree?.healthStatus || 'Unknown'}
              </Text>
            </View>
          </View>
          <Text style={styles.scanDate}>
            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </Text>
        </View>

        <View style={styles.statsRow}>
           <Text style={styles.scanSubtitle}>
             Scanned Part: <Text style={styles.scanSubtitleBold}>{partLabel}</Text>
           </Text>
        </View>
      </View>

      <MaterialIcons name="chevron-right" size={24} color={theme.colors.border} style={styles.chevron} />
    </TouchableOpacity>
  );
};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scan History</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'trees' && styles.tabButtonActive]}
          onPress={() => setActiveTab('trees')}
        >
          <Text style={[styles.tabText, activeTab === 'trees' && styles.tabTextActive]}>Trees</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'latex' && styles.tabButtonActive]}
          onPress={() => setActiveTab('latex')}
        >
          <Text style={[styles.tabText, activeTab === 'latex' && styles.tabTextActive]}>Latex</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'trees' && (
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {['all', 'healthy', 'diseased', 'dying'].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterChip,
                  selectedFilter === filter && styles.filterChipActive,
                ]}
                onPress={() => setSelectedFilter(filter)}
              >
                <Text
                  style={[
                    styles.filterText,
                    selectedFilter === filter && styles.filterTextActive,
                  ]}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredScans}
          renderItem={activeTab === 'trees' ? renderScanItem : renderLatexItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons
                name="history"
                size={64}
                color={theme.colors.textLight}
              />
              <Text style={styles.emptyText}>No scans found</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  
  // Header
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },

  // Tabs - Segmented Control Style
  tabContainer: {
    flexDirection: 'row',
    padding: 6,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.inputBg,
    borderRadius: 16,
    marginBottom: theme.spacing.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
    shadowOpacity: 0.1,
  },
  tabText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },

  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    marginTop: 50,
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },

  // Filters
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },

  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 40,
  },
  
  // Card Styles
  scanCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    marginBottom: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
    shadowColor: '#000',
    shadowOpacity: 0.03,
  },
  cardImageContainer: {
    position: 'relative',
    marginRight: 16,
  },
  scanImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: theme.colors.inputBg,
  },
  cardTypeIcon: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary, // Default blue, overridden in component
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  
  scanInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  scanHeader: {
    marginBottom: 6,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  scanTreeName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
    marginRight: 8,
  },
  scanDate: {
    fontSize: 12,
    color: theme.colors.textLight,
    fontWeight: '500',
  },
  
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Stats / Details Row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textLight,
    marginLeft: 2,
  },
  statDivider: {
    width: 1,
    height: 12,
    backgroundColor: theme.colors.border,
    marginHorizontal: 12,
  },
  
  scanSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  scanSubtitleBold: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  
  chevron: {
    marginLeft: 8,
    opacity: 0.5,
  },

  // Info Rows (kept for legacy support if needed, though mostly unused now)
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  infoValue: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
});

export default HistoryScreen;
