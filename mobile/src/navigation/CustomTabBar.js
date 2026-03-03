import React, { useEffect, useRef, useState } from 'react';
import { 
  View, 
  TouchableOpacity, 
  StyleSheet, 
  Animated, 
  Dimensions, 
  Platform,
  Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../styles/theme';

const { width } = Dimensions.get('window');

// 🎨 Premium Tab Bar Configuration
const TAB_BAR_WIDTH = width > 500 ? 500 : width * 0.92; // Responsive width constraint
const TAB_HEIGHT = 72;
const ACTIVE_SCALE = 1.1;
const INACTIVE_SCALE = 1.0;

const CustomTabBar = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const focusedOptions = descriptors[state.routes[state.index].key].options;

  if (focusedOptions.tabBarStyle?.display === 'none') {
    return null;
  }

  // Keep the tab bar above the keyboard instead of letting it be overlapped.
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const baseBottom = Platform.OS === 'ios'
    ? Math.max(insets.bottom, 20)
    : Math.max(insets.bottom, 16);

  useEffect(() => {
    const resolveKeyboardHeight = (event) => {
      if (!event?.endCoordinates) {
        return 0;
      }

      if (Platform.OS === 'ios') {
        const windowHeight = Dimensions.get('window').height;
        const keyboardY = event.endCoordinates.screenY ?? windowHeight;
        return Math.max(windowHeight - keyboardY, 0);
      }

      return Math.max(event.endCoordinates.height ?? 0, 0);
    };

    const animateKeyboardOffset = (height, duration = 250) => {
      Animated.timing(keyboardOffset, {
        toValue: height,
        duration,
        useNativeDriver: false,
      }).start();
    };

    const handleKeyboardShow = (event) => {
      const height = resolveKeyboardHeight(event);
      setIsKeyboardVisible(height > 0);
      animateKeyboardOffset(height, event?.duration ?? 250);
    };

    const handleKeyboardHide = (event) => {
      setIsKeyboardVisible(false);
      animateKeyboardOffset(0, event?.duration ?? 200);
    };

    const listeners = Platform.OS === 'ios'
      ? [
          Keyboard.addListener('keyboardWillShow', handleKeyboardShow),
          Keyboard.addListener('keyboardWillChangeFrame', handleKeyboardShow),
          Keyboard.addListener('keyboardWillHide', handleKeyboardHide),
        ]
      : [
          Keyboard.addListener('keyboardDidShow', handleKeyboardShow),
          Keyboard.addListener('keyboardDidHide', handleKeyboardHide),
        ];

    return () => {
      listeners.forEach((listener) => listener.remove());
    };
  }, [keyboardOffset]);

  const containerBottom = Animated.add(keyboardOffset, baseBottom);
  const shouldHideOnKeyboard = Boolean(focusedOptions.tabBarHideOnKeyboard && isKeyboardVisible);
  const containerOpacity = shouldHideOnKeyboard ? 0 : 1;

  return (
    <Animated.View
      style={[styles.container, { bottom: containerBottom, opacity: containerOpacity }]}
      pointerEvents={shouldHideOnKeyboard ? 'none' : 'auto'}
    >
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
    </Animated.View>
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
