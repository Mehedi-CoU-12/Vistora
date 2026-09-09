import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';

import { colors, makeStyles, radius, spacing } from '../theme';
import { formatTime } from './formatTime';
import {
  clamp01,
  formatPercent,
  formatRate,
  formatSeekDelta,
  SCALING_LABEL,
  type ScalingMode,
} from './playbackOptions';
import { resolvePlayerChrome } from './playerLayout';

/**
 * What the player is doing right now, when it is something the controls cannot
 * show on their own.
 *
 * This is the whole reason a gesture-driven player feels controllable: a swipe
 * has no button to light up, so if the screen does not say "volume 40%" the user
 * has changed something invisible and has to check by ear. Every gesture in
 * `usePlayerGestures` therefore has a readout here, and each one names the value
 * it is setting rather than the gesture that set it.
 */
export type PlayerFeedback =
  | { kind: 'skip'; deltaSeconds: number; target: number }
  | { kind: 'scrub'; deltaSeconds: number; target: number }
  | { kind: 'level'; axis: 'volume' | 'brightness'; value: number }
  | { kind: 'rate'; rate: number }
  | { kind: 'scaling'; mode: ScalingMode }
  | { kind: 'locked' };

/** How long the readout takes to appear and to fade away again. */
const FADE_MS = 140;

export function GestureFeedback({
  feedback,
}: {
  feedback: PlayerFeedback | null;
}) {
  const styles = useStyles();
  const opacity = useRef(new Animated.Value(0)).current;

  /**
   * The last thing worth showing, kept while it fades out.
   *
   * Rendering `feedback` directly would unmount the readout the instant it is
   * cleared, so the fade would never be seen -- and a HUD that vanishes between
   * frames reads as a flicker rather than as feedback.
   */
  const [shown, setShown] = useState<PlayerFeedback | null>(feedback);

  useEffect(() => {
    if (feedback) {
      setShown(feedback);
    }

    Animated.timing(opacity, {
      toValue: feedback ? 1 : 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !feedback) {
        setShown(null);
      }
    });
  }, [feedback, opacity]);

  if (!shown) {
    return null;
  }

  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View style={[styles.card, { opacity }]}>
        <Readout feedback={shown} styles={styles} />
      </Animated.View>
    </View>
  );
}

function Readout({
  feedback,
  styles,
}: {
  feedback: PlayerFeedback;
  styles: ReturnType<typeof useStyles>;
}) {
  switch (feedback.kind) {
    case 'skip':
    case 'scrub':
      return (
        <>
          <Text style={styles.headline}>
            {formatSeekDelta(feedback.deltaSeconds)}
          </Text>
          <Text style={styles.detail}>{formatTime(feedback.target)}</Text>
        </>
      );

    case 'level':
      return (
        <>
          <Text style={styles.caption}>
            {feedback.axis === 'volume' ? 'Volume' : 'Brightness'}
          </Text>
          <Text style={styles.headline}>{formatPercent(feedback.value)}</Text>
          <View style={styles.meter}>
            <View
              style={[
                styles.meterFill,
                { width: `${clamp01(feedback.value) * 100}%` },
              ]}
            />
          </View>
        </>
      );

    case 'rate':
      return (
        <>
          <Text style={styles.headline}>{formatRate(feedback.rate)}</Text>
          <Text style={styles.detail}>Speed</Text>
        </>
      );

    case 'scaling':
      return (
        <>
          <Text style={styles.headline}>{SCALING_LABEL[feedback.mode]}</Text>
          <Text style={styles.detail}>Picture size</Text>
        </>
      );

    case 'locked':
      return (
        <>
          <Text style={styles.headline}>Locked</Text>
          <Text style={styles.detail}>Press Unlock to use the controls</Text>
        </>
      );
  }
}

const useStyles = makeStyles(metrics => {
  const chrome = resolvePlayerChrome(metrics);

  return {
    layer: {
      // Spelled out rather than StyleSheet.absoluteFillObject: this React Native
      // version's types only declare `absoluteFill` (a registered style ID),
      // which cannot be spread into a style object.
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      minWidth: chrome.hudWidth,
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.scrim,
    },
    headline: {
      ...metrics.typography.title,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    detail: {
      ...metrics.typography.caption,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    caption: {
      ...metrics.typography.label,
      color: colors.textMuted,
    },
    meter: {
      width: '100%',
      height: 4,
      marginTop: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    meterFill: {
      height: '100%',
      backgroundColor: colors.accent,
    },
  };
});
