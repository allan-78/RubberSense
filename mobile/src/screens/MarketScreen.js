import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import theme from '../styles/theme';
import { marketAPI } from '../services/api';
import { useNotification } from '../context/NotificationContext';

// High-contrast color scheme
const DARK_BG = '#1a1a1a';
const ACCENT_GAIN = '#00ff88';
const ACCENT_LOSS = '#ff4757';
const ACCENT_NEUTRAL = '#ffa502';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = '#a0a0a0';
const CARD_BG = '#2d2d2d';

const MarketScreen = ({ navigation }) => {
  const { settings, toggleSetting } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartPeriod, setChartPeriod] = useState('1W'); // '1W' or '1Y'
  const [marketData, setMarketData] = useState({
    currentPrice: 0,
    priceChange: 0,
    lastUpdated: '',
    dailyHistory: [],
    monthlyHistory: [],
    trend: 'NEUTRAL',
    confidence: 0,
    nextWeekPrice: 0,
    features: [],
    analysis: '',
    recommendations: []
  });

  const fetchMarketData = async (force = false) => {
    try {
      const response = await marketAPI.getForecast(force);
      if (response.success) {
        const data = response.data;
        setMarketData({
          currentPrice: data.price || 0,
          priceChange: data.priceChange || 0,
          lastUpdated: data.timestamp || new Date().toISOString(),
          dailyHistory: data.dailyHistory || [],
          monthlyHistory: data.monthlyHistory || [],
          trend: data.trend || 'NEUTRAL',
          confidence: data.confidence || 0,
          nextWeekPrice: data.nextWeekProjection || 0,
          features: data.features || [],
          analysis: data.analysis || '',
          recommendations: data.recommendations || []
        });
      }
    } catch (error) {
      console.log('Error fetching market data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchMarketData(false);
    }, [])
  );

  useEffect(() => {
    // Refresh every hour (cached) or 15 mins for volatility - handled by API cache logic
    const interval = setInterval(() => fetchMarketData(false), 60000); // Check cache every minute
    return () => clearInterval(interval);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMarketData(true); // Force refresh
  }, []);

  const chartConfig = {
    backgroundGradientFrom: CARD_BG,
    backgroundGradientTo: CARD_BG,
    color: (opacity = 1) => `rgba(0, 255, 136, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    decimalPlaces: 0,
    propsForDots: {
      r: "4",
      strokeWidth: "2",
      stroke: ACCENT_GAIN
    }
  };

  if (loading && !refreshing && marketData.currentPrice === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={ACCENT_GAIN} />
        <Text style={styles.loadingText}>Analyzing Market Trends...</Text>
      </View>
    );
  }

  const getChartData = () => {
    if (chartPeriod === '1W') {
      return {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [{ data: marketData.dailyHistory && marketData.dailyHistory.length > 0 ? marketData.dailyHistory : [0,0,0,0,0,0,0] }]
      };
    } else {
      // 1 Year (Monthly) - simplified labels
      const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
      const history = marketData.monthlyHistory || [];
      // Take last 12 points for cleaner mobile view or downsample
      const displayData = history.length > 12 ? history.slice(-12) : (history.length > 0 ? history : [0]);
      
      return {
        labels: months,
        datasets: [{ data: displayData }]
      };
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Market Intelligence</Text>
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => {
            const newState = toggleSetting('marketAlerts');
            Alert.alert(
              newState ? 'Alerts Enabled' : 'Alerts Disabled',
              newState 
                ? 'You will receive alerts for significant price changes.'
                : 'Market alerts paused.'
            );
          }}
        >
          <Ionicons 
            name={settings.marketAlerts ? "notifications" : "notifications-off-outline"} 
            size={24} 
            color={settings.marketAlerts ? ACCENT_GAIN : TEXT_SECONDARY} 
          />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor={ACCENT_GAIN} 
            colors={[ACCENT_GAIN]} 
          />
        }
      >
        {/* Current Price Card */}
        <View style={styles.priceCard}>
          <View>
            <Text style={styles.priceLabel}>RSS3 Rubber Price</Text>
            <Text style={styles.priceValue}>₱{(marketData.currentPrice || 0).toFixed(2)}</Text>
          </View>
          <View style={[
            styles.changeBadge, 
            { borderColor: marketData.priceChange >= 0 ? ACCENT_GAIN : ACCENT_LOSS }
          ]}>
             <MaterialIcons 
                name={marketData.priceChange >= 0 ? "trending-up" : "trending-down"} 
                size={24} 
                color={marketData.priceChange >= 0 ? ACCENT_GAIN : ACCENT_LOSS} 
              />
             <Text style={[
               styles.changeText, 
               { color: marketData.priceChange >= 0 ? ACCENT_GAIN : ACCENT_LOSS }
             ]}>
               {marketData.priceChange >= 0 ? '+' : ''}{marketData.priceChange}%
             </Text>
          </View>
        </View>

        {/* Chart Section */}
        <View style={styles.chartContainer}>
          <View style={styles.chartHeader}>
             <Text style={styles.sectionTitle}>Price Trend</Text>
             <View style={styles.periodToggle}>
                <TouchableOpacity 
                  style={[styles.periodBtn, chartPeriod === '1W' && styles.periodBtnActive]}
                  onPress={() => setChartPeriod('1W')}
                >
                  <Text style={[styles.periodText, chartPeriod === '1W' && styles.periodTextActive]}>1W</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.periodBtn, chartPeriod === '1Y' && styles.periodBtnActive]}
                  onPress={() => setChartPeriod('1Y')}
                >
                  <Text style={[styles.periodText, chartPeriod === '1Y' && styles.periodTextActive]}>1Y</Text>
                </TouchableOpacity>
             </View>
          </View>
          
          <LineChart
            data={getChartData()}
            width={Dimensions.get("window").width - 40}
            height={220}
            yAxisLabel="₱"
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
          />
        </View>

        {/* Future Prediction Card */}
        <View style={styles.predictionCard}>
           <LinearGradient
              colors={['#2d2d2d', '#1a1a1a']}
              style={styles.predictionGradient}
            >
              <View style={styles.predictionHeader}>
                <FontAwesome5 name="brain" size={20} color={ACCENT_GAIN} style={{marginRight: 10}} />
                <Text style={styles.predictionTitle}>AI Forecast Engine</Text>
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>{marketData.confidence}% Confidence</Text>
                </View>
              </View>
              
              <View style={styles.predictionStats}>
                 <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Next Week Projection</Text>
                    <Text style={styles.statValue}>₱{marketData.nextWeekPrice}</Text>
                 </View>
                 <View style={styles.separator} />
                 <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Market Sentiment</Text>
                    <Text style={[
                      styles.statValue, 
                      { color: marketData.trend === 'RISE' ? ACCENT_GAIN : ACCENT_LOSS }
                    ]}>
                      {marketData.trend === 'RISE' ? 'BULLISH' : 'BEARISH'}
                    </Text>
                 </View>
              </View>
           </LinearGradient>
        </View>

        {/* Market Analysis */}
        {marketData.analysis ? (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>AI Market Analysis</Text>
            <View style={styles.analysisCard}>
              <Text style={styles.analysisText}>{marketData.analysis}</Text>
            </View>
          </View>
        ) : null}

        {/* Strategic Recommendations */}
        {marketData.recommendations && marketData.recommendations.length > 0 ? (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Strategic Recommendations</Text>
            {marketData.recommendations.map((rec, index) => (
              <View key={index} style={styles.recommendationCard}>
                <View style={styles.bulletPoint} />
                <Text style={styles.recommendationText}>{rec}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Key Drivers */}
        <Text style={styles.sectionTitle}>Market Drivers</Text>
        {marketData.features && marketData.features.map((feature, index) => (
          <View key={index} style={styles.insightCard}>
             <View style={[styles.insightIconContainer, { 
               backgroundColor: feature.sentiment === 'Positive' ? 'rgba(0,255,136,0.1)' : 
                              (feature.sentiment === 'Negative' ? 'rgba(255,71,87,0.1)' : 'rgba(255,165,2,0.1)')
             }]}>
               <MaterialIcons 
                  name={feature.sentiment === 'Positive' ? "trending-up" : (feature.sentiment === 'Negative' ? "trending-down" : "remove")} 
                  size={24} 
                  color={feature.sentiment === 'Positive' ? ACCENT_GAIN : (feature.sentiment === 'Negative' ? ACCENT_LOSS : ACCENT_NEUTRAL)} 
               />
             </View>
             <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{feature.name}</Text>
                <Text style={styles.insightText}>
                   Impact: <Text style={{color: TEXT_PRIMARY}}>{feature.impact}</Text>
                </Text>
             </View>
             <Text style={[styles.sentimentText, {
                color: feature.sentiment === 'Positive' ? ACCENT_GAIN : (feature.sentiment === 'Negative' ? ACCENT_LOSS : ACCENT_NEUTRAL)
             }]}>{feature.sentiment}</Text>
          </View>
        ))}

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    color: TEXT_SECONDARY,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: DARK_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#333',
  },
  scrollContent: {
    padding: 20,
  },
  priceCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#444',
  },
  priceLabel: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  priceValue: {
    fontSize: 42,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 30,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  changeText: {
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 4,
  },
  chartContainer: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#444',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: '#000',
    borderRadius: 20,
    padding: 2,
  },
  periodBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  periodBtnActive: {
    backgroundColor: '#444',
  },
  periodText: {
    color: TEXT_SECONDARY,
    fontWeight: '600',
    fontSize: 12,
  },
  periodTextActive: {
    color: TEXT_PRIMARY,
  },
  chart: {
    borderRadius: 16,
    paddingRight: 0,
  },
  predictionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: ACCENT_GAIN,
  },
  predictionGradient: {
    padding: 20,
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  predictionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
    flex: 1,
  },
  confidenceBadge: {
    backgroundColor: ACCENT_GAIN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  confidenceText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  predictionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  separator: {
    width: 1,
    backgroundColor: '#444',
    marginHorizontal: 10,
  },
  statLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    marginBottom: 6,
  },
  statValue: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: 'bold',
  },
  insightCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  insightIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  insightText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  sentimentText: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  analysisCard: {
    backgroundColor: 'rgba(0, 255, 136, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.2)',
  },
  analysisText: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    lineHeight: 22,
  },
  recommendationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingRight: 10,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT_GAIN,
    marginTop: 8,
    marginRight: 12,
  },
  recommendationText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 22,
    flex: 1,
  },
});

export default MarketScreen;
