/**
 * A single dark palette. TV apps are viewed in dim rooms on large, bright panels,
 * so there is no light mode -- and no theme switching to reason about.
 *
 * Keep `background` in sync with android/app/src/main/res/values/colors.xml, or
 * you get a coloured flash between the native window appearing and React
 * mounting.
 *
 * ---------------------------------------------------------------------------
 * Where the colours come from
 * ---------------------------------------------------------------------------
 * assets/vistora-logo.png is a gradient "V" -- cyan through blue into violet --
 * with an orange-to-magenta play mark cut out of it, sitting on a deep navy. The
 * brand ramp below is that artwork read off as tokens, which is why the app does
 * not use a streaming-red anywhere: Vistora's identity is the cyan/violet sweep,
 * and red would belong to somebody else's product.
 *
 * `accent` is unchanged from the first version of this file, and deliberately:
 * #38BDF8 IS the logo's cyan. Focus rings, selected tabs and the player's
 * controls were all tuned against it, so the redesign extends the palette rather
 * than moving the one colour every interactive surface already agrees on.
 */
export const colors = {
  /**
   * The bottom of the stack. Everything else is a lighter step on top of it, and
   * every hero image is faded INTO it -- see `Gradient` and `HeroBanner` -- which
   * is what stops artwork from reading as a rectangle pasted onto a screen.
   */
  background: '#0B0D14',
  /** Cards and panels at rest. */
  surface: '#141824',
  /** A focused card: deliberately lighter, so focus reads even without colour. */
  surfaceFocused: '#232A3D',
  /**
   * A panel that sits ON a card or over artwork -- a metadata pill, a rail
   * header chip, the details sheet. One step above `surface` so two stacked
   * panels still have an edge between them.
   */
  surfaceElevated: '#1C2233',
  /**
   * A surface laid over a photograph. Translucent rather than solid for the same
   * reason the player's controls are: an opaque tile on top of a backdrop is a
   * hole punched in it.
   */
  surfaceOverArt: 'rgba(20, 24, 36, 0.66)',
  border: '#252B3B',
  /** A hairline that has to survive being drawn on top of artwork. */
  borderOverArt: 'rgba(243, 245, 249, 0.16)',

  /** The focus colour. Used for nothing else, so "accent" always means "focused". */
  accent: '#38BDF8',
  accentMuted: 'rgba(56, 189, 248, 0.22)',

  // -------------------------------------------------------------------------
  // The brand ramp, sampled from the logo
  // -------------------------------------------------------------------------
  // Used for gradients and for the one or two places that need to feel like
  // Vistora rather than like a focus state: the wordmark, the primary Play
  // button, the glow behind a focused hero. Interaction stays `accent`.
  brandCyan: '#22D3EE',
  brandBlue: '#3B82F6',
  brandViolet: '#8B5CF6',
  brandMagenta: '#EC4899',
  brandAmber: '#F59E0B',

  /**
   * The wash behind a focused card.
   *
   * A glow rather than a second border, because the ring is already the border
   * and stacking two would read as a card inside a card. Low alpha on purpose:
   * at three metres this is a suggestion of light, not a highlighter.
   */
  focusGlow: 'rgba(56, 189, 248, 0.35)',

  live: '#F43F5E',

  textPrimary: '#F3F5F9',
  textSecondary: '#A7B0C2',
  textMuted: '#6B7488',
  /** Text on top of the accent colour. */
  textOnAccent: '#04141F',
  /**
   * Text drawn directly on artwork, where `textSecondary` loses against a bright
   * frame. Nearly white, and paired with a gradient scrim rather than used alone.
   */
  textOnArt: 'rgba(243, 245, 249, 0.92)',

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

/**
 * `background` with an alpha channel.
 *
 * Every fade in the app ends at the page colour, and a fade needs that colour at
 * partial opacity at each step. Writing the rgba by hand at each call site is how
 * one of them ends up fading to #000 instead -- which on a #0B0D14 page shows up
 * as a dark seam across the bottom of a hero.
 */
export function backgroundAlpha(alpha: number): string {
  return `rgba(11, 13, 20, ${alpha})`;
}

/** Pure black at partial opacity, for scrims that darken artwork rather than end it. */
export function shadeAlpha(alpha: number): string {
  return `rgba(0, 0, 0, ${alpha})`;
}
