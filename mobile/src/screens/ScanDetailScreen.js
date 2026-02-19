// ============================================
// 📱 Scan Detail Screen
// ============================================

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator
} from 'react-native';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../styles/theme';
import { scanAPI } from '../services/api';

const { width } = Dimensions.get('window');

const ScanDetailScreen = ({ route, navigation }) => {
  const [currentScan, setCurrentScan] = useState(route.params.scan);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  
  // Use currentScan for rendering to support updates
  const scan = currentScan;

  const handleReanalyze = async () => {
    if (!currentScan?._id) {
        Alert.alert("Error", "Invalid scan ID. Cannot re-analyze.");
        return;
    }

    try {
        console.log("🔄 Requesting re-analysis for scan:", currentScan._id);
        setIsReanalyzing(true);
        const res = await scanAPI.reanalyze(currentScan._id);
        if (res.success && res.data) {
            setCurrentScan(res.data);
            Alert.alert("Success", "Scan re-analyzed successfully with latest AI models.");
        }
    } catch (error) {
        console.error("❌ Re-analysis failed:", error);
        const errorMessage = error.error || error.message || "Failed to re-analyze scan";
        Alert.alert("Error", errorMessage);
    } finally {
        setIsReanalyzing(false);
    }
  };

  const renderContent = (val) => {
    if (!val) return '';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') {
        return Object.entries(val).map(([k, v]) => {
            const vStr = Array.isArray(v) ? v.join(', ') : String(v);
            return `${k.charAt(0).toUpperCase() + k.slice(1)}: ${vStr}`;
        }).join('\n');
    }
    return String(val);
  };

  const getHealthColor = (status) => {
    switch (status) {
      case 'healthy': return theme.colors.success;
      case 'diseased': return theme.colors.error;
      case 'dying': return theme.colors.warning;
      default: return theme.colors.textSecondary;
    }
  };

  const getScanHealthStatus = (scan) => {
    if (scan.treeIdentification?.detectedPart === 'leaf' && scan.leafAnalysis?.healthStatus) {
      return scan.leafAnalysis.healthStatus;
    }
    if (scan.treeIdentification?.detectedPart === 'trunk' && scan.trunkAnalysis?.healthStatus) {
      return scan.trunkAnalysis.healthStatus;
    }
    return scan.tree?.healthStatus || 'unknown';
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
          <View style={[styles.statusBadge, { backgroundColor: getHealthColor(getScanHealthStatus(scan)) }]}>
            <MaterialIcons 
              name={getScanHealthStatus(scan) === 'healthy' ? 'check-circle' : 'warning'} 
              size={16} 
              color="#FFF" 
            />
            <Text style={styles.statusText}>
              {getScanHealthStatus(scan)?.toUpperCase() || 'UNKNOWN'}
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
          
          {/* AI Re-analysis & Insights */}
          <View style={{ marginBottom: 20 }}>
             <TouchableOpacity 
                style={styles.reanalyzeButton} 
                onPress={handleReanalyze}
                disabled={isReanalyzing}
             >
                {isReanalyzing ? (
                    <ActivityIndicator color="#FFF" size="small" />
                ) : (
                    <>
                        <MaterialIcons name="refresh" size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={styles.reanalyzeText}>Re-analyze with AI</Text>
                    </>
                )}
             </TouchableOpacity>
          </View>

          {/* AI Insights Card */}
          {scan.aiInsights && (
             <InfoCard title="AI Prompt Recommendations" icon="lightbulb">
                {scan.aiInsights.promptRecommendations?.length > 0 && (
                    <>
                        <Text style={[styles.detailLabel, { marginBottom: 8 }]}>Suggested Questions:</Text>
                        {scan.aiInsights.promptRecommendations.map((prompt, index) => (
                            <TouchableOpacity 
                                key={index} 
                                style={styles.promptChip}
                                onPress={() => navigation.navigate('Chatbot', { initialPrompt: prompt, autoSend: true })}
                            >
                                <MaterialIcons name="chat-bubble-outline" size={16} color={theme.colors.primary} style={{ marginRight: 6 }} />
                                <Text style={styles.promptText}>{prompt}</Text>
                            </TouchableOpacity>
                        ))}
                    </>
                )}
                
                {scan.aiInsights.suggestions?.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                        <Text style={[styles.detailLabel, { marginBottom: 8 }]}>AI Suggestions:</Text>
                        {scan.aiInsights.suggestions.map((suggestion, index) => (
                             <View key={index} style={styles.bulletPoint}>
                                <MaterialIcons name="auto-awesome" size={16} color={theme.colors.secondary} />
                                <Text style={styles.bulletText}>{suggestion}</Text>
                             </View>
                        ))}
                    </View>
                )}
                
                <Text style={[styles.detailLabel, { fontSize: 10, marginTop: 12, textAlign: 'right' }]}>
                    Last analyzed: {new Date(scan.aiInsights.analysisTimestamp || scan.updatedAt).toLocaleString()} (v{scan.aiInsights.version || 1})
                </Text>
             </InfoCard>
          )}
          
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
                value={scan.leafAnalysis?.diseases?.length > 0 ? scan.leafAnalysis.diseases.map(d => d.name).join(', ') : 'None'} 
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
                    <View>
                      <Text style={styles.diseaseName}>{disease.name}</Text>
                      <Text style={{ fontSize: 12, color: '#888' }}>
                        Confidence: {typeof disease.confidence === 'number' ? disease.confidence.toFixed(1) : disease.confidence}%
                      </Text>
                    </View>
                    <View style={[styles.severityBadge, { 
                      backgroundColor: disease.severity === 'critical' ? theme.colors.error :
                                     disease.severity === 'high' ? theme.colors.error : 
                                     disease.severity === 'medium' || disease.severity === 'moderate' ? theme.colors.warning : theme.colors.success 
                    }]}>
                      <Text style={styles.severityText}>{disease.severity}</Text>
                    </View>
                  </View>
                  
                  {/* AI Diagnosis Section */}
                  {disease.ai_diagnosis && (
                    <View style={{ marginBottom: 10, marginTop: 5, padding: 10, backgroundColor: '#f0f9ff', borderRadius: 8 }}>
                        <Text style={[styles.diseaseRecTitle, { color: theme.colors.primary, marginBottom: 5 }]}>AI Expert Diagnosis:</Text>
                        {typeof disease.ai_diagnosis === 'object' ? (
                            <View>
                                {disease.ai_diagnosis.diagnosis && (
                                    <Text style={styles.diseaseRec}><Text style={{fontWeight: 'bold'}}>Diagnosis:</Text> {disease.ai_diagnosis.diagnosis}</Text>
                                )}
                                {disease.ai_diagnosis.severity_reasoning && (
                                    <Text style={styles.diseaseRec}><Text style={{fontWeight: 'bold'}}>Severity:</Text> {disease.ai_diagnosis.severity_reasoning}</Text>
                                )}
                                {disease.ai_diagnosis.treatment && (
                                    <Text style={styles.diseaseRec}><Text style={{fontWeight: 'bold'}}>Treatment:</Text> {renderContent(disease.ai_diagnosis.treatment)}</Text>
                                )}
                                {disease.ai_diagnosis.prevention && (
                                    <Text style={styles.diseaseRec}><Text style={{fontWeight: 'bold'}}>Prevention:</Text> {renderContent(disease.ai_diagnosis.prevention)}</Text>
                                )}
                            </View>
                        ) : (
                            <Text style={styles.diseaseRec}>{disease.ai_diagnosis}</Text>
                        )}
                    </View>
                  )}

                  {/* Cause Section */}
                  {disease.cause && (
                    <View style={{ marginBottom: 10 }}>
                        <Text style={styles.diseaseRecTitle}>Cause:</Text>
                        <Text style={styles.diseaseRec}>{disease.cause}</Text>
                    </View>
                  )}

                  {/* Prevention Section */}
                  {disease.prevention && (
                     <View style={{ marginBottom: 10 }}>
                        <Text style={styles.diseaseRecTitle}>Prevention:</Text>
                        {Array.isArray(disease.prevention) ? (
                            disease.prevention.map((p, i) => (
                                <View key={i} style={styles.bulletPoint}>
                                    <MaterialIcons name="chevron-right" size={14} color={theme.colors.textSecondary} />
                                    <Text style={styles.bulletText}>{p}</Text>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.diseaseRec}>{disease.prevention}</Text>
                        )}
                     </View>
                  )}

                  {/* Treatment Section */}
                  {disease.treatment && (
                     <View style={{ marginBottom: 10 }}>
                        <Text style={styles.diseaseRecTitle}>Treatment:</Text>
                        {Array.isArray(disease.treatment) ? (
                            disease.treatment.map((t, i) => (
                                <View key={i} style={styles.bulletPoint}>
                                    <MaterialIcons name="chevron-right" size={14} color={theme.colors.textSecondary} />
                                    <Text style={styles.bulletText}>{t}</Text>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.diseaseRec}>{disease.treatment}</Text>
                        )}
                     </View>
                  )}

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
                  value={scan.productRecommendation?.recommendedProduct || scan.productYieldEstimation?.productType || "N/A"} 
                  isLast
                />
              </InfoCard>

              {/* Latex Processing Advice */}
              {scan.productRecommendation?.reason && (
                  <InfoCard title="Processing Advice" icon="science">
                      <View style={{ marginBottom: 10 }}>
                          <Text style={styles.detailLabel}>Recommendation:</Text>
                          <Text style={styles.diseaseRec}>{scan.productRecommendation.reason}</Text>
                      </View>
                      {scan.productRecommendation.preservation && (
                          <View>
                              <Text style={styles.detailLabel}>Preservation:</Text>
                              <Text style={styles.diseaseRec}>{scan.productRecommendation.preservation}</Text>
                          </View>
                      )}
                  </InfoCard>
              )}
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

           {/* AI Insights (Persisted) */}
           {scan.aiInsights && (
             <InfoCard title="AI Insights" icon="psychology">
                 {scan.aiInsights.suggestions && scan.aiInsights.suggestions.length > 0 && (
                     <View style={{ marginBottom: 15 }}>
                         <Text style={styles.detailLabel}>Suggestions:</Text>
                         {scan.aiInsights.suggestions.map((s, i) => (
                             <View key={i} style={styles.bulletPoint}>
                                 <MaterialIcons name="lightbulb-outline" size={16} color={theme.colors.warning} />
                                 <Text style={styles.bulletText}>{s}</Text>
                             </View>
                         ))}
                     </View>
                 )}
                 
                 {scan.aiInsights.promptRecommendations && scan.aiInsights.promptRecommendations.length > 0 && (
                     <View>
                         <Text style={styles.detailLabel}>Ask AI Assistant:</Text>
                         <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 }}>
                             {scan.aiInsights.promptRecommendations.map((p, i) => (
                                 <View key={i} style={{ 
                                     backgroundColor: theme.colors.surface, 
                                     borderWidth: 1, 
                                     borderColor: theme.colors.primary, 
                                     borderRadius: 20, 
                                     paddingHorizontal: 12, 
                                     paddingVertical: 6, 
                                     marginRight: 8, 
                                     marginBottom: 8 
                                 }}>
                                     <Text style={{ color: theme.colors.primary, fontSize: 12 }}>{p}</Text>
                                 </View>
                             ))}
                         </View>
                     </View>
                 )}
             </InfoCard>
           )}

           {/* 6. Productivity */}
           {scan.productivityRecommendation && (
             <InfoCard title="Productivity & Recommendations" icon="trending-up">
              <DetailRow label="Status" value={scan.productivityRecommendation?.status?.replace('_', ' ').toUpperCase()} />
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
  },
  reanalyzeButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  reanalyzeText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceHighlight,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  promptText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
});

export default ScanDetailScreen;
