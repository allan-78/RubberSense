import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Alert,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import axios from 'axios';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons, Ionicons, FontAwesome5, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { LineChart } from 'react-native-chart-kit';
import { useAuth } from '../context/AuthContext';
import { treeAPI, scanAPI, latexAPI } from '../services/api';
import { theme } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const HERO_IMAGES = [
  { id: '1', uri: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?q=80&w=1000&auto=format&fit=crop', title: 'Forest Canopy' },
  { id: '2', uri: 'https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=1000&auto=format&fit=crop', title: 'Green Path' },
  { id: '3', uri: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1000&auto=format&fit=crop', title: 'Sunlit Woods' },
  { id: '4', uri: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?q=80&w=1000&auto=format&fit=crop', title: 'Nature Deep' },
];

const HomeScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Dashboard Stats
  const [stats, setStats] = useState({
    totalTrees: 0,
    scansToday: 0,
    healthyTrees: 0,
    alerts: 0,
    rubberTrees: 0,
    estimatedLatexYield: 0,
    healthScore: 100,
    yieldHistory: [0, 0, 0, 0, 0, 0], // Mock history for chart
  });
  const [treeStats, setTreeStats] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  
  // Location & Weather
  const [location, setLocation] = useState(null);
  const [weather, setWeather] = useState(null);
  const [tappingAdvisory, setTappingAdvisory] = useState({ status: 'Unknown', color: '#9E9E9E', message: 'Checking weather...' });
  const [farms, setFarms] = useState([]);
  const [mapRegion, setMapRegion] = useState(null);

  // Animations (Standard Animated API)
  const scrollY = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Staggered Animations for Grid
  const cardScaleAnim = useRef(new Animated.Value(0.9)).current;

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const contentTranslateY = fadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [50, 0],
  });

  // Hero Carousel
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Initial Data Load
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location access is required for farm detection.');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      setMapRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
      
      fetchWeather(loc.coords.latitude, loc.coords.longitude);
    })();
    
    // Start entry animation sequence
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(cardScaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  // Auto-scroll Hero
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        const next = prev === HERO_IMAGES.length - 1 ? 0 : prev + 1;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const fetchWeather = async (lat, lon) => {
    try {
      const response = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation_probability`
      );
      const data = response.data.current_weather;
      
      const isRain = data.weathercode >= 50;
      const isCloudy = data.weathercode > 3;
      
      setWeather({
        temp: Math.round(data.temperature),
        condition: isRain ? 'Rainy' : (isCloudy ? 'Cloudy' : 'Clear'),
        icon: isRain ? 'cloud-rain' : (isCloudy ? 'cloud' : 'sun'),
        windSpeed: data.windspeed,
      });

      // Update Tapping Advisory
      if (isRain) {
        setTappingAdvisory({ status: 'Do Not Tap', color: '#EF5350', message: 'Rain detected. Risk of washout.' });
      } else if (data.windspeed > 20) {
        setTappingAdvisory({ status: 'Caution', color: '#FFA726', message: 'High winds. Watch for debris.' });
      } else {
        setTappingAdvisory({ status: 'Good to Tap', color: '#66BB6A', message: 'Conditions are optimal.' });
      }

    } catch (error) {
      console.log('Weather error:', error);
      setWeather({ temp: 28, condition: 'Clear', icon: 'sun', windSpeed: 5 }); // Fallback
      setTappingAdvisory({ status: 'Unknown', color: '#9E9E9E', message: 'Weather data unavailable.' });
    }
  };

  const loadData = async () => {
    try {
      const [treesRes, scansRes, latexRes, treeStatsRes] = await Promise.allSettled([
        treeAPI.getAll(),
        scanAPI.getAll(),
        latexAPI.getAll(),
        treeAPI.getStats(),
      ]);

      const trees = treesRes.status === 'fulfilled' ? treesRes.value?.data || [] : [];
      const treeScans = scansRes.status === 'fulfilled' ? scansRes.value?.data || [] : [];
      const latexScans = latexRes.status === 'fulfilled' ? latexRes.value?.data || [] : [];
      const tStats = treeStatsRes.status === 'fulfilled' ? treeStatsRes.value?.data : null;

      const allScans = [
        ...treeScans.map(s => ({ ...s, type: 'tree' })), 
        ...latexScans.map(s => ({ ...s, type: 'latex' }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const todayStr = new Date().toDateString();
      const scansToday = allScans.filter(s => new Date(s.createdAt).toDateString() === todayStr).length;
      const rubberTrees = trees.filter(t => t.species === 'Rubber' || t.isRubberTree).length;
      
      // Calculate Health Score
      const totalEvaluated = (tStats?.healthyTrees || 0) + (tStats?.diseasedTrees || 0);
      const healthScore = totalEvaluated > 0 
        ? Math.round(((tStats?.healthyTrees || 0) / totalEvaluated) * 100) 
        : 100;

      // Mock Yield History (Last 6 entries)
      const mockHistory = [45, 50, 48, 52, 55, rubberTrees * 0.75 || 60];

      setStats({
        totalTrees: trees.length,
        scansToday,
        healthyTrees: tStats?.healthyTrees || 0,
        alerts: tStats?.diseasedTrees || 0,
        rubberTrees,
        estimatedLatexYield: Math.round(rubberTrees * 0.75), // Mock calculation 0.75kg per tree
        healthScore,
        yieldHistory: mockHistory
      });

      setTreeStats(tStats);
      setRecentScans(allScans.slice(0, 5));
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
    if (location) fetchWeather(location.coords.latitude, location.coords.longitude);
  };

  const scanForFarms = () => {
    if (!location) return;
    const { latitude, longitude } = location.coords;
    // Mock Scan
    const newFarms = Array.from({ length: 4 }).map((_, i) => ({
      id: `farm-${Date.now()}-${i}`,
      latitude: latitude + (Math.random() - 0.5) * 0.01,
      longitude: longitude + (Math.random() - 0.5) * 0.01,
      title: `Estate Zone ${String.fromCharCode(65 + i)}`,
      status: Math.random() > 0.7 ? 'attention' : 'healthy',
    }));
    setFarms(newFarms);
    Alert.alert('Scan Complete', `Found ${newFarms.length} zones nearby.`);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 18) return 'Good Afternoon,';
    return 'Good Evening,';
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
      <StatusBar style="light" />
      
      {/* Sticky Header */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerOpacity }]}>
        <LinearGradient
          colors={[theme.colors.primaryDark, theme.colors.primary]}
          style={styles.stickyHeaderGradient}
        >
          <Text style={styles.stickyHeaderTitle}>Dashboard</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#fff"
            progressViewOffset={50}
          />
        }
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        {/* HERO SECTION */}
        <View style={styles.heroSection}>
          <FlatList
            ref={flatListRef}
            data={HERO_IMAGES}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => item.id}
            getItemLayout={(data, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            renderItem={({ item }) => (
              <Image source={{ uri: item.uri }} style={styles.heroImage} resizeMode="cover" />
            )}
            onScroll={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setCurrentIndex(index);
            }}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.85)']}
            style={styles.heroOverlay}
          >
            {/* Top Bar */}
            <View style={styles.topBar}>
              <View style={styles.userInfo}>
                <Image 
                  source={{ uri: user?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}` }} 
                  style={styles.avatar} 
                />
                <View style={styles.userText}>
                  <Text style={styles.greeting}>{getGreeting()}</Text>
                  <Text style={styles.username}>{user?.name?.split(' ')[0] || 'Grower'}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate('Profile')}>
                <Ionicons name="notifications-outline" size={24} color="#fff" />
                {stats.alerts > 0 && <View style={styles.badge} />}
              </TouchableOpacity>
            </View>

            {/* Hero Stats & Advisory */}
            <View style={styles.heroContent}>
              <View style={styles.weatherContainer}>
                <View style={styles.weatherBadge}>
                  <Feather name={weather?.icon || 'sun'} size={18} color="#fff" />
                  <Text style={styles.weatherText}>{weather?.temp}°C • {weather?.condition}</Text>
                </View>
                <View style={[styles.advisoryBadge, { backgroundColor: tappingAdvisory.color }]}>
                   <Text style={styles.advisoryText}>{tappingAdvisory.status}</Text>
                </View>
              </View>
              
              <Text style={styles.heroTitle}>
                {stats.alerts > 0 ? `${stats.alerts} Issues Detected` : 'Orchard is Healthy'}
              </Text>
              <Text style={styles.heroSubtitle}>
                {tappingAdvisory.message}
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* MAIN CONTENT - Floating Sheet */}
        <Animated.View style={[
          styles.contentLayer, 
          { 
            opacity: fadeAnim,
            transform: [{ translateY: contentTranslateY }]
          }
        ]}>
          
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.searchText}>Search trees, zones, or reports...</Text>
            </View>
          </View>

          {/* QUICK ACTIONS */}
          <View style={styles.quickActionsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsScroll}>
              {[
                { label: 'New Scan', icon: 'scan-outline', route: 'Camera', color: '#4CAF50' },
                { label: 'Log Latex', icon: 'water-outline', route: 'History', params: { initialTab: 'latex' }, color: '#2196F3' },
                { label: 'Add Tree', icon: 'add-circle-outline', route: 'Camera', color: '#FF9800' },
                { label: 'Reports', icon: 'document-text-outline', route: 'History', color: '#9C27B0' },
              ].map((action, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.actionChip}
                  onPress={() => navigation.navigate(action.route, action.params)}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: `${action.color}20` }]}>
                    <Ionicons name={action.icon} size={22} color={action.color} />
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* DASHBOARD GRID */}
          <Text style={styles.sectionTitle}>Overview</Text>
          <Animated.View style={[styles.bentoGrid, { transform: [{ scale: cardScaleAnim }] }]}>
            {/* Main Large Card - Yield Chart */}
            <TouchableOpacity 
              style={[styles.bentoCard, styles.bentoLarge]}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('History', { initialTab: 'latex' })}
            >
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.primaryDark]}
                style={styles.cardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.iconCircle}>
                    <MaterialIcons name="opacity" size={24} color={theme.colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.cardLabelLight}>Est. Yield</Text>
                    <Text style={styles.cardValue}>{stats.estimatedLatexYield} kg</Text>
                  </View>
                </View>
                
                {/* Mini Line Chart */}
                <View style={styles.chartContainer}>
                  <LineChart
                    data={{
                      labels: [], // No labels for cleanliness
                      datasets: [{ data: stats.yieldHistory }]
                    }}
                    width={SCREEN_WIDTH * 0.85} 
                    height={80}
                    withDots={false}
                    withInnerLines={false}
                    withOuterLines={false}
                    withHorizontalLabels={false}
                    withVerticalLabels={false}
                    chartConfig={{
                      backgroundColor: 'transparent',
                      backgroundGradientFrom: 'transparent',
                      backgroundGradientTo: 'transparent',
                      decimalPlaces: 0,
                      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                      labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                      style: { borderRadius: 16 },
                      propsForDots: { r: "0" },
                    }}
                    bezier
                    style={{
                      paddingRight: 0,
                      marginLeft: -20, // Offset to align with left edge
                    }}
                  />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Row of 2 Small Cards */}
            <View style={styles.bentoRow}>
              {/* Health Score Card */}
              <TouchableOpacity style={styles.bentoCard} activeOpacity={0.9}>
                <View style={styles.healthHeader}>
                  <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}>
                    <MaterialCommunityIcons name="heart-pulse" size={20} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.percentText, { color: stats.healthScore > 80 ? theme.colors.primary : '#EF5350' }]}>
                    {stats.healthScore}%
                  </Text>
                </View>
                <Text style={styles.statLabel}>Orchard Health</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${stats.healthScore}%`, backgroundColor: stats.healthScore > 80 ? theme.colors.primary : '#EF5350' }]} />
                </View>
              </TouchableOpacity>

              {/* Scans Today Card */}
              <TouchableOpacity style={styles.bentoCard} activeOpacity={0.9} onPress={() => navigation.navigate('Camera')}>
                <View style={styles.healthHeader}>
                  <View style={[styles.iconBox, { backgroundColor: '#FFF3E0' }]}>
                    <Ionicons name="scan" size={20} color="#F57C00" />
                  </View>
                  <Text style={[styles.percentText, { color: '#F57C00' }]}>
                    {stats.scansToday}
                  </Text>
                </View>
                <Text style={styles.statLabel}>Scans Today</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min((stats.scansToday / 10) * 100, 100)}%`, backgroundColor: '#F57C00' }]} />
                </View>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* FARM MAP SECTION */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Field Map</Text>
            <TouchableOpacity onPress={scanForFarms}>
              <Text style={styles.actionLink}>Scan Area</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.mapCard}>
            {location ? (
              <MapView
                style={styles.mapView}
                region={mapRegion}
                provider={PROVIDER_DEFAULT}
                scrollEnabled={false}
                zoomEnabled={false}
              >
                <UrlTile urlTemplate="http://c.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} zIndex={-1} />
                <Marker coordinate={location.coords}>
                  <View style={styles.userMarker}>
                    <View style={styles.userMarkerDot} />
                    <View style={styles.userMarkerRing} />
                  </View>
                </Marker>
                {farms.map(farm => (
                  <Marker
                    key={farm.id}
                    coordinate={{ latitude: farm.latitude, longitude: farm.longitude }}
                    pinColor={farm.status === 'healthy' ? theme.colors.primary : theme.colors.warning}
                  />
                ))}
              </MapView>
            ) : (
              <View style={styles.mapPlaceholder}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.loadingText}>Locating...</Text>
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.mapOverlay}
            >
              <View style={styles.mapOverlayContent}>
                <Text style={styles.mapOverlayText}>{farms.length > 0 ? `${farms.length} Zones Detected` : 'No Zones Scanned'}</Text>
                <TouchableOpacity style={styles.mapButton} onPress={() => Alert.alert('Full Map', 'Coming soon!')}>
                   <Feather name="maximize-2" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>

          {/* RECENT ACTIVITY */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => navigation.navigate('History')}>
              <Text style={styles.actionLink}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listContainer}>
            {recentScans.length > 0 ? (
              recentScans.map((scan, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.listItem}
                  onPress={() => navigation.navigate('History', { initialTab: scan.type === 'latex' ? 'latex' : 'trees' })}
                >
                  <View style={[styles.listIcon, { backgroundColor: scan.type === 'latex' ? '#E3F2FD' : '#E8F5E9' }]}>
                    <MaterialIcons 
                      name={scan.type === 'latex' ? 'water-drop' : 'park'} 
                      size={20} 
                      color={scan.type === 'latex' ? '#1976D2' : theme.colors.primary} 
                    />
                  </View>
                  <View style={styles.listContent}>
                    <Text style={styles.listTitle}>
                      {scan.type === 'latex' ? `Latex Batch #${scan.batchID?.substring(0,4) || '---'}` : (scan.tree?.species || 'Tree Scan')}
                    </Text>
                    <Text style={styles.listSubtitle}>
                      {new Date(scan.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {scan.type === 'latex' ? 'Analysis' : 'Health Check'}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#CFD8DC" />
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="file-tray-outline" size={32} color={theme.colors.textLight} />
                <Text style={styles.emptyText}>No recent activity</Text>
              </View>
            )}
          </View>

        </Animated.View>
      </Animated.ScrollView>

      {/* FAB */}
      <TouchableOpacity 
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Chatbot')}
      >
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.primaryDark]}
          style={styles.fabGradient}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
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
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 90 : 80,
    zIndex: 100,
    elevation: 4,
  },
  stickyHeaderGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 12,
    alignItems: 'center',
  },
  stickyHeaderTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  
  // Hero
  heroSection: {
    height: 380,
    width: SCREEN_WIDTH,
    position: 'relative',
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: 380,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 70, // Increased padding to account for overlap
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  userText: {
    marginLeft: 12,
  },
  greeting: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  username: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  notifButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
    borderWidth: 1,
    borderColor: '#fff',
  },
  heroContent: {
    marginBottom: 20,
  },
  weatherContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  weatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 10,
  },
  weatherText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  advisoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  advisoryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontWeight: '500',
  },

  // Content Layer
  contentLayer: {
    marginTop: -40,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 30,
    minHeight: 500,
  },

  // Search
  searchContainer: {
    marginBottom: 25,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchText: {
    marginLeft: 12,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },

  // Quick Actions
  quickActionsContainer: {
    marginBottom: 30,
  },
  quickActionsScroll: {
    paddingRight: 20,
  },
  actionChip: {
    alignItems: 'center',
    marginRight: 20,
  },
  actionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },

  // Bento Grid
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 24,
  },
  actionLink: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  bentoGrid: {
    marginBottom: 10,
  },
  bentoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    overflow: 'hidden',
  },
  bentoLarge: {
    height: 180,
    padding: 0, // Reset padding for gradient to fill
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardLabelLight: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  chartContainer: {
    marginTop: 10,
    alignItems: 'center',
    overflow: 'hidden',
  },
  
  bentoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  // Small Cards
  healthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentText: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: theme.colors.borderLight,
    borderRadius: 3,
    width: '100%',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },

  // Map
  mapCard: {
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceHighlight,
  },
  mapView: {
    ...StyleSheet.absoluteFillObject,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  userMarker: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
    zIndex: 2,
    borderWidth: 2,
    borderColor: '#fff',
  },
  userMarkerRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(33, 150, 243, 0.3)',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  mapOverlayContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapOverlayText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  mapButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 6,
    borderRadius: 8,
  },

  // List
  listContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 8,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listContent: {
    flex: 1,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  listSubtitle: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: theme.colors.textLight,
    marginTop: 8,
    fontSize: 14,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabGradient: {
    flex: 1,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default HomeScreen;
