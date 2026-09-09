import React from 'react';
import { Text, TVFocusGuideView, View } from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { ControlButton } from './ControlButton';
import { formatTime } from './formatTime';
import { glyph } from './glyphs';
import {
  formatRate,
  SCALING_LABEL,
  SEEK_STEP_SECONDS,
  type ScalingMode,
} from './playbackOptions';
import { resolvePlayerChrome, type EdgeInsets } from './playerLayout';
import type { RemoteKeyHandlers } from './remoteKeys';
import { SeekBar } from './SeekBar';

interface PlayerControlsProps {
  /**
   * W3C key handlers from `useRemoteControl`, spread onto the overlay root.
   *
   * Key events bubble, so a press on a focused button arrives here -- which is
   * what keeps left/right scrubbing alive while the controls are up. See
   * `remoteKeys.ts` for why this is the path that works.
   */
  keyHandlers?: RemoteKeyHandlers;
  title: string;
  subtitle?: string;
  isPaused: boolean;
  isLive: boolean;
  /** False for a live stream with no DVR window: there is nothing to seek in. */
  canSeek: boolean;
  /** Position to draw, which is the pending target while a skip accumulates. */
  position: number;
  start: number;
  end: number;
  buffered: number;
  rate: number;
  scaling: ScalingMode;
  locked: boolean;
  /** Live, but watching behind the edge -- offer a way back to it. */
  behindLive: boolean;
  edges: EdgeInsets;
  onTogglePlay: () => void;
  onSkip: (deltaSeconds: number) => void;
  onSeek: (time: number) => void;
  onScrubPreview: (time: number | null) => void;
  onSeekBarFocusChange: (focused: boolean) => void;
  onOpenSettings: () => void;
  onCycleScaling: () => void;
  onToggleLock: () => void;
  onGoLive: () => void;
  onExit: () => void;
}

/**
 * The control overlay.
 *
 * ---------------------------------------------------------------------------
 * One component, two interfaces
 * ---------------------------------------------------------------------------
 * The pieces are the same on every device -- title, scrub bar, play, skip,
 * settings -- but where they go, and which of them exist, is not:
 *
 *   TV     Two focus rows and nothing else: the scrub bar, then a single row of
 *          buttons -- skip included, because a remote has no other way to ask
 *          for a 10-second jump. Every control must be reachable by counting
 *          D-pad presses, so a control in the middle of the screen is a control
 *          that competes with the row for the same key.
 *
 *   Touch  One row along the bottom, play/pause at the left end. No skip
 *          buttons: double-tapping either side of the screen already skips, and
 *          a pair of buttons doing the same thing reads as clutter over the
 *          picture -- particularly in landscape, where the row is the only chrome
 *          on screen. Nothing sits in the middle of the video at all.
 *
 * ---------------------------------------------------------------------------
 * pointerEvents="box-none" on the root is load-bearing
 * ---------------------------------------------------------------------------
 * The overlay covers the whole screen, so without it the overlay would swallow
 * every touch and the gesture layer underneath would never see one -- no
 * double-tap, no swipe, no pinch, and a tap on the video would do nothing while
 * the controls were up. `box-none` means "I am not a touch target, my children
 * are", so presses land on buttons and everything else falls through.
 */
export function PlayerControls(props: PlayerControlsProps) {
  const { locked, edges, onToggleLock, keyHandlers } = props;
  const styles = useStyles();

  if (locked) {
    // Locked is a real mode, not a disabled overlay: the point is that a pocket,
    // a sleeve or a child cannot change anything, so there is exactly one
    // control on screen and no gesture does anything at all.
    return (
      <View
        style={[styles.root, edgePadding(edges)]}
        pointerEvents="box-none"
        {...keyHandlers}
      >
        <View style={styles.lockRow}>
          <ControlButton
            label="Unlock"
            accessibilityLabel="Unlock controls"
            onPress={onToggleLock}
            hasTVPreferredFocus
          />
        </View>
      </View>
    );
  }

  return <UnlockedControls {...props} />;
}

function UnlockedControls({
  keyHandlers,
  title,
  subtitle,
  isPaused,
  isLive,
  canSeek,
  position,
  start,
  end,
  buffered,
  rate,
  scaling,
  behindLive,
  edges,
  onTogglePlay,
  onSkip,
  onSeek,
  onScrubPreview,
  onSeekBarFocusChange,
  onOpenSettings,
  onCycleScaling,
  onToggleLock,
  onGoLive,
  onExit,
}: PlayerControlsProps) {
  const styles = useStyles();
  const metrics = useMetrics();
  const chrome = resolvePlayerChrome(metrics);

  const elapsed = formatTime(position - start);
  const total = formatTime(end - start);

  /**
   * What the two readouts either side of the bar say.
   *
   * A film has an elapsed time and a total. A live stream has neither: the
   * "total" is a window that slides forward every second, so printing it would
   * show a duration that never changes while the content does. What a live
   * viewer actually wants to know is whether they are AT the edge or behind it,
   * so that is what the labels say -- and how far behind, since that is the
   * number that tells them whether they have missed the goal.
   */
  const leftLabel = isLive
    ? behindLive
      ? `-${formatTime(end - position)}`
      : 'Live'
    : elapsed;
  const rightLabel = isLive ? null : total;

  return (
    <View
      style={[styles.root, edgePadding(edges)]}
      pointerEvents="box-none"
      {...keyHandlers}
    >
      <View style={styles.top} pointerEvents="box-none">
        {metrics.isTouch ? (
          <ControlButton
            glyph={glyph.close}
            accessibilityLabel="Close player"
            onPress={onExit}
          />
        ) : null}

        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {isLive ? <LivePill behind={behindLive} /> : null}
      </View>

      {/* autoFocus so waking the overlay puts focus on a real control rather
          than leaving it lost behind the video surface.

          box-none here for the same reason as on the root: without it this
          container is itself a touch target, and a swipe that begins in the gap
          between the scrub bar and the buttons would be swallowed rather than
          reaching the gesture layer underneath. An ordinary View does not let a
          touch fall through to a sibling behind it just because it has no
          handler of its own. */}
      <TVFocusGuideView
        autoFocus
        pointerEvents="box-none"
        style={styles.bottom}
      >
        {isLive && !canSeek ? (
          // No DVR window: a bar with nowhere to go is worse than no bar, so say
          // plainly why there is nothing to drag rather than showing a grey
          // track the user will try to grab.
          <Text style={styles.hint}>
            Live broadcast · this stream has no rewind window
          </Text>
        ) : (
          <View style={styles.timeRow}>
            <Text style={styles.time}>{leftLabel}</Text>

            <View style={styles.seekBarSlot}>
              <SeekBar
                position={position}
                start={start}
                end={end}
                buffered={buffered}
                disabled={!canSeek}
                onSeek={onSeek}
                onScrubPreview={onScrubPreview}
                onFocusChange={onSeekBarFocusChange}
                onPress={onTogglePlay}
              />
            </View>

            {rightLabel ? <Text style={styles.time}>{rightLabel}</Text> : null}
          </View>
        )}

        <View style={styles.buttonRow}>
          {metrics.isTouch ? (
            // First in the row, so it lands under the left thumb in landscape --
            // and round rather than a pill, so the one control you reach for
            // without looking is the one shape that is not a rectangle.
            <ControlButton
              glyph={isPaused ? glyph.play : glyph.pause}
              accessibilityLabel={isPaused ? 'Play' : 'Pause'}
              onPress={onTogglePlay}
              variant="play"
            />
          ) : null}

          {metrics.isTV ? (
            <>
              <ControlButton
                glyph={glyph.rewind}
                label={`${SEEK_STEP_SECONDS}s`}
                accessibilityLabel={`Back ${SEEK_STEP_SECONDS} seconds`}
                onPress={() => onSkip(-SEEK_STEP_SECONDS)}
                disabled={!canSeek}
              />
              <ControlButton
                glyph={isPaused ? glyph.play : glyph.pause}
                label={isPaused ? 'Play' : 'Pause'}
                accessibilityLabel={isPaused ? 'Play' : 'Pause'}
                onPress={onTogglePlay}
                // The one control that claims focus when the overlay appears.
                hasTVPreferredFocus
              />
              <ControlButton
                glyph={glyph.forward}
                label={`${SEEK_STEP_SECONDS}s`}
                accessibilityLabel={`Forward ${SEEK_STEP_SECONDS} seconds`}
                onPress={() => onSkip(SEEK_STEP_SECONDS)}
                disabled={!canSeek}
              />
            </>
          ) : null}

          {behindLive ? (
            <ControlButton
              glyph={glyph.live}
              label="Go live"
              accessibilityLabel="Jump to live"
              onPress={onGoLive}
            />
          ) : null}

          <ControlButton
            label={formatRate(rate)}
            accessibilityLabel={`Speed ${formatRate(rate)}`}
            onPress={onOpenSettings}
          />

          <ControlButton
            label={SCALING_LABEL[scaling]}
            accessibilityLabel={`Picture size: ${SCALING_LABEL[scaling]}`}
            onPress={onCycleScaling}
          />

          {metrics.isTouch ? (
            <ControlButton
              label="Lock"
              accessibilityLabel="Lock controls"
              onPress={onToggleLock}
            />
          ) : null}

          <ControlButton
            glyph={glyph.settings}
            label={chrome.compact ? undefined : 'Settings'}
            accessibilityLabel="Playback settings"
            onPress={onOpenSettings}
          />

          {metrics.isTV ? (
            <ControlButton
              label="Back"
              accessibilityLabel="Back"
              onPress={onExit}
            />
          ) : null}
        </View>

        {chrome.showsKeyHints ? (
          <Text style={styles.hint}>
            OK selects · Back exits · left/right skips {SEEK_STEP_SECONDS}s when
            the controls are hidden or the bar is focused · press and hold to
            keep skipping
          </Text>
        ) : null}
      </TVFocusGuideView>
    </View>
  );
}

function LivePill({ behind }: { behind: boolean }) {
  const styles = useStyles();

  return (
    <View style={[styles.livePill, behind && styles.livePillBehind]}>
      <Text style={styles.liveLabel}>LIVE</Text>
    </View>
  );
}

/**
 * Screen-edge padding, applied inline rather than in the StyleSheet.
 *
 * It depends on the safe-area insets, and those are not part of `Metrics` -- they
 * come from a different provider and change on rotation independently of the
 * window size (the cutout that was at the top is at the left in landscape). A
 * `makeStyles` factory only sees metrics, so this is the one part of the
 * overlay's layout that cannot live in a cached sheet.
 */
function edgePadding(edges: EdgeInsets) {
  return {
    paddingTop: edges.top,
    paddingRight: edges.right,
    paddingBottom: edges.bottom,
    paddingLeft: edges.left,
  };
}

const useStyles = makeStyles(metrics => {
  const chrome = resolvePlayerChrome(metrics);

  return {
    root: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'space-between',
    },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: chrome.gap,
    },
    titleBlock: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...metrics.typography.title,
      color: colors.textPrimary,
    },
    subtitle: {
      ...metrics.typography.body,
      color: colors.textSecondary,
    },
    bottom: {
      gap: chrome.gap,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    seekBarSlot: {
      flex: 1,
    },
    time: {
      ...metrics.typography.caption,
      color: colors.textSecondary,
      // Stops the readout jittering as the digits change.
      fontVariant: ['tabular-nums'],
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      // Wrapping keeps every control reachable on a 390dp-wide screen instead of
      // pushing the last one off the edge -- which on a TV would also mean the
      // D-pad could focus something invisible.
      flexWrap: 'wrap',
      gap: chrome.gap,
    },
    lockRow: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    hint: {
      ...metrics.typography.caption,
      color: colors.textMuted,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.sm,
      backgroundColor: colors.live,
    },
    livePillBehind: {
      // Behind the edge, "LIVE" is a claim the picture is not backing up, so it
      // drops to a neutral surface until the viewer jumps back.
      backgroundColor: colors.surface,
    },
    liveLabel: {
      ...metrics.typography.label,
      color: colors.textPrimary,
    },
  };
});
