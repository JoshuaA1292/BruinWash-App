/**
 * Design tokens. Navy/blue primary taken from the live web product's
 * theme-color (#005581 in campuswash.app/manifest.json), so the mobile app
 * reads as the same product rather than a redesign.
 */

export const colors = {
  /** The brand navy from the webapp header and CTAs. */
  primary: '#005581',
  primaryDark: '#003E5E',
  primaryLight: '#0A6FA3',
  primarySoft: '#E6F1F7',

  /** Amber, used for the liability / care-of-items disclosure box. */
  warning: '#B45309',
  warningSurface: '#FFFBEB',
  warningBorder: '#FCD34D',

  success: '#15803D',
  successSurface: '#F0FDF4',
  danger: '#B91C1C',
  dangerSurface: '#FEF2F2',

  text: '#0F172A',
  textMuted: '#5A6B7C',
  textSubtle: '#8A99A8',
  textOnPrimary: '#FFFFFF',

  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F8FA',
  border: '#E2E8EE',
  borderStrong: '#CBD5DF',

  star: '#F59E0B',
  overlay: 'rgba(15, 23, 42, 0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  bodyStrong: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '500' },
  caption: { fontSize: 13, fontWeight: '400' },
  micro: { fontSize: 11, fontWeight: '500' },
} as const;

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sheet: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

export const theme = { colors, spacing, radius, typography, shadow } as const;
export type Theme = typeof theme;
