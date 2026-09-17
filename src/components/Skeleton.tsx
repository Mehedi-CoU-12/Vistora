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

      pulse.setValue(0);
    }
  };
}

function useSkeletonPulse(): Animated.AnimatedInterpolation<number> {
  const opacity = useRef(
    pulse.interpolate({
      inputRange: [0, 1],

      outputRange: [0.45, 0.9],
    }),
  ).current;

  useEffect(startPulse, []);

  return opacity;
}

export function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useSkeletonPulse();
  const styles = useStyles();

  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

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
      {}
      <SkeletonBlock style={styles.titleLine} />
      <SkeletonBlock style={styles.subtitleLine} />
    </View>
  );
}

export function SkeletonRow({ variant }: { variant: CardVariant }) {
  const { cardSize, contentWidth } = useMetrics();
  const styles = useStyles();

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
