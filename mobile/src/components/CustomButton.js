import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../styles/theme';

const CustomButton = ({ 
  title, 
  onPress, 
  variant = 'primary', // primary, secondary, outline, danger
  size = 'md', // sm, md, lg
  icon, 
  loading = false, 
  disabled = false,
  style,
  textStyle,
  borderRadius
}) => {
  
  const getColors = () => {
    if (disabled) return [theme.colors.textLight, theme.colors.textLight];
    
    switch (variant) {
      case 'primary':
        return theme.gradients.primary;
      case 'secondary':
        return [theme.colors.secondary, theme.colors.secondary];
      case 'danger':
        return [theme.colors.error, '#DC2626'];
      case 'outline':
        return ['transparent', 'transparent'];
      default:
        return theme.gradients.primary;
    }
  };

  const getTextColor = () => {
    if (variant === 'outline') return theme.colors.primary;
    return theme.colors.textInverse;
  };

  const ButtonContent = () => (
    <View style={styles.contentContainer}>
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <>
          {icon && (
            <Ionicons 
              name={icon} 
              size={20} 
              color={getTextColor()} 
              style={styles.icon} 
            />
          )}
          <Text style={[
            styles.text, 
            { color: getTextColor() },
            size === 'lg' && styles.textLg,
            size === 'sm' && styles.textSm,
            textStyle
          ]}>
            {title}
          </Text>
        </>
      )}
    </View>
  );

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        style={[
          styles.button,
          styles.outlineButton,
          { borderColor: disabled ? theme.colors.textLight : theme.colors.primary },
          style,
          borderRadius !== undefined && { borderRadius }
        ]}
        activeOpacity={0.8}
      >
        <ButtonContent />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.container, 
        style,
        borderRadius !== undefined && { borderRadius }
      ]}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={getColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.button,
          disabled && styles.disabled,
          borderRadius !== undefined && { borderRadius }
        ]}
      >
        <ButtonContent />
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.borderRadius.full,
    ...theme.shadows.md,
  },
  button: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  outlineButton: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.md,
  },
  textLg: {
    fontSize: theme.fontSize.lg,
  },
  textSm: {
    fontSize: theme.fontSize.sm,
  },
  icon: {
    marginRight: theme.spacing.sm,
  },
  disabled: {
    opacity: 0.7,
  }
});

export default CustomButton;
