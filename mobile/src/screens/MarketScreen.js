import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';

const MarketScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false); // Mock loading for now
  const [refreshing, setRefreshing] = useState(false);
  const [marketData, setMarketData] = useState({
    currentPrice: 82.50,
    priceChange: +1.25,
    lastUpdated: new Date().toLocaleDateString(),
    history: [78, 80, 79, 81, 82, 83, 82.5],
    predictions: [83, 84, 83.5, 85, 86, 85.5]
  });

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate fetch
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  }, []);

  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    decimalPlaces: 1,
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.surface, theme.colors.background]}
        style={styles.background}
      />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Market & Prices</Text>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Current Price Card */}
        <View style={styles.priceCard}>
          <View>
            <Text style={styles.priceLabel}>Current Rubber Price (RSS3)</Text>
            <Text style={styles.priceValue}>₱{marketData.currentPrice.toFixed(2)}<Text style={styles.unit}>/kg</Text></Text>
          </View>
          <View style={[styles.changeBadge, { backgroundColor: marketData.priceChange >= 0 ? '#E8F5E9' : '#FFEBEE' }]}>
             <MaterialIcons 
                name={marketData.priceChange >= 0 ? "trending-up" : "trending-down"} 
                size={20} 
                color={marketData.priceChange >= 0 ? theme.colors.success : theme.colors.error} 
             />
             <Text style={[styles.changeText, { color: marketData.priceChange >= 0 ? theme.colors.success : theme.colors.error }]}>
               {marketData.priceChange >= 0 ? '+' : ''}{marketData.priceChange}%
             </Text>
          </View>
        </View>

        {/* Price History Chart */}
        <View style={styles.chartContainer}>
          <Text style={styles.sectionTitle}>Price History (7 Days)</Text>
          {marketData.history && marketData.history.length > 0 ? (
            <LineChart
              data={{
                labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                datasets: [{ data: marketData.history }]
              }}
              width={Dimensions.get("window").width - 40}
              height={220}
              yAxisLabel="₱"
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
            />
          ) : (
             <ActivityIndicator size="small" color={theme.colors.primary} />
          )}
        </View>

        {/* Future Prediction Card */}
        <View style={styles.predictionCard}>
           <LinearGradient
              colors={theme.gradients.secondary || ['#10B981', '#34D399']}
              style={styles.predictionGradient}
            >
              <View style={styles.predictionHeader}>
                <MaterialIcons name="auto-graph" size={24} color="#FFF" />
                <Text style={styles.predictionTitle}>AI Price Prediction</Text>
              </View>
              <Text style={styles.predictionText}>
                Based on current market trends and historical data, rubber prices are expected to <Text style={{fontWeight: 'bold'}}>RISE</Text> in the next 2 weeks.
              </Text>
              <View style={styles.predictionStats}>
                 <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Next Week</Text>
                    <Text style={styles.statValue}>~₱84.50</Text>
                 </View>
                 <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Trend</Text>
                    <Text style={styles.statValue}>Bullish 📈</Text>
                 </View>
              </View>
           </LinearGradient>
        </View>

        {/* Market News / Tips */}
        <Text style={styles.sectionTitle}>Market Insights</Text>
        <View style={styles.insightCard}>
           <MaterialIcons name="lightbulb" size={24} color={theme.colors.secondary} style={styles.insightIcon} />
           <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Best Time to Sell?</Text>
              <Text style={styles.insightText}>
                 Global demand is increasing. It might be good to hold stock for another week if you have storage capacity.
              </Text>
           </View>
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
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  priceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 5,
  },
  priceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  unit: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: 'normal',
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  changeText: {
    fontWeight: 'bold',
    marginLeft: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 15,
    marginTop: 10,
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
    alignItems: 'center',
  },
  chart: {
    borderRadius: 16,
    marginVertical: 8,
  },
  predictionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 4,
  },
  predictionGradient: {
    padding: 20,
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  predictionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginLeft: 10,
  },
  predictionText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  predictionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 15,
    padding: 15,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  insightCard: {
    backgroundColor: '#FFF',
    borderRadius: 15,
    padding: 15,
    flexDirection: 'row',
    elevation: 2,
  },
  insightIcon: {
    marginRight: 15,
    marginTop: 2,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 5,
  },
  insightText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});

export default MarketScreen;
