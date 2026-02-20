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
import { latexAPI } from '../services/api';

const { width } = Dimensions.get('window');

const LatexDetailScreen = ({ route, navigation }) => {
  const [currentBatch, setCurrentBatch] = useState(route.params.batch);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  
  // Use currentBatch for rendering to support updates
  const batch = currentBatch;

  const handleReanalyze = async () => {
    if (!currentBatch?._id) {
        Alert.alert("Error", "Invalid batch ID. Cannot re-analyze.");
        return;
    }

    try {
        console.log("🔄 Requesting re-analysis for batch:", currentBatch._id);
        setIsReanalyzing(true);
        const res = await latexAPI.reanalyze(currentBatch._id);
        if (res.success && res.data) {
            setCurrentBatch(res.data);
            Alert.alert("Success", "Batch re-analyzed successfully with latest AI models.");
        }
    } catch (error) {
        console.error("❌ Re-analysis failed:", error);
        const errorMessage = error.error || error.message || "Failed to re-analyze batch";
        Alert.alert("Error", errorMessage);
    } finally {
        setIsReanalyzing(false);
    }
  };

  const getGradeColor = (grade) => {
    switch (grade) {
      case 'A': return theme.colors.success;
      case 'B': return '#3B82F6'; // Blue
      case 'C': return theme.colors.warning;
      case 'D': return '#F97316'; // Orange
      case 'F': return theme.colors.error;
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

  const DetailRow = ({ label, value, isLast, valueStyle }) => (
    <View style={[styles.detailRow, !isLast && styles.detailBorder]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueStyle]}>{value || 'N/A'}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Header Image */}
        <View style={styles.imageContainer}>
          <Image source={{ uri: batch.imageURL }} style={styles.image} />
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
          <View style={[styles.statusBadge, { backgroundColor: getGradeColor(batch.qualityClassification?.grade) }]}>
            <MaterialIcons 
              name="verified" 
              size={16} 
              color="#FFF" 
            />
            <Text style={styles.statusText}>
              GRADE {batch.qualityClassification?.grade || '?'}
            </Text>
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.treeTitle}>Batch {batch.batchID ? batch.batchID.split('-').slice(1,3).join('-') : 'Unknown'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <MaterialIcons 
                name="science" 
                size={16} 
                color="#DDD" 
                style={{ marginRight: 6 }}
              />
              <Text style={{ color: '#DDD', fontSize: 14, fontWeight: '500' }}>
                 LATEX ANALYSIS
              </Text>
            </View>
            <Text style={styles.scanDate}>
              {new Date(batch.createdAt).toLocaleDateString()} • {new Date(batch.createdAt).toLocaleTimeString()}
            </Text>
          </View>
        </View>

        <View style={styles.contentContainer}>
          
          {/* AI Re-analysis Button */}
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

          {/* AI Insights Card (Prompt Recommendations) */}
          {batch.aiInsights && (
             <InfoCard title="AI Prompt Recommendations" icon="lightbulb">
                {batch.aiInsights.promptRecommendations?.length > 0 && (
                    <>
                        <Text style={[styles.detailLabel, { marginBottom: 8 }]}>Suggested Questions:</Text>
                        {batch.aiInsights.promptRecommendations.map((prompt, index) => (
                            <TouchableOpacity 
                                key={index} 
                                style={styles.promptChip}
                                onPress={() => navigation.navigate('Chatbot', { initialPrompt: prompt })}
                            >
                                <MaterialIcons name="chat-bubble-outline" size={16} color={theme.colors.primary} style={{ marginRight: 6 }} />
                                <Text style={styles.promptText}>{prompt}</Text>
                            </TouchableOpacity>
                        ))}
                    </>
                )}
                
                {batch.aiInsights.suggestions?.length > 0 && (
                   <View style={{ marginTop: 12 }}>
                      <Text style={[styles.detailLabel, { marginBottom: 8 }]}>Suggestions:</Text>
                      {batch.aiInsights.suggestions.map((sug, index) => (
                          <View key={`sug-${index}`} style={styles.bulletPoint}>
                            <MaterialIcons name="star-outline" size={16} color={theme.colors.warning} style={{marginTop: 2}} />
                            <Text style={styles.insightText}>{sug}</Text>
                          </View>
                      ))}
                   </View>
                )}
             </InfoCard>
          )}

          {/* Quality Analysis */}
          <InfoCard title="Quality Analysis" icon="analytics">
            <DetailRow 
              label="Grade" 
              value={batch.qualityClassification?.grade} 
              valueStyle={{ color: getGradeColor(batch.qualityClassification?.grade), fontWeight: 'bold' }}
            />
            <DetailRow 
              label="Confidence" 
              value={batch.qualityClassification?.confidence ? `${batch.qualityClassification.confidence.toFixed(1)}%` : 'N/A'} 
            />
            <DetailRow 
              label="Dry Rubber Content" 
              value={batch.productYieldEstimation?.dryRubberContent ? `${batch.productYieldEstimation.dryRubberContent}%` : 'N/A'} 
            />
             <DetailRow 
              label="Contamination" 
              value={batch.contaminationDetection?.contaminationLevel?.toUpperCase()}
              valueStyle={{ color: batch.contaminationDetection?.contaminationLevel === 'none' ? theme.colors.success : theme.colors.warning }}
            />
            <DetailRow 
                label="Contaminants" 
                value={batch.contaminationDetection?.contaminantTypes?.length > 0 ? batch.contaminationDetection.contaminantTypes.join(', ') : 'None'}
                isLast
            />
          </InfoCard>

          {/* Color Analysis */}
          <InfoCard title="Color Analysis" icon="palette">
             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                <Text style={styles.detailLabel}>Detected Color</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View 
                        style={{ 
                            width: 24, 
                            height: 24, 
                            borderRadius: 12, 
                            backgroundColor: batch.colorAnalysis?.hex || '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#DDD',
                            marginRight: 8
                        }} 
                    />
                    <Text style={styles.detailValue}>
                        {batch.colorAnalysis?.primaryColor || 'Unknown'}
                    </Text>
                </View>
             </View>
             
             <DetailRow 
                label="RGB Values" 
                value={batch.colorAnalysis?.rgb ? `R:${batch.colorAnalysis.rgb.r} G:${batch.colorAnalysis.rgb.g} B:${batch.colorAnalysis.rgb.b}` : 'N/A'}
                isLast
             />
          </InfoCard>

          {/* Yield & Value */}
          <InfoCard title="Yield & Value" icon="monetization-on">
            <DetailRow 
              label="Est. Volume" 
              value={batch.quantityEstimation?.volume ? `${batch.quantityEstimation.volume} L` : 'N/A'} 
            />
            <DetailRow 
              label="Est. Dry Weight" 
              value={batch.productYieldEstimation?.estimatedYield ? `${batch.productYieldEstimation.estimatedYield} kg` : 'N/A'} 
            />
            <DetailRow 
              label="Market Price" 
              value={`₱${batch.marketPriceEstimation?.pricePerKg || 0}/kg`} 
            />
            <DetailRow 
              label="Total Value" 
              value={`₱${batch.marketPriceEstimation?.totalEstimatedValue?.toLocaleString() || 0}`} 
              valueStyle={{ color: theme.colors.primary, fontWeight: 'bold' }}
              isLast
            />
          </InfoCard>

          {/* Recommendations */}
          <InfoCard title="Processing Recommendation" icon="settings-suggest">
            <DetailRow 
              label="Recommended Product" 
              value={batch.productRecommendation?.recommendedProduct} 
            />
            <DetailRow 
              label="Expected Quality" 
              value={batch.productRecommendation?.expectedQuality || (batch.qualityClassification?.grade ? `Grade ${batch.qualityClassification.grade}` : 'N/A')} 
            />
            <View style={{ marginTop: 10 }}>
                <Text style={styles.detailLabel}>Reasoning</Text>
                <Text style={styles.descriptionText}>{batch.productRecommendation?.reason || 'No specific reasoning provided.'}</Text>
            </View>
            {batch.productRecommendation?.marketValueInsight && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.detailLabel}>Market Value Insight</Text>
                <Text style={styles.descriptionText}>{batch.productRecommendation.marketValueInsight}</Text>
              </View>
            )}
            {batch.productRecommendation?.preservation && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.detailLabel}>Preservation Advice</Text>
                <Text style={styles.descriptionText}>{batch.productRecommendation.preservation}</Text>
              </View>
            )}
            {batch.productRecommendation?.recommendedUses?.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.detailLabel}>Suggested Product Uses</Text>
                {batch.productRecommendation.recommendedUses.map((useItem, index) => (
                  <View key={`use-${index}`} style={styles.bulletPoint}>
                    <MaterialIcons name="check-circle-outline" size={16} color={theme.colors.primary} style={{marginTop: 2}} />
                    <Text style={styles.insightText}>{useItem}</Text>
                  </View>
                ))}
              </View>
            )}
          </InfoCard>

        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
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
    zIndex: 10,
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
    zIndex: 10,
  },
  statusText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 6,
  },
  headerInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  treeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  scanDate: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  contentContainer: {
    marginTop: -20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#F5F7FA',
    paddingTop: 24,
  },
  reanalyzeButton: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  reanalyzeText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cardIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  cardContent: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0EEFF',
  },
  promptText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  bulletPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  insightText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 6,
    lineHeight: 20,
    flex: 1,
  },
  descriptionText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    lineHeight: 22,
    marginTop: 4,
  }
});

export default LatexDetailScreen;
