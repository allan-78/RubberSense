// ============================================
// 📱 Scan Detail Screen
// ============================================

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../styles/theme';

const { width } = Dimensions.get('window');

const ScanDetailScreen = ({ route, navigation }) => {
  const { scan } = route.params;

  const getHealthColor = (status) => {
    switch (status) {
      case 'healthy': return theme.colors.success;
      case 'diseased': return theme.colors.error;
      case 'dying': return theme.colors.warning;
      default: return theme.colors.textSecondary;
    }
  };

  const InfoCard = ({ title, icon, children }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <LinearGradient
          colors={theme.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardIconBg}
        >
          <MaterialIcons name={icon} size={20} color="#FFF" />
        </LinearGradient>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={styles.cardContent}>
        {children}
      </View>
    </View>
  );

  const DetailRow = ({ label, value, isLast }) => (
    <View style={[styles.detailRow, !isLast && styles.detailBorder]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || 'N/A'}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Header Image */}
        <View style={styles.imageContainer}>
          <Image source={{ uri: scan.imageURL }} style={styles.image} />
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.3)']}
            style={styles.imageOverlay}
          />
          
          {/* Back Button */}
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>

          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: getHealthColor(scan.tree?.healthStatus) }]}>
            <MaterialIcons 
              name={scan.tree?.healthStatus === 'healthy' ? 'check-circle' : 'warning'} 
              size={16} 
              color="#FFF" 
            />
            <Text style={styles.statusText}>
              {scan.tree?.healthStatus?.toUpperCase() || 'UNKNOWN'}
            </Text>
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.treeTitle}>Tree {scan.tree?.treeID}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <MaterialIcons 
                name={scan.treeIdentification?.detectedPart === 'leaf' ? 'eco' : (scan.treeIdentification?.detectedPart === 'trunk' ? 'straighten' : 'park')} 
                size={16} 
                color="#DDD" 
                style={{ marginRight: 6 }}
              />
              <Text style={{ color: '#DDD', fontSize: 14, fontWeight: '500' }}>
                 {scan.treeIdentification?.detectedPart ? scan.treeIdentification.detectedPart.toUpperCase().replace('_', ' ') : "TREE SCAN"}
              </Text>
            </View>
            <Text style={styles.scanDate}>
              {new Date(scan.createdAt).toLocaleDateString()} • {new Date(scan.createdAt).toLocaleTimeString()}
            </Text>
          </View>
        </View>

        <View style={styles.contentContainer}>
          
          {/* 1. Identification */}
          <InfoCard title="Tree Identification" icon="search">
            <DetailRow 
              label="Species" 
              value={scan.treeIdentification?.isRubberTree ? "Hevea brasiliensis" : "Unknown"} 
            />
            <DetailRow 
              label="Detected Part" 
              value={scan.treeIdentification?.detectedPart ? scan.treeIdentification.detectedPart.toUpperCase().replace('_', ' ') : "WHOLE TREE"} 
            />
            <DetailRow 
              label="Maturity" 
              value={scan.treeIdentification?.maturity ? scan.treeIdentification.maturity.charAt(0).toUpperCase() + scan.treeIdentification.maturity.slice(1) : "Unknown"} 
            />
            <DetailRow 
              label="Confidence" 
              value={`${scan.treeIdentification?.confidence}%`} 
              isLast
            />
          </InfoCard>

          {/* 2. Leaf Analysis (Conditional) */}
          {(scan.treeIdentification?.detectedPart === 'leaf' || scan.leafAnalysis) && (
            <InfoCard title="Leaf Analysis" icon="eco">
              <DetailRow 
                label="Health Status" 
                value={scan.leafAnalysis?.healthStatus?.toUpperCase()} 
              />
              <DetailRow 
                label="Color" 
                value={scan.leafAnalysis?.color} 
              />
              <DetailRow 
                label="Spot Count" 
                value={scan.leafAnalysis?.spotCount?.toString()} 
              />
              <DetailRow 
                label="Diseases" 
                value={scan.leafAnalysis?.diseases?.length > 0 ? scan.leafAnalysis.diseases.join(', ') : 'None'} 
                isLast
              />
            </InfoCard>
          )}

          {/* 3. Trunk Analysis (Conditional) */}
          {(scan.treeIdentification?.detectedPart === 'trunk' || scan.treeIdentification?.detectedPart === 'whole_tree' || !scan.treeIdentification?.detectedPart) && (
            <InfoCard title="Trunk Analysis" icon="straighten">
              <DetailRow label="Girth" value={`${scan.trunkAnalysis?.girth} cm`} />
              <DetailRow label="Diameter" value={`${scan.trunkAnalysis?.diameter} cm`} />
              <DetailRow label="Bark Texture" value={scan.trunkAnalysis?.texture} />
              <DetailRow label="Bark Color" value={scan.trunkAnalysis?.color} isLast />
            </InfoCard>
          )}

          {/* 3. Disease Detection */}
          <InfoCard title="Disease Detection" icon="healing">
            {scan.diseaseDetection && scan.diseaseDetection.length > 0 ? (
              scan.diseaseDetection.map((disease, index) => (
                <View key={index} style={styles.diseaseItem}>
                  <View style={styles.diseaseHeader}>
                    <Text style={styles.diseaseName}>{disease.name}</Text>
                    <View style={[styles.severityBadge, { 
                      backgroundColor: disease.severity === 'high' ? theme.colors.error : 
                                     disease.severity === 'medium' ? theme.colors.warning : theme.colors.success 
                    }]}>
                      <Text style={styles.severityText}>{disease.severity}</Text>
                    </View>
                  </View>
                  <Text style={styles.diseaseRecTitle}>Recommendation:</Text>
                  <Text style={styles.diseaseRec}>{disease.recommendation}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noDataText}>No diseases detected.</Text>
            )}
          </InfoCard>

          {/* 4. Tappability */}
          <InfoCard title="Tappability Assessment" icon="fact-check">
             <View style={styles.scoreContainer}>
                <Text style={styles.scoreLabel}>Tappability Score</Text>
                <View style={styles.scoreCircle}>
                  <Text style={[styles.scoreValue, { 
                    color: scan.tappabilityAssessment?.isTappable ? theme.colors.success : theme.colors.error 
                  }]}>
                    {scan.tappabilityAssessment?.score}
                  </Text>
                  <Text style={styles.scoreMax}>/100</Text>
                </View>
             </View>
             <Text style={styles.reasonText}>{scan.tappabilityAssessment?.reason}</Text>
          </InfoCard>

          {/* 5. Latex Analysis (LIQUID SCANS ONLY) */}
          {scan.scanType === 'latex' && (
            <>
              <InfoCard title="Latex Analysis" icon="opacity">
                <DetailRow label="Quality Grade" value={scan.latexQualityPrediction?.quality?.toUpperCase()} />
                <DetailRow label="Dry Rubber Content (DRC)" value={`${scan.latexQualityPrediction?.dryRubberContent}%`} />
                <DetailRow label="Est. Market Price" value={`₱${scan.latexQualityPrediction?.estimatedPrice || 0}/kg`} />
                
                {/* Color Analysis */}
                <DetailRow label="Color" value={scan.latexColorAnalysis?.primaryColor || 'Unknown'} />
                
                {/* Contamination */}
                <DetailRow 
                  label="Water Contamination" 
                  value={scan.contaminationDetection?.hasWater ? "Detected" : "None"} 
                />
                <DetailRow 
                  label="Contamination Level" 
                  value={scan.contaminationDetection?.contaminationLevel?.toUpperCase() || 'NONE'} 
                />
                
                {/* Quantity */}
                <DetailRow 
                  label="Est. Volume" 
                  value={scan.quantityEstimation?.volume ? `${scan.quantityEstimation.volume} L` : "N/A"} 
                />
                
                {/* Yield & Product Recommendation */}
                <DetailRow 
                  label="Est. Yield" 
                  value={scan.productYieldEstimation?.estimatedYield ? `${scan.productYieldEstimation.estimatedYield} kg` : "N/A"} 
                />
                <DetailRow 
                  label="Rec. Product" 
                  value={scan.productYieldEstimation?.productType || "N/A"} 
                  isLast
                />
              </InfoCard>
            </>
          )}

          {/* 5b. Latex Prediction (TREE SCANS ONLY) */}
          {scan.scanType !== 'latex' && (scan.latexQualityPrediction || scan.latexFlowIntensity) && (
            <InfoCard title="Latex Prediction (Tree-based)" icon="opacity">
              <DetailRow label="Predicted Quality" value={scan.latexQualityPrediction?.quality?.toUpperCase()} />
              <DetailRow label="Predicted DRC" value={scan.latexQualityPrediction?.dryRubberContent ? `${scan.latexQualityPrediction.dryRubberContent}%` : 'N/A'} />
              <DetailRow 
                 label="Flow Intensity" 
                 value={scan.latexFlowIntensity ? scan.latexFlowIntensity.toUpperCase().replace('_', ' ') : 'N/A'} 
                 isLast
              />
            </InfoCard>
          )}

           {/* 6. Productivity */}
           {scan.productivityRecommendation && (
             <InfoCard title="Productivity & Recommendations" icon="trending-up">
              <DetailRow label="Status" value={scan.productivityRecommendation?.status?.toUpperCase()} />
              <View style={{ marginTop: 10 }}>
                <Text style={styles.detailLabel}>Suggestions:</Text>
                {scan.productivityRecommendation?.suggestions?.map((suggestion, index) => (
                  <View key={index} style={styles.bulletPoint}>
                    <MaterialIcons name="chevron-right" size={16} color={theme.colors.primary} />
                    <Text style={styles.bulletText}>{suggestion}</Text>
                  </View>
                ))}
              </View>
            </InfoCard>
           )}

        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  imageContainer: {
    height: 300,
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  headerInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  treeTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  scanDate: {
    color: '#E2E8F0',
    fontSize: 14,
    marginTop: 4,
  },
  contentContainer: {
    padding: 20,
    marginTop: -20,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    marginBottom: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  cardContent: {
    paddingLeft: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '600',
  },
  diseaseItem: {
    backgroundColor: theme.colors.surfaceHighlight,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  diseaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  diseaseName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.error,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  diseaseRecTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  diseaseRec: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  scoreContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreLabel: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
  scoreCircle: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  scoreMax: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 2,
  },
  reasonText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  bulletPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
  },
  bulletText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  noDataText: {
    color: theme.colors.textLight,
    fontStyle: 'italic',
  }
});

export default ScanDetailScreen;