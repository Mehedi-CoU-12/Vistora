import React, { useEffect, useRef } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  cardAspect,
  colors,
  duration,
  makeStyles,
  radius,
  spacing,
  useMetrics,
  type CardVariant,
} from '../theme';

/**
 * Placeholders for content that has not arrived.
 *
 * ---------------------------------------------------------------------------
 * Why a skeleton rather than the spinner that used to be here
 * ---------------------------------------------------------------------------
 * A centred spinner on a dark screen says "something is happening". A skeleton
 * says "a hero and four rails are about to be here", which is more useful in
 * itself and, on a television, is the difference between two behaviours rather
 * than two looks: with a spinner the layout appears all at once and the D-pad's
 * first press lands on whatever moved under it, whereas the skeleton is already
 * the shape of the answer, so nothing jumps when the data lands.
 *
 * ---------------------------------------------------------------------------
 * One animation for the whole screen
 * ---------------------------------------------------------------------------
 * A loading home screen is a hero plus four rails of six cards: around thirty
 * placeholders. Thirty `Animated.loop`s is thirty timers, thirty native driver
 * nodes and thirty chances to land out of phase, which is visible as a shimmer
 * crawling across the screen rather than the screen breathing.
 *
 * So there is one `Animated.Value` at module scope, and every placeholder in the
 * tree reads it. It is reference-counted: the loop starts when the first
 * skeleton mounts and stops when the last unmounts, so an app sitting on a
 * loaded screen is running no animation at all.
 */

/** The single shared pulse, 0..1. */
const pulse = new Animated.Value(0);

let mounted = 0;
let loop: Animated.CompositeAnimation | null = null;

function startPulse(): () => void {
  mounted += 1;

  if (mounted === 1) {
    loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          // Slow, and much slower than any interaction in the app. A placeholder
          // that pulses at interaction speed reads as something responding to
          // the user, which is the one thing it is not.
          duration: duration.hero * 3,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: duration.hero * 3,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
  }

  return () => {
    mounted -= 1;
    if (mounted === 0) {
      loop?.stop();
      loop = null;
      // Reset, so the next skeleton to mount starts from the dim end rather than
      // wherever the previous screen happened to stop.
      pulse.setValue(0);
    }
  };
}

function useSkeletonPulse(): Animated.AnimatedInterpolation<number> {
  const opacity = useRef(
    pulse.interpolate({
      inputRange: [0, 1],
      // A narrow range on purpose. The placeholders are already only a step
      // above the page; fading them to near-invisible makes the layout appear to
      // flicker rather than to wait.
      outputRange: [0.45, 0.9],
    }),
  ).current;

  useEffect(startPulse, []);

  return opacity;
}

/** One pulsing rectangle. Everything below is made of these. */
export function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useSkeletonPulse();
  const styles = useStyles();

  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

/** A card-shaped placeholder, in the same slot a real card would occupy. */
export function SkeletonCard({
  variant,
  width,
}: {
  variant: CardVariant;
  width?: number;
}) {
  const { cardSize } = useMetrics();
  const styles = useStyles();

  const size =
    width === undefined
      ? cardSize[variant]
      : { width, height: Math.floor(width * cardAspect[variant]) };

  return (
    <View style={[styles.card, { width: size.width }]}>
      <SkeletonBlock style={[styles.artwork, size]} />
      {/* Two lines under the artwork, the second shorter, because that is what a
          real card has -- a full-width title and a shorter subtitle. Matching
          the real thing is the entire job. */}
      <SkeletonBlock style={styles.titleLine} />
      <SkeletonBlock style={styles.subtitleLine} />
    </View>
  );
}

/** A heading and a row of cards, sized like a real `ContentRow`. */
export function SkeletonRow({ variant }: { variant: CardVariant }) {
  const { cardSize, contentWidth } = useMetrics();
  const styles = useStyles();

  // Exactly as many as would be visible, plus one. Rendering a fixed number
  // would leave a gap on a TV and overflow a phone -- and an overflowing row of
  // placeholders is a row that has to be laid out and then clipped, which is
  // work done to show nothing.
  const count = Math.ceil(contentWidth / cardSize[variant].width) + 1;

  return (
    <View style={styles.row}>
      <SkeletonBlock style={styles.heading} />
      <View style={styles.rowCards}>
        {Array.from({ length: count }, (_, index) => (
          <SkeletonCard key={index} variant={variant} />
        ))}
      </View>
    </View>
  );
}

/** A hero-shaped placeholder: the artwork block, a title bar and two buttons. */
export function SkeletonHero() {
  const { hero } = useMetrics();
  const styles = useStyles();

  return (
    <View style={[styles.hero, { height: hero.height }]}>
      <SkeletonBlock style={styles.heroArt} />

      <View
        style={[
          styles.heroContent,
          hero.align === 'center' && styles.heroContentCentered,
        ]}
      >
        <SkeletonBlock style={styles.heroTitle} />
        <SkeletonBlock style={styles.heroMeta} />
        <View style={styles.heroActions}>
          <SkeletonBlock style={styles.heroButton} />
          <SkeletonBlock style={styles.heroButton} />
        </View>
      </View>
    </View>
  );
}

/**
 * The whole first paint of a browse screen: a hero and some rails.
 *
 * `rows` defaults to three, which is about what fits under a hero on a
 * television before the fold. More would be laid out to be scrolled to, and
 * nobody scrolls a loading screen.
 */
export function SkeletonScreen({
  rows = 3,
  variant = 'poster',
  hero = true,
}: {
  rows?: number;
  variant?: CardVariant;
  hero?: boolean;
}) {
  const styles = useStyles();

  return (
    <View style={styles.screen} accessibilityLabel="Loading">
      {hero ? <SkeletonHero /> : null}
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} variant={variant} />
      ))}
    </View>
  );
}

const useStyles = makeStyles(m => ({
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    // Placeholders must never take D-pad focus. They are not interactive, and a
    // remote landing on one is a remote that has landed on nothing.
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
  },
  card: {
    padding: spacing.xs,
  },
  artwork: {
    borderRadius: radius.md,
  },
  titleLine: {
    height: m.typography.body.fontSize,
    marginTop: spacing.sm,
    // Not the full width. A title that exactly fills its card reads as a filled
    // bar; three quarters reads as a line of text.
    width: '75%',
  },
  subtitleLine: {
    height: m.typography.caption.fontSize,
    marginTop: spacing.xs,
    width: '45%',
  },
  row: {
    marginBottom: spacing.lg,
  },
  heading: {
    height: m.typography.sectionTitle.fontSize,
    width: 160,
    marginBottom: spacing.sm,
    marginHorizontal: m.gutter.horizontal,
  },
  rowCards: {
    flexDirection: 'row',
    paddingHorizontal: m.gutter.horizontal - spacing.xs,
    paddingVertical: spacing.sm,
    // The row is not scrollable and the placeholders past the edge are not worth
    // laying out, so the whole strip is simply clipped.
    overflow: 'hidden',
  },
  hero: {
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
  },
  heroArt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
  },
  heroContent: {
    paddingHorizontal: m.gutter.horizontal,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  heroContentCentered: {
    alignItems: 'center',
  },
  heroTitle: {
    height: m.typography.heroTitle.fontSize,
    width: Math.min(m.hero.textMaxWidth, 420),
    maxWidth: '100%',
  },
  heroMeta: {
    height: m.typography.caption.fontSize,
    width: 180,
    maxWidth: '100%',
  },
  heroActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  heroButton: {
    height: Math.max(m.minTouchTarget, 40),
    width: 132,
    borderRadius: radius.pill,
  },
}));
