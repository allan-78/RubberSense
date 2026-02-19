import React, { useEffect, useRef, useState } from 'react';
import { 
  View, 
  TouchableOpacity, 
  StyleSheet, 
  Animated, 
  Dimensions, 
  Platform,
  Text
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../styles/theme';

const { width } = Dimensions.get('window');

// 🎨 Premium Tab Bar Configuration
const TAB_BAR_WIDTH = width > 500 ? 500 : width * 0.92; // Responsive width constraint
const TAB_HEIGHT = 72;
const ACTIVE_SCALE = 1.1;
const INACTIVE_SCALE = 1.0;

const CustomTabBar = ({ state, descriptors, navigation }) => {
  const focusedOptions = descriptors[state.routes[state.index].key].options;

  if (focusedOptions.tabBarStyle?.display === 'none') {
    return null;
  }

  // Animation for the active tab indicator
  const translateX = useRef(new Animated.Value(0)).current;
  const [layout, setLayout] = useState([]);

  // Calculate tab width based on number of tabs (excluding the center camera button logic if handled differently, but here we treat it as 5 items)
  const tabWidth = TAB_BAR_WIDTH / state.routes.length;

  useEffect(() => {
    // Animate the indicator when index changes
    Animated.spring(translateX, {
      toValue: state.index * tabWidth,
      useNativeDriver: true,
      damping: 15,
      stiffness: 100,
    }).start();
  }, [state.index, tabWidth]);

  return (
    <View style={styles.container}>
      <View style={styles.barWrapper}>
        {/* Animated Background Indicator (Optional: Can be removed for a cleaner look, or kept for "active state" background) */}
        {/* <Animated.View 
          style={[
            styles.activeIndicator, 
            { 
              width: tabWidth,
              transform: [{ translateX }] 
            }
          ]} 
        /> */}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          // Icon Mapping
          const getIconName = () => {
            switch (route.name) {
              case 'Home': return isFocused ? 'home' : 'home-outline';
              case 'History': return isFocused ? 'time' : 'time-outline';
              case 'Blog': return isFocused ? 'grid' : 'grid-outline';
              case 'Profile': return isFocused ? 'person' : 'person-outline';
              default: return 'ellipse-outline';
            }
          };

          // Label Mapping
          const getLabel = () => {
             switch (route.name) {
              case 'Home': return 'Home';
              case 'History': return 'History';
              case 'Blog': return 'Menu';
              case 'Profile': return 'Profile';
              default: return '';
            }
          };

          // --- Center Scan Button (Floating) ---
          if (route.name === 'Camera') {
            return (
              <View key={index} style={styles.centerButtonContainer} pointerEvents="box-none">
                 <TouchableOpacity
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={styles.scanButtonWrapper}
                  activeOpacity={0.85}
                >
                  <View style={styles.scanButton}>
                    <Ionicons name="scan" size={28} color="#FFF" />
                  </View>
                </TouchableOpacity>
              </View>
            );
          }

          // --- Standard Tab Item ---
          return (
            <TouchableOpacity
              key={index}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabItem}
            >
              <Animated.View style={{ 
                alignItems: 'center',
                transform: [{ scale: isFocused ? ACTIVE_SCALE : INACTIVE_SCALE }]
              }}>
                <Ionicons 
                  name={getIconName()} 
                  size={24} 
                  color={isFocused ? theme.colors.primary : theme.colors.textLight} 
                />
                {isFocused && (
                  <View style={styles.activeDot} />
                )}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 34 : 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 1000, // Ensure it's above everything
  },
  barWrapper: {
    flexDirection: 'row',
    width: TAB_BAR_WIDTH,
    height: TAB_HEIGHT,
    backgroundColor: '#FFFFFF', // Clean White
    borderRadius: 24, // Soft rounded corners
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    
    // Premium Shadow (Elevation + iOS Shadow)
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)', // Glass border effect
  },
  tabItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonContainer: {
    width: 70, 
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scanButtonWrapper: {
    top: -25, // Float effectively
    shadowColor: theme.colors.secondary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  scanButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.secondary, // Uses the Sage/Secondary color for contrast
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF', // White ring to separate from background
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
    marginTop: 4,
  },
});

export default CustomTabBar;
