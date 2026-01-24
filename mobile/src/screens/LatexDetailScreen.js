import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../styles/theme';

const LatexDetailScreen = ({ route, navigation }) => {
  const { batch } = route.params;

  const InfoCard = ({ title, icon, children }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <LinearGradient
          colors={theme.gradients.primary}
          style={styles.cardIconBg}
        >
          <MaterialIcons name={icon} size={20} color="#FFF" />
        </LinearGradient>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={styles.cardContent}>{children}</View>
    </View>
  );

  const DetailRow = ({ label, value, isLast, valueStyle }) => (
    <View style={[styles.detailRow, !isLast && styles.detailBorder]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueStyle]}>{value || 'N/A'}</Text>
    </View>
  );

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

  return (
    <View style={styles.container}>
      {/* Header Image */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: batch.imageURL }} style={styles.headerImage} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.imageOverlay}
        />
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <View style={styles.batchBadge}>
            <Text style={styles.batchBadgeText}>{batch.batchID}</Text>
          </View>
          <Text style={styles.dateText}>
            {new Date(batch.collectionDate).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Quality Score Card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreHeader}>
            <Text style={styles.scoreTitle}>Latex Quality Grade</Text>
            <MaterialIcons name="verified" size={24} color={getGradeColor(batch.qualityClassification?.grade)} />
          </View>
          <View style={styles.gradeContainer}>
            <Text style={[styles.gradeText, { color: getGradeColor(batch.qualityClassification?.grade) }]}>
              {batch.qualityClassification?.grade || '?'}
            </Text>
            <Text style={styles.confidenceText}>
              {batch.qualityClassification?.confidence ? `${Math.round(batch.qualityClassification.confidence * 100)}% Confidence` : 'Analyzing...'}
            </Text>
          </View>
          <Text style={styles.gradeDescription}>
            {batch.qualityClassification?.description || 'No description available'}
          </Text>
        </View>

        {/* Quality Analysis */}
        <InfoCard title="Quality Analysis" icon="science">
          <DetailRow 
            label="Dry Rubber Content (DRC)" 
            value={batch.productYieldEstimation?.dryRubberContent ? `${batch.productYieldEstimation.dryRubberContent}%` : 'N/A'} 
          />
          <DetailRow 
            label="Primary Color" 
            value={batch.colorAnalysis?.primaryColor} 
          />
          <DetailRow 
            label="Contamination Level" 
            value={batch.contaminationDetection?.contaminationLevel?.toUpperCase()}
            valueStyle={{ color: batch.contaminationDetection?.contaminationLevel === 'none' ? theme.colors.success : theme.colors.warning }}
          />
          <DetailRow 
            label="Water Content" 
            value={batch.contaminationDetection?.hasWater ? 'Detected' : 'None'} 
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
        <InfoCard title="Processing Recommendation" icon="lightbulb">
          <DetailRow 
            label="Recommended Product" 
            value={batch.productRecommendation?.recommendedProduct} 
          />
          <DetailRow 
            label="Reason" 
            value={batch.productRecommendation?.reason} 
          />
          <DetailRow 
            label="Expected Quality" 
            value={batch.productRecommendation?.expectedQuality} 
            isLast
          />
        </InfoCard>

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
    height: 250,
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
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
  headerContent: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  batchBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  batchBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: theme.fontSize.sm,
  },
  dateText: {
    color: '#FFF',
    fontSize: theme.fontSize.md,
    opacity: 0.9,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 40,
  },
  scoreCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
    alignItems: 'center',
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  scoreTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginRight: 8,
  },
  gradeContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  gradeText: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  confidenceText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
  },
  gradeDescription: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  cardIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
});

export default LatexDetailScreen;
