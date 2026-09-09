/**
 * A single dark palette. TV apps are viewed in dim rooms on large, bright panels,
 * so there is no light mode -- and no theme switching to reason about.
 *
 * Keep `background` in sync with android/app/src/main/res/values/colors.xml, or
 * you get a coloured flash between the native window appearing and React
 * mounting.
 */
export const colors = {
  background: '#0B0D14',
  /** Cards and panels at rest. */
  surface: '#141824',
  /** A focused card: deliberately lighter, so focus reads even without colour. */
  surfaceFocused: '#232A3D',
  border: '#252B3B',

  /** The focus colour. Used for nothing else, so "accent" always means "focused". */
  accent: '#38BDF8',
  accentMuted: 'rgba(56, 189, 248, 0.22)',

  live: '#F43F5E',

  textPrimary: '#F3F5F9',
  textSecondary: '#A7B0C2',
  textMuted: '#6B7488',
  /** Text on top of the accent colour. */
  textOnAccent: '#04141F',

  danger: '#F87171',
  scrim: 'rgba(4, 6, 12, 0.72)',
} as const;
