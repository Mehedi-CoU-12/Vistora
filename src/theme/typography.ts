import {Platform, type TextStyle} from 'react-native';

/**
 * Type scale for a ~960dp-wide viewport read from about three metres away.
 * `body` at 15dp renders as 30px on a 1080p panel, which is roughly the
 * smallest comfortably readable size at that distance -- treat it as the floor
 * and do not introduce anything smaller than `caption`.
 */

const fontFamily = Platform.select({
  android: 'sans-serif',
  default: undefined,
});

const medium = Platform.select({
  android: 'sans-serif-medium',
  default: undefined,
});

export const typography = {
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
