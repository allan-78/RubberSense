import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  useWindowDimensions, 
  Image, 
  TouchableOpacity,
  Animated 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';
import CustomButton from '../components/CustomButton';
import { useAuth } from '../context/AuthContext';

const ONBOARDING_DATA = [
  {
    id: '1',
    title: 'Welcome to RubberSense',
    description: 'The ultimate tool for modern rubber farming management and analysis.',
    icon: 'leaf',
  },
  {
    id: '2',
    title: 'Smart Scanning',
    description: 'Analyze tree health and latex quality instantly using our advanced AI camera.',
    icon: 'scan-circle',
  },
  {
    id: '3',
    title: 'Track Yields',
    description: 'Monitor your production history and optimize your orchard based on data.',
    icon: 'stats-chart',
  },
];

const OnboardingScreen = ({ navigation }) => {
  const { width } = useWindowDimensions();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const { completeOnboarding } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current; // For button entrance

  const viewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  // Animate button when on last slide
  React.useEffect(() => {
    if (currentIndex === ONBOARDING_DATA.length - 1) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [currentIndex]);

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleFinish = async (params) => {
    await completeOnboarding();
    navigation.navigate('Login', params);
  };

  const scrollTo = () => {
    if (currentIndex < ONBOARDING_DATA.length - 1) {
      flatListRef.current.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleFinish();
    }
  };

  const renderItem = ({ item, index }) => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    
    // Parallax effects
    const iconTranslateY = scrollX.interpolate({
      inputRange,
      outputRange: [50, 0, 50],
      extrapolate: 'clamp',
    });

    const textTranslateY = scrollX.interpolate({
      inputRange,
      outputRange: [100, 0, 100],
      extrapolate: 'clamp',
    });

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0, 1, 0],
      extrapolate: 'clamp',
    });

    return (
      <View style={[styles.itemContainer, { width }]}>
        <Animated.View 
          style={[
            styles.iconContainer, 
            { 
              transform: [{ translateY: iconTranslateY }],
              opacity 
            }
          ]}
        >
          <LinearGradient
            colors={theme.gradients.primary}
            style={styles.iconBackground}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name={item.icon} size={64} color="#FFF" />
          </LinearGradient>
          {/* Decorative Ring */}
          <View style={styles.iconRing} />
        </Animated.View>
        
        <Animated.View 
          style={[
            styles.textContainer,
            { 
              transform: [{ translateY: textTranslateY }],
              opacity
            }
          ]}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </Animated.View>
      </View>
    );
  };

  // Background Parallax
  const shape1Translate = scrollX.interpolate({
    inputRange: [0, width * (ONBOARDING_DATA.length - 1)],
    outputRange: [0, -100],
  });

  const shape2Translate = scrollX.interpolate({
    inputRange: [0, width * (ONBOARDING_DATA.length - 1)],
    outputRange: [0, 100],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.background, theme.colors.surface]}
        style={styles.background}
      />
      
      {/* Abstract Background Shapes */}
      <Animated.View 
        style={[
          styles.shape1,
          { transform: [{ translateX: shape1Translate }, { rotate: '15deg' }] }
        ]} 
      />
      <Animated.View 
        style={[
          styles.shape2,
          { transform: [{ translateX: shape2Translate }, { rotate: '-15deg' }] }
        ]} 
      />
      
      <View style={{ flex: 3 }}>
        <FlatList
          data={ONBOARDING_DATA}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          bounces={false}
          keyExtractor={(item) => item.id}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: false,
          })}
          scrollEventThrottle={32}
          onViewableItemsChanged={viewableItemsChanged}
          viewabilityConfig={viewConfig}
          ref={flatListRef}
        />
      </View>

      <View style={styles.paginator}>
        {ONBOARDING_DATA.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [10, 20, 10],
            extrapolate: 'clamp',
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={i.toString()}
              style={[
                styles.dot,
                { width: dotWidth, opacity },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.bottomSheet}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <CustomButton
            title="Get Started"
            onPress={() => handleFinish({ isRegister: true })}
            style={styles.button}
            borderRadius={16}
          />
        </Animated.View>
        
        <TouchableOpacity 
          onPress={() => handleFinish({ isRegister: false })}
          style={styles.loginLink}
        >
          <Text style={styles.loginText}>
            Already have an account? <Text style={styles.loginTextBold}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  itemContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  shape1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: theme.colors.primary,
    opacity: 0.05,
  },
  shape2: {
    position: 'absolute',
    bottom: 100,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: theme.colors.secondary,
    opacity: 0.05,
  },
  iconContainer: {
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBackground: {
    width: 120,
    height: 120,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.lg,
    zIndex: 2,
  },
  iconRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    opacity: 0.2,
    zIndex: 1,
    transform: [{ rotate: '45deg' }],
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  paginator: {
    flexDirection: 'row',
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginHorizontal: 6,
  },
  bottomSheet: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 40,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  button: {
    marginBottom: 20,
    ...theme.shadows.lg,
  },
  loginLink: {
    padding: 10,
    alignItems: 'center',
  },
  loginText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  loginTextBold: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});

export default OnboardingScreen;
