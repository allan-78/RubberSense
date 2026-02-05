// ============================================
// 🎨 Theme - Colors & Styles
// ============================================

export const theme = {
  colors: {
    // Primary Brand Colors (Olive Palette)
    primary: '#556B2F', // Dark Olive Green
    primaryDark: '#3B4B21', // Deep Olive
    primaryLight: '#6B8E23', // Olive Drab
    secondary: '#8FBC8F', // Dark Sea Green
    accent: '#BDB76B', // Dark Khaki

    // Backgrounds
    background: '#FAFAF5', // Off-white/Ivory with subtle olive tint
    surface: '#FFFFFF',
    surfaceHighlight: '#F7F9F0',
    
    // Text
    text: '#2F3320', // Very Dark Olive/Black
    textSecondary: '#5C6150', // Muted Olive Gray
    textLight: '#8C9180', // Light Olive Gray
    textInverse: '#FFFFFF',
    
    // Status
    success: '#6B8E23', // Olive Drab
    warning: '#BDB76B', // Dark Khaki
    error: '#8B4513', // Saddle Brown (from palette)
    info: '#8FBC8F', // Dark Sea Green
    
    // UI Elements
    border: '#E2E8D5', // Beige/Olive tint border
    borderLight: '#F1F5E9',
    inputBg: '#F7F9F0',
    
    // Overlay & Glass
    overlay: 'rgba(47, 51, 32, 0.6)', // Dark Olive overlay
    overlayDark: 'rgba(20, 26, 10, 0.8)',
    glass: 'rgba(255, 255, 255, 0.85)',
    glassBorder: 'rgba(255, 255, 255, 0.5)',
  },
  
  gradients: {
    primary: ['#556B2F', '#6B8E23'], // Dark Olive to Olive Drab
    secondary: ['#6B8E23', '#8FBC8F'], // Olive Drab to Sea Green
    success: ['#556B2F', '#8FBC8F'],
    dark: ['#2F3320', '#3B4B21'],
    light: ['#FFFFFF', '#FAFAF5'],
    card: ['#FFFFFF', '#F7F9F0'],
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },
  
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 20,
    xl: 32,
    full: 9999,
  },
  
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
    display: 42,
  },
  
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  
  shadows: {
    sm: {
      shadowColor: '#556B2F',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#556B2F',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#556B2F',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    glow: {
      shadowColor: '#6B8E23',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 5,
    }
  },
};

export default theme;
