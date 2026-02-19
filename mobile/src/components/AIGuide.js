import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../styles/theme';

const { width } = Dimensions.get('window');

const GUIDES = [
  {
    id: 'welcome',
    text: "Welcome back! Check your latest yield forecast.",
    target: 'yield-card',
  },
  {
    id: 'weather',
    text: "Rain is expected later. Tap here for advisory.",
    target: 'weather-widget',
  },
  {
    id: 'scan',
    text: "Ready to scan? Tap 'New Scan' in the dashboard to start.",
    target: 'quick-actions',
  },
];

const AIGuide = ({ visible, onDismiss }) => {
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      // Entrance animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-advance or pulse logic could go here
    }
  }, [visible]);

  const handleNext = () => {
    if (step < GUIDES.length - 1) {
      setStep(prev => prev + 1);
    } else {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
      setStep(0);
    });
  };

  if (!visible) return null;

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }
      ]}
    >
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bubble}
      >
        <View style={styles.header}>
          <View style={styles.aiIcon}>
            <Ionicons name="sparkles" size={16} color="#FFD700" />
          </View>
          <Text style={styles.title}>AI Assistant</Text>
          <TouchableOpacity onPress={handleDismiss} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        
        <Text style={styles.message}>
          {GUIDES[step].text}
        </Text>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {GUIDES.map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.dot, 
                  i === step && styles.activeDot
                ]} 
              />
            ))}
          </View>
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextText}>{step === GUIDES.length - 1 ? 'Done' : 'Next'}</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </LinearGradient>
      
      {/* Pointer/Triangle */}
      <View style={styles.triangle} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // Above FAB usually
    left: 20,
    right: 20,
    zIndex: 1000,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
  bubble: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiIcon: {
    marginRight: 8,
  },
  title: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  message: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  activeDot: {
    backgroundColor: '#fff',
    width: 18,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  nextText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10, // Pointing up? No, usually bubble is above target
    borderTopWidth: 10, // Pointing down
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: theme.colors.primaryDark, // Match gradient bottom
    marginTop: -1, // Overlap slightly
  }
});

export default AIGuide;
