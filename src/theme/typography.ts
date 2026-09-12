import {Platform, type TextStyle} from 'react-native';

/**
 * The type scale.
 *
 * ---------------------------------------------------------------------------
 * The base scale below is the TV scale, and it is the reference for everything.
 * ---------------------------------------------------------------------------
 * It is sized for a ~960dp-wide viewport read from about three metres away.
 * `body` at 15dp renders as 30px on a 1080p panel, which is roughly the smallest
 * comfortably readable size at that distance -- treat it as the floor and do not
 * introduce anything smaller than `caption`.
 *
 * ---------------------------------------------------------------------------
 * Why only the headline sizes change on a phone
 * ---------------------------------------------------------------------------
 * The reflex is to scale the whole scale down for a small screen. That is wrong
 * here, and the reason is worth stating: dp is a *physical* unit, and the two
 * viewing distances almost cancel out. A phone is ~10x closer than a TV but its
 * pixels are ~2.5x smaller, so 15dp of body text is legible on both -- which is
 * why 15dp is also a perfectly normal phone body size.
 *
 * What genuinely does not survive the move is the headlines, because those are
 * sized against the *width* of the screen rather than against the eye. `display`
 * at 34dp is 3.5% of a TV's 960dp viewport and a comfortable wordmark; the same
 * 34dp is 8.7% of a 390dp phone and swamps the header.
 *
 * So: headlines scale, body and below do not.
 */

const fontFamily = Platform.select({
  android: 'sans-serif',
  default: undefined,
});

const medium = Platform.select({
  android: 'sans-serif-medium',
  default: undefined,
});

export const baseTypography = {
  /**
   * A hero title, and the largest thing in the app.
   *
   * Deliberately a role of its own rather than `display` at a bigger size.
   * `display` is the wordmark in the top bar -- it appears on every screen and
   * has to leave room for a tab rail beside it -- whereas this appears once, over
   * artwork, with the whole frame to itself. Tying them together would mean every
   * adjustment to the hero moved the wordmark.
   *
   * The tight `lineHeight` (1.12x rather than the ~1.24x the rest of the scale
   * uses) is what makes a two-line film title read as one block instead of as two
   * sentences, and the negative tracking is the standard correction for type this
   * large -- letterspacing that looks right at 15dp looks gappy at 44dp.
   */
  heroTitle: {
    fontFamily: medium,
    fontSize: 44,
    lineHeight: 49,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  /** App name / hero. */
  display: {
    fontFamily: medium,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  /** Screen title. */
  title: {
    fontFamily: medium,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  /** Row / shelf heading. */
  sectionTitle: {
    fontFamily: medium,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  /** Card titles, list rows. */
  body: {
    fontFamily,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  /** Secondary metadata. The smallest size in the app. */
  caption: {
    fontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  /** Badges: LIVE, 4K, channel numbers. */
  label: {
    fontFamily: medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
} satisfies Record<string, TextStyle>;

export type TypographyRole = keyof typeof baseTypography;

/**
 * One role's style, with `fontSize` and `lineHeight` narrowed to required.
 *
 * They are required by construction: every role in the base scale sets both, and
 * scaling preserves both. Plain `TextStyle` leaves them optional, which would
 * make every caller that compares or derives from a size handle an `undefined`
 * that cannot occur.
 */
export type TypeStyle = TextStyle & {fontSize: number; lineHeight: number};

export type Typography = Record<TypographyRole, TypeStyle>;

/** The roles sized against screen width, and therefore the only ones scaled. */
const HEADLINE_ROLES = [
  'heroTitle',
  'display',
  'title',
  'sectionTitle',
] as const;

/**
 * Returns the type scale with the headline roles multiplied by `headlineScale`.
 *
 * `lineHeight` is scaled by the same factor rather than recomputed, so the
 * ratio the base scale was designed with survives -- scaling only the font size
 * would leave a 27dp wordmark sitting in a 42dp line box.
 */
export function scaleTypography(headlineScale: number): Typography {
  if (headlineScale === 1) {
    return baseTypography;
  }

  const scaled: Typography = {...baseTypography};

  for (const role of HEADLINE_ROLES) {
    const base = baseTypography[role];
    scaled[role] = {
      ...base,
      fontSize: Math.round(base.fontSize * headlineScale),
      lineHeight: Math.round(base.lineHeight * headlineScale),
    };
  }

  return scaled;
}
