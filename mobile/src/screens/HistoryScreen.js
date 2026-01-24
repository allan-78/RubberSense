// ============================================
// Scan History Screen
// ============================================

import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { scanAPI, latexAPI } from '../services/api';
import theme from '../styles/theme';

const HistoryScreen = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('trees'); // 'trees' or 'latex'
  const [scans, setScans] = useState([]);
  const [latexBatches, setLatexBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'trees') {
        const response = await scanAPI.getAll();
        setScans(response.data);
      } else {
        const response = await latexAPI.getAll();
        setLatexBatches(response.data);
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
      <Image source={{ uri: item.imageURL }} style={styles.scanImage} />
      
      <View style={styles.scanInfo}>
        <View style={styles.scanHeader}>
          <View>
            <Text style={styles.scanDate}>
              {new Date(item.collectionDate).toLocaleDateString()}
            </Text>
            <Text style={styles.scanTreeName}>Batch: {item.batchID}</Text>
          </View>
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

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <MaterialIcons name="science" size={16} color={theme.colors.textLight} />
            <Text style={styles.statValue}>
              {item.productYieldEstimation?.dryRubberContent ? `${item.productYieldEstimation.dryRubberContent}% DRC` : 'N/A'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons name="opacity" size={16} color={theme.colors.textLight} />
            <Text style={styles.statValue}>
              {item.quantityEstimation?.volume ? `${item.quantityEstimation.volume}L` : 'N/A'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderScanItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.scanCard}
      onPress={() => navigation.navigate('ScanDetail', { scan: item })}
      activeOpacity={0.9}
    >
      <Image source={{ uri: item.imageURL }} style={styles.scanImage} />
      
      <View style={styles.scanInfo}>
        <View style={styles.scanHeader}>
          <View>
            <Text style={styles.scanDate}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            <Text style={styles.scanTime}>
              {new Date(item.createdAt).toLocaleTimeString()}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getHealthColor(item.tree?.healthStatus) + '15' },
            ]}
          >
            <MaterialIcons 
              name={item.tree?.healthStatus === 'healthy' ? 'check-circle' : item.tree?.healthStatus === 'diseased' ? 'error-outline' : 'warning'}
              size={16}
              color={getHealthColor(item.tree?.healthStatus)}
            />
            <Text style={[styles.statusLabel, { color: getHealthColor(item.tree?.healthStatus) }]}>
              {item.tree?.healthStatus || 'Unknown'}
            </Text>
          </View>
        </View>

        <View style={styles.treeIDContainer}>
          <MaterialIcons name="park" size={16} color={theme.colors.primary} />
          <Text style={styles.treeID}>Tree {item.tree?.treeID}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
    paddingTop: 50,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: theme.colors.primary,
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
    padding: theme.spacing.md,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  filterTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },

  listContent: {
    padding: theme.spacing.md,
  },
  scanCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  scanImage: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.md,
    marginRight: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  scanInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  scanDate: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  scanTime: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing.xs,
  },
  statusLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  treeIDContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  treeID: {
    fontSize: theme.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
  },

  // Info Rows
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

  // Quality Card
  qualityCard: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  qualityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  qualityLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: 'bold',
    color: theme.colors.surface,
  },
  qualityBadgeText: {
    fontSize: theme.fontSize.sm,
    fontWeight: 'bold',
    color: theme.colors.primary,
    textTransform: 'capitalize',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  qualityPrice: {
    fontSize: theme.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.success,
  },
});

export default HistoryScreen;
