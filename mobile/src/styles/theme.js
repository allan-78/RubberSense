// ============================================
// 🎨 Theme - Colors & Styles
// ============================================

export const theme = {
  colors: {
    // Primary Brand Colors (Olive Palette)
    primary: '#22C55E', // Dark Olive Green
    primaryDark: '#16A34A', // Deep Olive
    primaryLight: '#86EFAC', // Olive Drab
    secondary: '#0EA5E9', // Dark Sea Green
    accent: '#F59E0B', // Dark Khaki

    // Backgrounds
    background: '#F8FAFC', // Off-white/Ivory with subtle olive tint
    surface: '#FFFFFF',
    surfaceHighlight: '#F1F5F9',
    
    // Text
    text: '#0F172A', // Very Dark Olive/Black
    textSecondary: '#475569', // Muted Olive Gray
    textLight: '#94A3B8', // Light Olive Gray
    textInverse: '#FFFFFF',
    
    // Status
    success: '#22C55E', // Olive Drab
    warning: '#F59E0B', // Dark Khaki
    error: '#EF4444', // Saddle Brown (from palette)
    info: '#0EA5E9', // Dark Sea Green
    
    // UI Elements
    border: '#E2E8F0', // Beige/Olive tint border
    borderLight: '#F1F5F9',
    inputBg: '#F1F5F9',
    
    // Overlay & Glass
    overlay: 'rgba(15, 23, 42, 0.6)', // Dark Olive overlay
    overlayDark: 'rgba(15, 23, 42, 0.8)',
    glass: 'rgba(255, 255, 255, 0.85)',
    glassBorder: 'rgba(255, 255, 255, 0.5)',
  },
  
  gradients: {
    primary: ['#22C55E', '#16A34A'], // Dark Olive to Olive Drab
    secondary: ['#0EA5E9', '#38BDF8'], // Olive Drab to Sea Green
    success: ['#22C55E', '#4ADE80'],
    dark: ['#0F172A', '#1E293B'],
    light: ['#FFFFFF', '#F8FAFC'],
    card: ['#FFFFFF', '#F1F5F9'],
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
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    md: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    lg: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 8,
    },
    glow: {
      shadowColor: '#22C55E',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 14,
      elevation: 5,
    }
  },
};

export default theme;
