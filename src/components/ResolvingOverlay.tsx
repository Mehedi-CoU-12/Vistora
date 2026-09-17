import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useResolutionState } from '../state/playbackResolution';
import { colors, makeStyles, spacing } from '../theme';

/**
 * The moment between pressing Play and the picture starting.
 *
 * ---------------------------------------------------------------------------
 * What this is actually fixing
 * ---------------------------------------------------------------------------
 * Playback used to begin with a URL already in hand, so `navigate('Player')`
 * was instant and the player's own buffering spinner covered everything after
 * it. Resolution puts a network round trip in front of that, and without
 * something drawn during it the app spends that time looking broken in the
 * particular way that makes people press the button again: the press is
 * acknowledged by nothing at all, on a screen that still shows the poster they
 * pressed.
 *
 * Navigating first and resolving inside the player would avoid the overlay, and
 * is worse. It puts the viewer on a black screen -- committed, with the browse
 * screen gone -- to wait for an answer that might be "there is no source for
 * this", at which point the app has to send them back to where they already
 * were. Resolving first means a failure never leaves the screen it started on.
 *
 * ---------------------------------------------------------------------------
 * It covers the whole app, and swallows input, on purpose
 * ---------------------------------------------------------------------------
 * Mounted once above the navigator rather than per screen -- see the note in
 * state/playbackResolution.ts on why the state is a store. Because it is a
 * plain `View` over everything with no `pointerEvents="none"`, it also absorbs
 * taps and D-pad presses while it is up, which is the second half of the
 * double-press guard in `beginResolving`: the store drops repeat presses, and
 * this stops them being aimed at whatever card happens to be under the finger.
 *
 * It renders nothing at all when idle. An always-mounted transparent view over
 * the app would intercept focus on a TV, where the focus engine walks the view
 * tree rather than the visible pixels.
 */
export function ResolvingOverlay() {
  const { isResolving, title } = useResolutionState();
  const styles = useStyles();

  if (!isResolving) {
    return null;
  }

  return (
    <View style={styles.root} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.accent} />

      {/* Names the title rather than saying "Loading…", because the useful
          question during this wait is "did it register the thing I pressed",
          and on a grid of similar posters the answer is not otherwise visible. */}
      <Text style={styles.label} numberOfLines={2}>
        {title ? `Starting ${title}…` : 'Finding a stream…'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(m => ({
  root: {
    // Spelled out rather than StyleSheet.absoluteFill, which this React Native
    // version types as a registered style ID that cannot be spread. Same reason
    // as the `video` style in player/VideoPlayer.tsx.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: m.gutter.horizontal,
    // Dark enough to read white text on, sheer enough that the screen behind is
    // still legible -- this is a pause in a journey, not a new destination.
    backgroundColor: colors.scrim,
  },
  label: {
    ...m.typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
}));
