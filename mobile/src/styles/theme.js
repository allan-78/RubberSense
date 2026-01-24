// ============================================
// 🎨 Theme - Colors & Styles
// ============================================

export const theme = {
  colors: {
    // Primary Brand Colors
    primary: '#059669', // Emerald 600
    primaryDark: '#047857', // Emerald 700
    primaryLight: '#34D399', // Emerald 400
    secondary: '#10B981', // Emerald 500
    accent: '#F59E0B', // Amber 500

    // Backgrounds
    background: '#F0FDF4', // Light Mint
    surface: '#FFFFFF',
    surfaceHighlight: '#F8FAFC',
    
    // Text
    text: '#1E293B', // Slate 800
    textSecondary: '#64748B', // Slate 500
    textLight: '#94A3B8', // Slate 400
    textInverse: '#FFFFFF',
    
    // Status
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    
    // UI Elements
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    inputBg: '#F8FAFC',
    
    // Overlay & Glass
    overlay: 'rgba(0, 0, 0, 0.5)',
    overlayDark: 'rgba(0, 0, 0, 0.7)',
    glass: 'rgba(255, 255, 255, 0.85)',
    glassBorder: 'rgba(255, 255, 255, 0.5)',
  },
  
  gradients: {
    primary: ['#059669', '#10B981'], // Deep Emerald to Emerald
    success: ['#059669', '#34D399'],
    dark: ['#0F172A', '#1E293B'],
    light: ['#FFFFFF', '#F0FDF4'],
    card: ['#FFFFFF', '#F8FAFC'],
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
      shadowColor: '#059669',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#059669',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#059669',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    glow: {
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 5,
    }
  },
};

export default theme;
