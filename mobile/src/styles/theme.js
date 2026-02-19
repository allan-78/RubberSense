// ============================================
// 🎨 Theme - Minimalist 4-Color Palette
// ============================================

export const theme = {
  colors: {
    // Core 4-Color Palette
    primary: '#2F4F4F',      // 1. Deep Green / Dark Slate
    secondary: '#8FBC8F',    // 2. Sage / Soft Accent
    background: '#F9FAF9',   // 3. Clean Light Background
    text: '#2C3E50',         // 4. Dark Charcoal Text
    
    // Derivatives (maintained for compatibility but derived from palette)
    primaryDark: '#1E3333',
    primaryLight: '#A3CFA3',
    surface: '#FFFFFF',      // White is implied in 4-color designs for cards
    surfaceHighlight: '#F2F5F2',
    
    textSecondary: '#5D6D7E', // Muted version of text
    textLight: '#95A5A6',
    textInverse: '#FFFFFF',
    
    // Status (Functional colors - kept minimal)
    success: '#8FBC8F', // Use Secondary for success to maintain palette
    warning: '#E67E22', // Muted Orange
    error: '#C0392B',   // Muted Red
    info: '#2980B9',    // Muted Blue
    
    // UI Elements
    border: '#E2E8F0',
    borderLight: '#F0F3F4',
    inputBg: '#F4F6F6',
    
    // Overlay
    overlay: 'rgba(47, 79, 79, 0.6)',
    glass: 'rgba(255, 255, 255, 0.95)',
  },
  
  gradients: {
    // Minimalist gradients (very subtle)
    primary: ['#2F4F4F', '#3A6060'], 
    secondary: ['#8FBC8F', '#9FC99F'],
    light: ['#F9FAF9', '#FFFFFF'],
    card: ['#FFFFFF', '#FFFFFF'], // Flat cards
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22, // Reduced from 24/32 for minimalism
    xxl: 28,
    display: 36,
  },
  
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  
  // Minimalist Shadows
  shadows: {
    sm: {
      shadowColor: '#2C3E50',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#2C3E50',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    lg: {
      shadowColor: '#2C3E50',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    glow: {
      shadowColor: '#8FBC8F',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 3,
    }
  },
};

export default theme;
