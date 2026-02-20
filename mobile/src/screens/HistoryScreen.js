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
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { scanAPI, latexAPI } from '../services/api';
import { useAppRefresh } from '../context/AppRefreshContext';
import theme from '../styles/theme';

const HistoryScreen = ({ navigation, route }) => {
  const { initialTab, newScan, refreshTimestamp } = route.params || {};
  const { refreshTick } = useAppRefresh();
  const [activeTab, setActiveTab] = useState(initialTab || 'trees'); // 'trees' or 'latex'
  const [scans, setScans] = useState([]);
  const [latexBatches, setLatexBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filter States
  const [filterType, setFilterType] = useState('all'); // 'all', 'trunk', 'leaf'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'healthy', 'diseased', 'dying'
  
  // Latex Filter States
  const [filterGrade, setFilterGrade] = useState('all'); // 'all', 'A', 'B', 'C', 'D', 'F'
  const [filterContamination, setFilterContamination] = useState('all'); // 'all', 'none', 'low', 'medium', 'high'

  // Handle new scan from CameraScreen immediately
  useEffect(() => {
    if (newScan && refreshTimestamp) {
        if (activeTab === 'trees' && (!newScan.scanType || newScan.scanType === 'tree')) {
             setScans(prev => {
                 // Prevent duplicates
                 if (prev.find(s => s._id === newScan._id)) return prev;
                 return [newScan, ...prev];
             });
             // Ensure loading is false so we see the result immediately
             setLoading(false);
        } else if (activeTab === 'latex' && (newScan.scanType === 'latex' || newScan.batchID)) {
             setLatexBatches(prev => {
                 if (prev.find(b => b._id === newScan._id)) return prev;
                 return [newScan, ...prev];
             });
             setLoading(false);
        }
    }
    
    // Trigger background refresh to ensure backend sync
    if (refreshTimestamp) {
        console.log('🔄 Triggering background refresh due to new scan...');
        // Small delay to allow backend indexing if needed, though usually immediate
        setTimeout(() => {
            loadData();
        }, 500);
    }
  }, [newScan, refreshTimestamp, activeTab]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useFocusEffect(
    useCallback(() => {
      // If we have a new scan pending (via optimistic update), 
      // skip this immediate load and let the useEffect handle the delayed refresh.
      if (route.params?.newScan && route.params?.refreshTimestamp) {
          const timeDiff = Date.now() - route.params.refreshTimestamp;
          if (timeDiff < 2000) {
              console.log('⏳ Skipping focus load due to pending new scan...');
              return;
          }
      }
      loadData();
    }, [activeTab, route.params])
  );

  const loadData = async () => {
    // Don't set loading(true) here to allow silent background refresh
    // We only want spinner on explicit actions (tab change, pull refresh)
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

  useEffect(() => {
    if (refreshTick === 0) return;
    loadData();
  }, [refreshTick, activeTab]);

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

  const aiDiagnosisSaysHealthy = (aiDiagnosis) => {
    const toText = (value) => {
      if (!value) return '';
      if (Array.isArray(value)) return value.map(toText).join(' ');
      if (typeof value === 'object') return Object.values(value).map(toText).join(' ');
      return String(value);
    };
    const text = toText(aiDiagnosis).toLowerCase();
    if (!text) return false;

    if (
      /no\s+(signs?|evidence)\s+of\s+(disease|infection)|no disease detected|disease[-\s]?free|appears healthy|tree is healthy/.test(text)
    ) {
      return true;
    }

    const hasHealthy = /\bhealthy\b/.test(text);
    const hasDisease = /\b(diseased?|infection|infected|blight|mildew|rot|canker|fungal?|lesion|necrosis|rust|pustule)\b/.test(text);
    return hasHealthy && !hasDisease;
  };

  const getScanHealthStatus = (scan) => {
    const primary = scan.diseaseDetection?.[0];
    if (primary) {
      const name = String(primary.name || '').toLowerCase();
      const severity = String(primary.severity || '').toLowerCase();
      if (aiDiagnosisSaysHealthy(primary.ai_diagnosis) || severity === 'none' || /healthy|no disease/.test(name)) {
        return 'healthy';
      }
      if (['low', 'moderate', 'medium', 'high', 'critical'].includes(severity)) {
        return 'diseased';
      }
      if (/disease|blight|spot|mildew|rot|canker|mold|infect|lesion|necrosis|rust|pustule/.test(name)) {
        return 'diseased';
      }
    }

    if (scan.treeIdentification?.detectedPart === 'leaf' && scan.leafAnalysis?.healthStatus) {
      return scan.leafAnalysis.healthStatus;
    }
    if (scan.treeIdentification?.detectedPart === 'trunk' && scan.trunkAnalysis?.healthStatus) {
      return scan.trunkAnalysis.healthStatus;
    }
    return scan.tree?.healthStatus || 'unknown';
  };

  const filteredScans = activeTab === 'trees' 
    ? scans.filter((scan) => {
        // 1. Filter by Type
        const scanPart = scan.treeIdentification?.detectedPart || 'whole_tree';
        // Map 'whole_tree' to 'trunk' context if needed, or keep separate. 
        // Assuming 'trunk' and 'leaf' are the main ones.
        // If filterType is 'trunk', we allow 'trunk' and 'whole_tree' (legacy) or just 'trunk'?
        // Let's be strict: 'trunk' matches 'trunk', 'leaf' matches 'leaf'.
        
        const typeMatch = 
          filterType === 'all' ? true :
          filterType === 'trunk' ? scanPart === 'trunk' :
          filterType === 'leaf' ? scanPart === 'leaf' : true;

        if (!typeMatch) return false;

        // 2. Filter by Status
        if (filterStatus === 'all') return true;
        const healthStatus = getScanHealthStatus(scan);
        return healthStatus === filterStatus;
      })
    : latexBatches.filter((batch) => {
        // 1. Filter by Grade
        if (filterGrade !== 'all') {
            const grade = batch.qualityClassification?.grade;
            if (grade !== filterGrade) return false;
        }

        // 2. Filter by Contamination
        if (filterContamination !== 'all') {
            const contamination = batch.contaminationDetection?.contaminationLevel;
            // 'none' might be stored as 'none' or null/undefined if clean
            if (filterContamination === 'none' && !contamination) return true; 
            if (contamination !== filterContamination) return false;
        }
        
        return true;
    });

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
                { backgroundColor: getHealthColor(getScanHealthStatus(item)) + '15' },
              ]}
            >
              <MaterialIcons 
                name={getScanHealthStatus(item) === 'healthy' ? 'check-circle' : getScanHealthStatus(item) === 'diseased' ? 'error-outline' : 'warning'}
                size={12}
                color={getHealthColor(getScanHealthStatus(item))}
              />
              <Text style={[styles.statusText, { color: getHealthColor(getScanHealthStatus(item)) }]}>
                {getScanHealthStatus(item) || 'Unknown'}
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
          onPress={() => {
             if (activeTab !== 'trees') setLoading(true);
             setActiveTab('trees');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'trees' && styles.tabTextActive]}>Trees</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'latex' && styles.tabButtonActive]}
          onPress={() => {
             if (activeTab !== 'latex') setLoading(true);
             setActiveTab('latex');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'latex' && styles.tabTextActive]}>Latex</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'trees' ? (
        <View style={styles.filtersWrapper}>
          {/* Type Filters */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Type:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              {[
                { id: 'all', label: 'All', icon: 'dashboard', IconComponent: MaterialIcons },
                { id: 'trunk', label: 'Trunk', icon: 'tree', IconComponent: MaterialCommunityIcons },
                { id: 'leaf', label: 'Leaf', icon: 'leaf', IconComponent: MaterialCommunityIcons },
              ].map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.typeFilterChip,
                    filterType === item.id && styles.typeFilterChipActive,
                  ]}
                  onPress={() => setFilterType(item.id)}
                >
                  <item.IconComponent 
                    name={item.icon} 
                    size={18} 
                    color={filterType === item.id ? '#FFF' : theme.colors.textSecondary} 
                  />
                  <Text
                    style={[
                      styles.typeFilterText,
                      filterType === item.id && styles.typeFilterTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Status Filters */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Status:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              {[
                  { id: 'all', label: 'All' },
                  { id: 'healthy', label: 'Healthy' },
                  { id: 'diseased', label: 'Diseased' },
                  { id: 'dying', label: 'Dying' },
              ].map((filter) => (
                <TouchableOpacity
                  key={filter.id}
                  style={[
                    styles.statusFilterChip,
                    filterStatus === filter.id && styles.statusFilterChipActive,
                  ]}
                  onPress={() => setFilterStatus(filter.id)}
                >
                  <Text
                    style={[
                      styles.statusFilterText,
                      filterStatus === filter.id && styles.statusFilterTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : (
        <View style={styles.filtersWrapper}>
          {/* Grade Filters */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Grade:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              {[
                { id: 'all', label: 'All' },
                { id: 'A', label: 'Grade A' },
                { id: 'B', label: 'Grade B' },
                { id: 'C', label: 'Grade C' },
                { id: 'D', label: 'Grade D' },
                { id: 'F', label: 'Grade F' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.statusFilterChip,
                    filterGrade === item.id && styles.statusFilterChipActive,
                  ]}
                  onPress={() => setFilterGrade(item.id)}
                >
                  <Text
                    style={[
                      styles.statusFilterText,
                      filterGrade === item.id && styles.statusFilterTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Contamination Filters */}
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Dirt:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              {[
                  { id: 'all', label: 'All' },
                  { id: 'none', label: 'Clean' },
                  { id: 'low', label: 'Low' },
                  { id: 'medium', label: 'Medium' },
                  { id: 'high', label: 'High' },
              ].map((filter) => (
                <TouchableOpacity
                  key={filter.id}
                  style={[
                    styles.statusFilterChip,
                    filterContamination === filter.id && styles.statusFilterChipActive,
                  ]}
                  onPress={() => setFilterContamination(filter.id)}
                >
                  <Text
                    style={[
                      styles.statusFilterText,
                      filterContamination === filter.id && styles.statusFilterTextActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
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
  filtersWrapper: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    gap: 12,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginRight: 8,
    minWidth: 50,
  },
  filterScrollContent: {
    paddingRight: 16,
    gap: 8,
  },
  
  // Type Chips (Icons)
  typeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  typeFilterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  typeFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  typeFilterTextActive: {
    color: '#FFF',
  },

  // Status Chips (Text only, smaller)
  statusFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusFilterChipActive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primary,
  },
  statusFilterText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  statusFilterTextActive: {
    color: theme.colors.primary,
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
