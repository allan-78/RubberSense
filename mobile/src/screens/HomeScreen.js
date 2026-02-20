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
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import axios from 'axios';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons, Ionicons, FontAwesome5, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { LineChart } from 'react-native-chart-kit';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useAppRefresh } from '../context/AppRefreshContext';
import { treeAPI, scanAPI, latexAPI, marketAPI } from '../services/api';
import { theme } from '../styles/theme';
import AIGuide from '../components/AIGuide';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ---------------------------------------------------------
// 📍 RUBBER TREE LOCATIONS DATA
// ---------------------------------------------------------
const RUBBER_LOCATIONS = [
  // --- LUZON ---
  { id: 'lz1', name: 'N3 Rubber Tree Farm', region: 'Nueva Vizcaya', lat: 16.5047165, lon: 121.3034686 },
  // Quezon Province - Gumaca
  { id: 'lz2', name: 'Sitio Concepcion', region: 'Quezon', lat: 13.9210, lon: 122.1000 },
  { id: 'lz3', name: 'Sitio Malabahay', region: 'Quezon', lat: 13.9150, lon: 122.1100 },
  { id: 'lz4', name: 'Sitio Bato', region: 'Quezon', lat: 13.9300, lon: 122.1200 },
  { id: 'lz5', name: 'Sitio Lagyo', region: 'Quezon', lat: 13.9400, lon: 122.1300 },
  { id: 'lz6', name: 'Sitio Cagbalete', region: 'Quezon', lat: 13.9500, lon: 122.1400 },
  { id: 'lz7', name: 'Sitio Villa Bota', region: 'Quezon', lat: 13.9600, lon: 122.1500 },
  { id: 'lz8', name: 'Sitio San Diego', region: 'Quezon', lat: 13.9700, lon: 122.1600 },
  // Infanta
  { id: 'lz9', name: 'Sitio Magsikap', region: 'Quezon', lat: 14.7440, lon: 121.6490 },
  { id: 'lz10', name: 'Sitio Dinahican', region: 'Quezon', lat: 14.7400, lon: 121.6600 },
  { id: 'lz11', name: 'Sitio Pinaglapatan', region: 'Quezon', lat: 14.7500, lon: 121.6400 },
  { id: 'lz12', name: 'Sitio Catambungan', region: 'Quezon', lat: 14.7600, lon: 121.6300 },
  // Real
  { id: 'lz13', name: 'Sitio Malapad', region: 'Quezon', lat: 14.6630, lon: 121.6050 },
  { id: 'lz14', name: 'Sitio Llavac', region: 'Quezon', lat: 14.6700, lon: 121.5900 },
  { id: 'lz15', name: 'Sitio Tignoan', region: 'Quezon', lat: 14.6800, lon: 121.5800 },
  // General Nakar
  { id: 'lz16', name: 'Sitio Umiray', region: 'Quezon', lat: 14.8190, lon: 121.6330 },
  { id: 'lz17', name: 'Sitio Pagsangahan', region: 'Quezon', lat: 14.8300, lon: 121.6400 },
  { id: 'lz18', name: 'Sitio Minahan Norte', region: 'Quezon', lat: 14.8400, lon: 121.6500 },
  { id: 'lz19', name: 'Sitio Minahan Sur', region: 'Quezon', lat: 14.8500, lon: 121.6600 },
  // Aurora
  { id: 'lz20', name: 'Sitio Dimani', region: 'Aurora', lat: 15.8500, lon: 121.6000 },
  { id: 'lz21', name: 'Sitio Borlongan', region: 'Aurora', lat: 15.8600, lon: 121.5900 },
  { id: 'lz22', name: 'Sitio Bayanihan', region: 'Aurora', lat: 15.7960, lon: 121.4800 },
  { id: 'lz23', name: 'Sitio Malasin', region: 'Aurora', lat: 15.7900, lon: 121.4700 },
  // Nueva Vizcaya
  { id: 'lz24', name: 'Sitio Baresbes', region: 'Nueva Vizcaya', lat: 16.5000, lon: 121.3000 },
  { id: 'lz25', name: 'Sitio Darapidap', region: 'Nueva Vizcaya', lat: 16.5100, lon: 121.3100 },
  { id: 'lz26', name: 'Sitio Buliwao', region: 'Nueva Vizcaya', lat: 16.5200, lon: 121.3200 },
  // Isabela
  { id: 'lz27', name: 'Sitio Disabungan', region: 'Isabela', lat: 16.9830, lon: 122.0000 },
  { id: 'lz28', name: 'Sitio Palanan Road', region: 'Isabela', lat: 16.9900, lon: 122.0100 },
  { id: 'lz29', name: 'Sitio Minanga', region: 'Isabela', lat: 17.0000, lon: 122.0200 },

  // --- VISAYAS ---
  { id: 'vs1', name: 'Rubber Tree Plantation', region: 'Negros Oriental', lat: 9.5803076, lon: 122.8784393 },

  // --- MINDANAO ---
  { id: 'mn1', name: 'Naga Rubber Plantation', region: 'Zamboanga del Norte', lat: 7.9280916, lon: 122.7028968 },
  { id: 'mn2', name: 'Kuya Atet Rubber Tree Farm', region: 'Davao del Sur', lat: 6.7869023, lon: 125.3686846 },
  { id: 'mn3', name: 'Domaoan Rubber Plantation', region: 'Cotabato', lat: 7.3362825, lon: 125.0735705 },
  { id: 'mn4', name: 'Titay Rubber Tree Economic Farm', region: 'Zamboanga Sibugay', lat: 7.8713633, lon: 122.5692594 },
  { id: 'mn5', name: 'Edmon Sereguila Falcata & Rubber', region: 'Pagadian', lat: 7.9404841, lon: 123.5240857 },
  { id: 'mn6', name: 'Darwin’s Rubber Plantation', region: 'Maguindanao', lat: 6.8664746, lon: 124.1296175 },
  { id: 'mn7', name: 'Daculos Rubber Farm', region: 'Bukidnon', lat: 7.7790736, lon: 124.9003460 },
  { id: 'mn8', name: 'Block 6 Rubber Plantation', region: 'Zamboanga Sibugay', lat: 7.8648059, lon: 122.4703932 },
];

const HERO_IMAGES = [
  { id: '1', uri: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?q=80&w=1000&auto=format&fit=crop', title: 'Forest Canopy' },
  { id: '2', uri: 'https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=1000&auto=format&fit=crop', title: 'Green Path' },
  { id: '3', uri: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1000&auto=format&fit=crop', title: 'Sunlit Woods' },
  { id: '4', uri: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?q=80&w=1000&auto=format&fit=crop', title: 'Nature Deep' },
];

const HomeScreen = () => {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { unreadCount, checkWeatherAlert } = useNotification();
  const { refreshTick } = useAppRefresh();
  const mapRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAIGuide, setShowAIGuide] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [lastDataUpdatedAt, setLastDataUpdatedAt] = useState(null);
  
  // Dashboard Stats
  const [stats, setStats] = useState({
    totalTrees: 0,
    scansToday: 0,
    healthyTrees: 0,
    alerts: 0,
    rubberTrees: 0,
    estimatedLatexYield: 0,
    healthScore: 0, // Default to 0 to indicate loading/no data
    yieldHistory: [0, 0, 0, 0, 0, 0],
  });
  const [treeStats, setTreeStats] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [activeActivityFilter, setActiveActivityFilter] = useState('All');
  
  // Market Data (Random Forest)
  const [marketData, setMarketData] = useState({
    currentPrice: 0,
    trend: 'NEUTRAL',
    confidence: 0,
    priceChange: 0,
  });
  
  // Location & Weather & Farms
  const [location, setLocation] = useState(null);
  const [weather, setWeather] = useState(null);
  const [tappingAdvisory, setTappingAdvisory] = useState({ status: 'Unknown', color: '#95A5A6', message: 'Checking weather...' });
  const [farms, setFarms] = useState([]);
  const [mapRegion, setMapRegion] = useState(null);

  // Animations
  const scrollY = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
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
  
  // Menu Animation
  const menuScaleAnim = useRef(new Animated.Value(0)).current;
  const menuFadeAnim = useRef(new Animated.Value(0)).current;

  const openMenu = () => {
    setShowProfileMenu(true);
    Animated.parallel([
      Animated.spring(menuScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(menuFadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeMenu = () => {
    Animated.parallel([
      Animated.timing(menuScaleAnim, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(menuFadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => setShowProfileMenu(false));
  };

  // Hero Carousel
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Helper: Calculate Distance (Haversine)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; // Distance in km
    return d;
  };

  const deg2rad = (deg) => {
    return deg * (Math.PI/180);
  };

  const estimateTravelTime = (distanceKm) => {
    const speed = 50; // Average speed 50km/h
    const timeHours = distanceKm / speed;
    if (timeHours < 1) {
      return `${Math.round(timeHours * 60)} mins`;
    }
    return `${timeHours.toFixed(1)} hrs`;
  };

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
      
      // Initialize Map Region (Zoomed out to Philippines)
      setMapRegion({
        latitude: 12.8797,
        longitude: 121.7740,
        latitudeDelta: 12, 
        longitudeDelta: 12,
      });
      
      // Initialize Farms with Distance & Description
      const processedFarms = RUBBER_LOCATIONS.map(farm => {
        const dist = calculateDistance(loc.coords.latitude, loc.coords.longitude, farm.lat, farm.lon);
        return {
          ...farm,
          distanceKm: dist,
          distanceLabel: `${dist.toFixed(1)} km`,
          travelTime: estimateTravelTime(dist),
          description: "Premium rubber plantation with high-yield clones (PB 260). monitored for sustainable latex production.",
        };
      }).sort((a, b) => a.distanceKm - b.distanceKm); // Sort by nearest
      
      setFarms(processedFarms);

      fetchWeather(loc.coords.latitude, loc.coords.longitude);
    })();
    
    // Start entry animation
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

  const [isFirstLoad, setIsFirstLoad] = useState(true);

  useFocusEffect(
    useCallback(() => {
      // If it's not the first load, we do a silent refresh (no spinner)
      loadData(!isFirstLoad);
    }, [isFirstLoad])
  );

  const fetchWeather = async (lat, lon) => {
    try {
      const response = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
      );
      const data = response.data.current_weather;
      
      const isRain = data.weathercode >= 50;
      const windSpeed = data.windspeed; // km/h
      const temperature = data.temperature; // Celsius
      
      setWeather({
        temp: Math.round(data.temperature),
        condition: isRain ? 'Rainy' : 'Clear',
        icon: isRain ? 'cloud-rain' : 'sun',
      });

      // Check for weather alerts
      checkWeatherAlert({
        temp: Math.round(data.temperature),
        condition: isRain ? 'Rainy' : 'Clear',
        windSpeed: `${windSpeed} km/h`,
      });

      // --- Safety Advisory Logic ---
      let safetyStatus = 'Good to Tap';
      let safetyColor = theme.colors.success;
      let safetyMessage = 'Conditions are optimal.';
      let safetyDetail = 'Weather conditions are optimal - safe to proceed with tapping activities today.';

      if (isRain) {
        safetyStatus = 'Do Not Tap';
        safetyColor = theme.colors.error;
        safetyMessage = 'Rain detected.';
        safetyDetail = 'It is not safe to go outside today due to rain - please postpone tapping activities until conditions improve.';
      } else if (windSpeed > 20) {
        safetyStatus = 'High Wind';
        safetyColor = theme.colors.error; // or orange? User said red/orange.
        safetyMessage = 'High winds.';
        safetyDetail = `It is not safe to go outside today due to high winds (${windSpeed} km/h) - please postpone tapping activities until conditions improve.`;
      } else if (temperature > 35) {
        safetyStatus = 'Heat Warning';
        safetyColor = '#F59E0B'; // Orange
        safetyMessage = 'Extreme heat.';
        safetyDetail = `It is not safe to go outside today due to extreme heat (${temperature}°C) - please postpone tapping activities until conditions improve.`;
      } else if (temperature < 15) {
        safetyStatus = 'Cold Warning';
        safetyColor = '#F59E0B';
        safetyMessage = 'Low temperature.';
        safetyDetail = `It is not safe to go outside today due to low temperature (${temperature}°C) - please postpone tapping activities.`;
      }

      setTappingAdvisory({ 
        status: safetyStatus, 
        color: safetyColor, 
        message: safetyMessage,
        detail: safetyDetail, // Full message for display
        isSafe: safetyColor === theme.colors.success
      });

    } catch (error) {
      setWeather({ temp: 28, condition: 'Clear', icon: 'sun' });
      setTappingAdvisory({ 
        status: 'Unknown', 
        color: theme.colors.textLight, 
        message: 'Weather data unavailable.',
        detail: 'Unable to fetch current weather conditions. Please proceed with caution.',
        isSafe: false
      });
    }
  };

  const [activeRegion, setActiveRegion] = useState('Luzon');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  // Helper to filter farms by region
  const getFarmsByRegion = (region) => {
    // ... existing logic ...
  };

  const filteredFarms = farms.filter(f => {
    if (activeRegion === 'Luzon') return ['Nueva Vizcaya', 'Quezon', 'Aurora', 'Isabela'].includes(f.region);
    if (activeRegion === 'Visayas') return ['Negros Oriental'].includes(f.region);
    return !['Nueva Vizcaya', 'Quezon', 'Aurora', 'Isabela', 'Negros Oriental'].includes(f.region); // Rest is Mindanao
  });

  const paginatedFarms = filteredFarms.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredFarms.length / itemsPerPage);

  // Reset pagination when region changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeRegion]);

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      
      // 1. Fetch Real-time Stats
      const [treeStatsRes, latexStatsRes, scansRes, latexLogsRes, marketRes] = await Promise.all([
        treeAPI.getStats().catch(err => ({ totalTrees: 0, healthyTrees: 0, healthScore: 0 })), 
        latexAPI.getStats().catch(err => ({ totalYield: 0, monthlyYield: [0,0,0,0,0,0] })),
        scanAPI.getAll().catch(err => []),
        latexAPI.getAll().catch(err => []),
        marketAPI.getForecast().catch(err => ({ success: false }))
      ]);

      // Process Stats
      const treeStatsData = treeStatsRes.data || treeStatsRes;
      const latexStatsData = latexStatsRes.data || latexStatsRes;

      // Calculate Scans Today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const scans = Array.isArray(scansRes) ? scansRes : (scansRes?.data || []);
      const scansTodayCount = scans.filter(s => new Date(s.createdAt) >= today).length;

      const currentStats = {
        totalTrees: treeStatsData.totalTrees || 0,
        scansToday: scansTodayCount,
        healthyTrees: treeStatsData.healthyTrees || 0,
        rubberTrees: treeStatsData.totalTrees || 0,
        healthScore: treeStatsData.healthPercentage || treeStatsData.healthScore || 0,
        estimatedLatexYield: latexStatsData.totalVolume || latexStatsData.totalYield || 0,
        yieldHistory: latexStatsData.monthlyYield || [0, 0, 0, 0, 0, 0], 
        alerts: (treeStatsData.totalTrees - treeStatsData.healthyTrees) || 0,
      };
      setStats(currentStats);

      // Process Market Data
      if (marketRes.success) {
        const mData = marketRes.data || {};
        setMarketData({
          ...mData,
          currentPrice: mData.price || 0,
          priceChange: mData.priceChange || 0,
          trend: mData.trend || 'NEUTRAL',
          confidence: mData.confidence || 0,
        });
      }

      // Process Recent Activity (Merge Scans & Latex)
      // scans variable is already defined above
      const latexLogs = Array.isArray(latexLogsRes) ? latexLogsRes : (latexLogsRes?.data || []);

      const recentActivity = [
        ...scans.map(s => {
          // Handle populated treeId or string ID
          let title = 'Unknown Scan';
          const part = s.treeIdentification?.detectedPart;
          const partLabel = part ? part.charAt(0).toUpperCase() + part.slice(1) : 'Tree';

          if (s.treeId && (s.treeId.treeId || s.treeId._id)) {
              const id = s.treeId.treeId || s.treeId._id.substring(0, 8);
              title = `${partLabel} Scan #${id}`;
          } else {
              title = `New ${partLabel} Scan`;
          }

          // Determine status based on detected part
          let scanStatus = s.processingStatus;
          let statusColor = 'default'; // default, success, warning, error

          // Helper to check AI diagnosis for healthy status
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

          if (s.processingStatus === 'completed') {
             let specificStatus = null;
             const partLower = s.treeIdentification?.detectedPart?.toLowerCase();

             if (partLower === 'trunk') {
                specificStatus = s.trunkAnalysis?.healthStatus;
             } else if (partLower === 'leaf') {
                specificStatus = s.leafAnalysis?.healthStatus;
             }

             // Check AI Diagnosis override first
             const primaryDisease = s.diseaseDetection?.[0];
             const isAIHealthy = primaryDisease && aiDiagnosisSaysHealthy(primaryDisease.ai_diagnosis);

             // Use specific status if available and valid
             if (specificStatus && specificStatus !== 'Unknown') {
                scanStatus = specificStatus;
             } else if (s.diseaseDetection?.length > 0) {
                // Fallback to disease detection
                const diseaseName = s.diseaseDetection[0].name;
                
                if (isAIHealthy) {
                    scanStatus = 'Healthy';
                } else {
                    scanStatus = (diseaseName === 'No disease detected' || diseaseName === 'None') 
                      ? 'Healthy' 
                      : diseaseName;
                }
             } else {
                scanStatus = 'Healthy';
             }
          }

          // Capitalize & Color Logic
          if (scanStatus && typeof scanStatus === 'string') {
            scanStatus = scanStatus.charAt(0).toUpperCase() + scanStatus.slice(1);
            if (['Healthy', 'Good', 'Excellent'].includes(scanStatus)) statusColor = 'success';
            else if (['Warning', 'Fair'].includes(scanStatus)) statusColor = 'warning';
            else statusColor = 'error';
          }

          return {
            id: `scan-${s._id}`,
            type: 'scan',
            title: title,
            time: new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), 
            status: scanStatus,
            statusColor,
            rawDate: new Date(s.createdAt),
            detectedPart: s.treeIdentification?.detectedPart || 'whole_tree',
            data: s
          };
        }),
        ...latexLogs.map(l => ({
          id: `latex-${l._id}`,
          type: 'latex',
          title: 'Latex Collection',
          time: new Date(l.date || l.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          status: `${(l.quantityEstimation?.volume || l.volume || l.totalVolume || 0).toFixed(1)}L`,
          statusColor: 'info',
          rawDate: new Date(l.date || l.createdAt),
          data: l
        }))
      ]
      .sort((a, b) => b.rawDate - a.rawDate)
      .slice(0, 20); // Increase slice to allow filtering

      setRecentScans(recentActivity);
      setLastDataUpdatedAt(new Date().toISOString());
      
      // Mark first load as complete
      if (!silent) setIsFirstLoad(false);

    } catch (e) {
      console.error("Failed to load dashboard data", e);
      // Keep silent on error to not disrupt UI, just show empty/default
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

  useEffect(() => {
    if (refreshTick === 0) return;
    loadData(true);
  }, [refreshTick]);

  const handleMarkerPress = (farm) => {
    mapRef.current?.animateToRegion({
      latitude: farm.lat,
      longitude: farm.lon,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 1000);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good Morning,' : hour < 18 ? 'Good Afternoon,' : 'Good Evening,';
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
        <View style={styles.stickyHeaderContent}>
          <Text style={styles.stickyHeaderTitle}>Dashboard</Text>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={50} />
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
            renderItem={({ item }) => (
              <Image source={{ uri: item.uri }} style={styles.heroImage} resizeMode="cover" />
            )}
          />
          <LinearGradient
            colors={['rgba(47, 79, 79, 0.4)', 'transparent', 'rgba(47, 79, 79, 0.9)']}
            style={styles.heroOverlay}
          >
            {/* Top Bar */}
            <View style={styles.topBar}>
              <TouchableOpacity 
                style={styles.userInfo} 
                onPress={openMenu}
              >
                <Image 
                  source={{ uri: user?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}` }} 
                  style={styles.avatar} 
                />
                <View style={styles.userText}>
                  <Text style={styles.greeting}>{getGreeting()}</Text>
                  <Text style={styles.username}>{user?.name?.split(' ')[0] || 'Grower'}</Text>
                </View>
              </TouchableOpacity>
              
              <View style={styles.headerActions}>
                {/* Repositioned Chatbot - Transparent */}
                <TouchableOpacity 
                  style={styles.iconButton} 
                  onPress={() => navigation.navigate('Chatbot')}
                >
                  <MaterialCommunityIcons name="robot-happy-outline" size={24} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.iconButton}
                  onPress={() => navigation.navigate('Notifications')}
                >
                  <Ionicons name="notifications-outline" size={24} color="#fff" />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={{color: '#fff', fontSize: 8, fontWeight: 'bold'}}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Hero Stats */}
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
              
              {/* Dynamic Weather Safety Advisory */}
              {tappingAdvisory.detail && (
                <View style={[
                  styles.advisoryContainer, 
                  { 
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                    flexDirection: 'column',
                    alignItems: 'stretch',
                  }
                ]}>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                    <MaterialCommunityIcons name="robot-outline" size={16} color="#A7F3D0" style={{marginRight: 6}} />
                    <Text style={{color: '#A7F3D0', fontSize: 12, fontWeight: '700', letterSpacing: 0.5}}>AI WEATHER INSIGHT</Text>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
                    <MaterialCommunityIcons 
                      name={tappingAdvisory.isSafe ? 'check-circle' : 'alert-circle'} 
                      size={20} 
                      color={tappingAdvisory.isSafe ? '#34D399' : '#F87171'} 
                      style={{marginRight: 8, marginTop: 1}}
                    />
                    <Text style={[
                      styles.advisoryMessage, 
                      { color: '#ffffff', flex: 1, flexWrap: 'wrap' }
                    ]}>
                      {tappingAdvisory.detail}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>

        {/* MAIN CONTENT LAYER */}
        <Animated.View style={[
          styles.contentLayer, 
          { opacity: fadeAnim, transform: [{ translateY: contentTranslateY }] }
        ]}>
          
          {/* ASK RUBBER AI BANNER */}
          <TouchableOpacity 
            style={styles.aiBanner}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('Chatbot')}
          >
            <LinearGradient
              colors={['#0F766E', '#115E59']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={styles.aiBannerGradient}
            >
              <View style={styles.aiBannerContent}>
                 <View style={styles.aiBannerTextContainer}>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 4}}>
                       <Ionicons name="sparkles" size={16} color="#FDE68A" />
                       <Text style={styles.aiBannerLabel}>ASK RUBBER AI</Text>
                    </View>
                    <Text style={styles.aiBannerTitle}>Get Latest Rubber Updates</Text>
                    <Text style={styles.aiBannerSubtitle}>Ask about market trends, tree health, and tapping advice.</Text>
                 </View>
                 <View style={styles.aiBannerIcon}>
                    <MaterialCommunityIcons name="robot-happy" size={32} color="#FDE68A" />
                 </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* QUICK ACTIONS */}
          <View style={styles.quickActionsContainer}>
            <View style={styles.quickActionsGrid}>
              {[
                { label: 'New Scan', icon: 'scan-outline', route: 'Camera', color: theme.colors.primary },
                { label: 'Log Latex', icon: 'water-outline', route: 'History', params: { initialTab: 'latex' }, color: theme.colors.secondary },
                { label: 'Add Tree', icon: 'add-circle-outline', route: 'AddTree', color: theme.colors.text },
                { label: 'Reports', icon: 'document-text-outline', route: 'History', color: theme.colors.textSecondary },
              ].map((action, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.actionChipCentered}
                  onPress={() => navigation.navigate(action.route, action.params)}
                >
                  <View style={[styles.actionIconCircle, { borderColor: action.color }]}>
                    <Ionicons name={action.icon} size={22} color={action.color} />
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* DASHBOARD GRID */}
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.bentoRow}>
             {/* Health Card */}
             <TouchableOpacity style={styles.bentoCard} activeOpacity={0.9}>
                <View style={styles.cardHeaderSimple}>
                  <MaterialCommunityIcons name="heart-pulse" size={24} color={theme.colors.primary} />
                  <Text style={styles.cardBigValue}>{stats.healthScore}%</Text>
                </View>
                <Text style={styles.cardLabel}>Orchard Health</Text>
             </TouchableOpacity>

             {/* Yield Card */}
             <TouchableOpacity style={styles.bentoCard} activeOpacity={0.9}>
                <View style={styles.cardHeaderSimple}>
                  <MaterialIcons name="opacity" size={24} color={theme.colors.secondary} />
                  <Text style={styles.cardBigValue}>{stats.estimatedLatexYield}</Text>
                </View>
                <Text style={styles.cardLabel}>Est. Yield (kg)</Text>
             </TouchableOpacity>
          </View>

          {/* MARKET PRICE WIDGET (Replaces Yield Chart) */}
          <TouchableOpacity 
            style={styles.chartCard}
            activeOpacity={0.9} 
            onPress={() => navigation.navigate('Market')}
          >
            <View style={styles.chartHeader}>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                <Feather name="trending-up" size={20} color={theme.colors.primary} style={{marginRight:8}}/>
                <Text style={styles.chartTitle}>Market Price (Real-time)</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
            </View>
            
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingBottom: 10}}>
               <View>
                  <Text style={{fontSize: 32, fontWeight: '700', color: theme.colors.text}}>₱{(marketData.currentPrice || 0).toFixed(2)}</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                     <Feather name={marketData.trend === 'RISE' ? 'arrow-up-right' : 'arrow-down-right'} size={16} color={marketData.trend === 'RISE' ? theme.colors.success : theme.colors.error} />
                     <Text style={{marginLeft: 4, color: marketData.trend === 'RISE' ? theme.colors.success : theme.colors.error, fontWeight: '600'}}>
                       {marketData.priceChange}%
                     </Text>
                     <Text style={{marginLeft: 8, color: theme.colors.textSecondary, fontSize: 12}}>Last 24h</Text>
                  </View>
               </View>
               
               <View style={{alignItems: 'flex-end'}}>
                  <Text style={{fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4}}>AI Confidence</Text>
                  <View style={{backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border}}>
                     <Text style={{fontWeight: '700', color: theme.colors.primary}}>{marketData.confidence}%</Text>
                  </View>
               </View>
            </View>
          </TouchableOpacity>

          {/* MAP SECTION & FARM LIST */}
          <Text style={styles.sectionTitle}>Rubber Locations</Text>
          <View style={styles.mapCard}>
            {location ? (
              <MapView
                ref={mapRef}
                style={styles.mapView}
                initialRegion={mapRegion}
                provider={PROVIDER_DEFAULT}
              >
                {/* User Marker */}
                <Marker coordinate={location.coords}>
                  <View style={styles.userMarker}>
                    <View style={styles.userMarkerDot} />
                    <View style={styles.userMarkerRing} />
                  </View>
                </Marker>

                {/* Farm Markers */}
                {farms.map(farm => (
                  <Marker
                    key={farm.id}
                    coordinate={{ latitude: farm.lat, longitude: farm.lon }}
                    onPress={() => handleMarkerPress(farm)}
                  >
                    <View style={styles.customMarker}>
                      <MaterialCommunityIcons name="sprout" size={20} color={theme.colors.primary} />
                    </View>
                    <Callout tooltip>
                      <View style={styles.calloutContainer}>
                        <Text style={styles.calloutTitle}>{farm.name}</Text>
                        <Text style={styles.calloutText}>{farm.region}</Text>
                        <Text style={styles.calloutDesc} numberOfLines={2}>{farm.description}</Text>
                        <View style={styles.calloutDivider} />
                        <View style={styles.calloutRow}>
                          <Text style={styles.calloutDetail}>📍 {farm.distanceLabel}</Text>
                          <Text style={styles.calloutDetail}>🚗 {farm.travelTime}</Text>
                        </View>
                      </View>
                    </Callout>
                  </Marker>
                ))}
              </MapView>
            ) : (
              <View style={styles.mapPlaceholder}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.loadingText}>Locating...</Text>
              </View>
            )}
            
            {/* Map Controls Overlay */}
            <View style={styles.mapControls}>
              <TouchableOpacity style={styles.mapControlBtn} onPress={() => {
                // Zoom out to Philippines
                 mapRef.current?.animateToRegion({
                    latitude: 12.8797,
                    longitude: 121.7740,
                    latitudeDelta: 12,
                    longitudeDelta: 12,
                }, 1000);
              }}>
                <MaterialCommunityIcons name="map-legend" size={20} color={theme.colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mapControlBtn, { marginTop: 8 }]} onPress={() => {
                // Zoom to user
                if(location) mapRef.current?.animateToRegion({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05
                }, 1000);
              }}>
                <MaterialIcons name="my-location" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* FARM DIRECTORY LIST (PAGINATED) */}
          <View style={styles.farmListContainer}>
            <View style={styles.regionTabs}>
              {['Luzon', 'Visayas', 'Mindanao'].map(region => (
                <TouchableOpacity 
                  key={region} 
                  style={[styles.regionTab, activeRegion === region && styles.regionTabActive]}
                  onPress={() => setActiveRegion(region)}
                >
                  <Text style={[styles.regionTabText, activeRegion === region && styles.regionTabTextActive]}>
                    {region}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.farmList}>
              {paginatedFarms.map((farm, index) => (
                <TouchableOpacity key={farm.id} style={styles.farmItem} onPress={() => handleMarkerPress(farm)}>
                  <View style={styles.farmIcon}>
                    <MaterialCommunityIcons name="map-marker-radius" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={styles.farmInfo}>
                    <Text style={styles.farmName}>{farm.name}</Text>
                    <Text style={styles.farmRegion}>{farm.region} • {farm.distanceLabel}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ))}
              
              {filteredFarms.length === 0 && (
                <Text style={styles.emptyStateText}>No farms found in this region.</Text>
              )}

              {/* Pagination Controls */}
              {filteredFarms.length > 0 && (
                <View style={styles.paginationContainer}>
                   <TouchableOpacity 
                      disabled={currentPage === 1} 
                      onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                      style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
                   >
                     <MaterialIcons name="chevron-left" size={24} color={currentPage === 1 ? '#ccc' : theme.colors.primary} />
                   </TouchableOpacity>

                   <View style={styles.pageNumbers}>
                     {Array.from({ length: Math.min(4, totalPages) }, (_, i) => i + 1).map(page => (
                        <TouchableOpacity 
                          key={page}
                          onPress={() => setCurrentPage(page)}
                          style={[styles.pageNumber, currentPage === page && styles.pageNumberActive]}
                        >
                          <Text style={[styles.pageText, currentPage === page && styles.pageTextActive]}>{page}</Text>
                        </TouchableOpacity>
                     ))}
                     {totalPages > 4 && <Text style={styles.pageText}>...</Text>}
                   </View>

                   <TouchableOpacity 
                      disabled={currentPage === totalPages} 
                      onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
                   >
                     <MaterialIcons name="chevron-right" size={24} color={currentPage === totalPages ? '#ccc' : theme.colors.primary} />
                   </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* RECENT ACTIVITY */}
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <Text style={[styles.sectionTitle, {marginBottom: 0}]}>Recent Activity</Text>
            <Text style={styles.updatedLabel}>
              {lastDataUpdatedAt
                ? `Updated ${new Date(lastDataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Syncing...'}
            </Text>
          </View>
          
          {/* Filter Chips */}
          <View style={{ marginBottom: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
              {['All', 'Latex', 'Leaf', 'Trunk'].map(filter => (
                <TouchableOpacity
                  key={filter}
                  style={[
                    styles.filterChip, 
                    activeActivityFilter === filter && styles.filterChipActive
                  ]}
                  onPress={() => setActiveActivityFilter(filter)}
                >
                  <Text style={[
                    styles.filterChipText,
                    activeActivityFilter === filter && styles.filterChipTextActive
                  ]}>{filter}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.activityCard}>
            {(recentScans.length > 0 ? recentScans : [])
            .filter(item => {
                 if (activeActivityFilter === 'All') return true;
                 if (activeActivityFilter === 'Latex') return item.type === 'latex';
                 if (activeActivityFilter === 'Leaf') return item.type === 'scan' && item.detectedPart === 'leaf';
                 if (activeActivityFilter === 'Trunk') return item.type === 'scan' && item.detectedPart === 'trunk';
                 return true;
            })
            .slice(0, 5)
            .map((item, index, arr) => (
              <TouchableOpacity 
                key={item.id || index} 
                activeOpacity={0.7}
                style={[
                  styles.premiumActivityCard, 
                  index !== arr.length - 1 && styles.cardDivider
                ]}
                onPress={() => {
                  if (item.type === 'scan' && item.data) navigation.navigate('ScanDetail', { scan: item.data });
                  if (item.type === 'latex' && item.data) navigation.navigate('LatexDetail', { batch: item.data });
                }}
              >
                {/* Icon Section */}
                <View style={[
                  styles.premiumIconContainer, 
                  { backgroundColor: item.type === 'alert' ? '#FEF2F2' : item.type === 'latex' ? '#F0F9FF' : '#F0FDF4' }
                ]}>
                  <MaterialCommunityIcons 
                    name={item.type === 'scan' ? 'line-scan' : item.type === 'latex' ? 'water-outline' : 'alert-circle-outline'} 
                    size={22} 
                    color={item.type === 'alert' ? theme.colors.error : item.type === 'latex' ? '#0EA5E9' : theme.colors.primary} 
                  />
                </View>

                {/* Text Content */}
                <View style={styles.premiumTextContainer}>
                  <Text style={styles.premiumTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.premiumSubtitle}>{item.time}</Text>
                </View>

                {/* Status Badge */}
                <View style={[
                  styles.premiumBadge, 
                  { 
                    backgroundColor: item.statusColor === 'success' ? '#DCFCE7' 
                      : item.statusColor === 'warning' ? '#FEF3C7' 
                      : item.statusColor === 'error' ? '#FEE2E2' 
                      : '#F1F5F9' 
                  }
                ]}>
                   <Text style={[
                     styles.premiumBadgeText,
                     {
                       color: item.statusColor === 'success' ? '#166534' 
                         : item.statusColor === 'warning' ? '#92400E' 
                         : item.statusColor === 'error' ? '#991B1B' 
                         : '#475569'
                     }
                   ]}>{item.status}</Text>
                </View>
                
                {/* Chevron */}
                <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            ))}
            
            {recentScans.length > 0 && recentScans.filter(item => {
                 if (activeActivityFilter === 'All') return true;
                 if (activeActivityFilter === 'Latex') return item.type === 'latex';
                 if (activeActivityFilter === 'Leaf') return item.type === 'scan' && item.detectedPart === 'leaf';
                 if (activeActivityFilter === 'Trunk') return item.type === 'scan' && item.detectedPart === 'trunk';
                 return true;
            }).length === 0 && (
               <Text style={{textAlign: 'center', padding: 20, color: theme.colors.textSecondary}}>No recent {activeActivityFilter.toLowerCase()} activity.</Text>
            )}

            <TouchableOpacity style={styles.viewAllBtn} onPress={() => navigation.navigate('History', { initialTab: activeActivityFilter === 'Latex' ? 'latex' : 'trees' })}>
              <Text style={styles.viewAllText}>View All History</Text>
              <Ionicons name="arrow-forward" size={14} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

        </Animated.View>
      </Animated.ScrollView>

      {/* AI Guide Overlay (No Floating Button) */}
      <AIGuide visible={showAIGuide} onDismiss={() => setShowAIGuide(false)} />

      {/* Profile Menu Dropdown */}
      <Modal
        visible={showProfileMenu}
        transparent={true}
        animationType="none"
        onRequestClose={closeMenu}
      >
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.modalOverlay}>
            <Animated.View style={[
              styles.menuContainer, 
              { 
                opacity: menuFadeAnim,
                transform: [
                  { scale: menuScaleAnim },
                  { translateY: menuScaleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0]
                    }) 
                  }
                ]
              }
            ]}>
              <View style={styles.menuArrow} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); navigation.navigate('Market'); }}>
                <MaterialCommunityIcons name="store" size={20} color={theme.colors.text} style={styles.menuIcon} />
                <Text style={styles.menuText}>Market Page</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); navigation.navigate('Profile', { showAbout: true }); }}>
                <MaterialCommunityIcons name="information" size={20} color={theme.colors.text} style={styles.menuIcon} />
                <Text style={styles.menuText}>About Us</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); logout(); }}>
                <MaterialCommunityIcons name="logout" size={20} color={theme.colors.error} style={styles.menuIcon} />
                <Text style={[styles.menuText, { color: theme.colors.error }]}>Log Out</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    backgroundColor: theme.colors.primary,
  },
  stickyHeaderContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 12,
    alignItems: 'center',
  },
  stickyHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  
  // Hero
  heroSection: {
    height: 320, // Reduced height for minimalism
    width: SCREEN_WIDTH,
    position: 'relative',
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: 320,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 60,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fff',
  },
  userText: {
    marginLeft: 12,
  },
  greeting: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  username: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.error,
    borderWidth: 1,
    borderColor: '#fff',
  },
  heroContent: {
    marginBottom: 10,
  },
  weatherContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'center',
  },
  weatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 10,
  },
  weatherText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  advisoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  advisoryText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  advisoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  advisoryMessage: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },

  // Content Layer
  contentLayer: {
    marginTop: -30,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 30,
    minHeight: 500,
  },

  // Quick Actions
  quickActionsContainer: {
    marginBottom: 30,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    marginTop: 10,
  },
  quickActionsScroll: {
    paddingRight: 20,
  },
  actionChip: {
    alignItems: 'center',
    marginRight: 24,
  },
  actionChipCentered: {
    alignItems: 'center',
    width: 80,
    marginBottom: 10,
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.text,
  },

  // Bento Cards (Minimalist)
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
  },
  updatedLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  bentoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bentoCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderSimple: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardBigValue: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
  },
  cardLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },

  // Map
  mapCard: {
    height: 280, // Taller for better view
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E0E0E0',
    marginBottom: 30,
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
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.info, // Blue dot
    borderWidth: 2,
    borderColor: '#fff',
  },
  customMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  calloutContainer: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    width: 200,
  },
  calloutTitle: {
    fontWeight: '700',
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 2,
  },
  calloutText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  calloutDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 6,
  },
  calloutDetail: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  mapControls: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  mapControlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  // Menu Modal (Dropdown Style)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent', // Transparent overlay
  },
  menuContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 90,
    left: 24,
    width: 220,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  menuArrow: {
    position: 'absolute',
    top: -6,
    left: 20,
    width: 12,
    height: 12,
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }],
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
  },
  menuIcon: {
    marginRight: 12,
  },
  menuText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  
  // Chart Section
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 30,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },

  // Recent Activity
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    paddingBottom: 10,
    marginBottom: 40,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  viewAllBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Premium Activity Card Styles
  premiumActivityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  cardDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  premiumIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  premiumTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  premiumTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  premiumSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  premiumBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  premiumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  premiumStatusContainer: {
     flexDirection: 'row',
     alignItems: 'center',
  },
  
  // Farm Directory
  farmListContainer: {
    marginBottom: 30,
  },
  regionTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    justifyContent: 'space-between',
  },
  regionTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  regionTabActive: {
    backgroundColor: theme.colors.primary,
  },
  regionTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  regionTabTextActive: {
    color: '#fff',
  },
  farmList: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  farmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  farmIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAFAF1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  farmInfo: {
    flex: 1,
  },
  farmName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  farmRegion: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  emptyStateText: {
    textAlign: 'center',
    padding: 20,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  menuDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 8,
    width: '100%',
  },
  
  // Pagination
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 8,
  },
  pageBtn: {
    padding: 8,
  },
  pageBtnDisabled: {
    opacity: 0.3,
  },
  pageNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  pageNumber: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    marginHorizontal: 4,
  },
  pageNumberActive: {
    backgroundColor: theme.colors.primary,
  },
  pageText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  pageTextActive: {
    color: '#fff',
  },

  // AI Banner
  aiBanner: {
    marginBottom: 24,
    borderRadius: 20,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  aiBannerGradient: {
    borderRadius: 20,
    padding: 1,
  },
  aiBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  aiBannerTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  aiBannerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FDE68A',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  aiBannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  aiBannerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  aiBannerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});

export default HomeScreen;
