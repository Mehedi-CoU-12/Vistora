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

  /**
   * A player control at rest.
   *
   * Translucent where `surface` is solid, and that is the whole point: these
   * buttons sit on top of a film, and an opaque tile over the picture is a hole
   * punched in it. At 58% the shape still reads against a bright frame -- which
   * is what a control needs -- while the video keeps moving through it.
   */
  controlSurface: 'rgba(20, 24, 36, 0.58)',
  /** A control the user is holding down, or one the D-pad has landed on. */
  controlSurfaceActive: 'rgba(35, 42, 61, 0.92)',
  /** A control whose mode is currently on: the lock, a chosen picture size. */
  controlSurfaceOn: 'rgba(56, 189, 248, 0.26)',
  /** Hairline around a control, so its edge survives a white frame behind it. */
  controlBorder: 'rgba(243, 245, 249, 0.14)',
} as const;
