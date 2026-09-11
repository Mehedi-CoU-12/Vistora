import React from 'react';
import { Text, TVFocusGuideView, View } from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { ControlButton } from './ControlButton';
import { formatTime } from './formatTime';
import { PlayerIcon } from './PlayerIcon';
import {
  formatRate,
  SCALING_LABEL,
  SEEK_STEP_SECONDS,
  type ScalingMode,
} from './playbackOptions';
import {
  resolvePlayerChrome,
  resolveScrimHeights,
  TITLE_GAP,
  TITLE_OFFSET,
  type EdgeInsets,
} from './playerLayout';
import type { RemoteKeyHandlers } from './remoteKeys';
import { Scrim } from './Scrim';
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
  /** Touch only, and only where the platform offers it. */
  onPictureInPicture?: () => void;
  onExit: () => void;
}

/**
 * The control overlay.
 *
 * ---------------------------------------------------------------------------
 * Three zones, and what decides which zone a control belongs in
 * ---------------------------------------------------------------------------
 * Everything used to live along the bottom: the scrub bar, then one row holding
 * play, skip, speed, picture size, lock, settings and back. That row is where a
 * player overlay goes wrong, because it mixes two kinds of control that want
 * opposite things. So they are now separated by *how often a hand reaches for
 * them*, not by what they do:
 *
 *   Top left     Leave. One button, in the corner every application on every
 *                platform has trained people to look at, and nowhere near
 *                anything that changes playback -- which is the point: exit was
 *                previously a pill in the middle of a row of pills, one slip
 *                away from Pause.
 *
 *   Top right    The things you set once for a piece of content and then forget:
 *                picture size, pop out, lock, settings. Icons with no words,
 *                because they are a cluster of small round shapes at the edge of
 *                the frame rather than a sentence to read -- and because the
 *                words were what made the old bottom row too long to scan.
 *
 *   Bottom       The scrub bar and its readouts -- and, on a TV, the skip /
 *                play / skip group under it. These are what a hand actually
 *                reaches for while watching.
 *
 *   Centre       The transport, on touch only. See `transportPlacement`: a
 *                thumb reaches the middle of a phone without the hand moving,
 *                every phone video app puts it there, and -- the reason it had
 *                to move -- a bottom strip carrying the bar AND a 60dp play
 *                button is 120dp of chrome, which on a handset in landscape is
 *                a third of the screen. A remote keeps the bottom arrangement,
 *                because D-pad focus cannot reach the middle of the picture
 *                without taking left/right away from the scrub bar.
 *
 * ---------------------------------------------------------------------------
 * The two devices differ in what exists, not where it goes
 * ---------------------------------------------------------------------------
 * That is a change from the previous arrangement, where the two had genuinely
 * different layouts. The zones above suit a remote and a thumb equally well, so
 * what is left is a shorter list of real differences:
 *
 *   Lock         Touch only. A remote does not go in a pocket.
 *   Pop out      Touch only; there is nothing to pop out of on a TV.
 *   Shortcuts    Picture size and pop out drop out of the cluster on a narrow
 *                screen (see `showsOptionShortcuts`) -- they are both in the
 *                settings panel as well, and on a 390dp phone four icons plus a
 *                back button leave no room for the title.
 *   Key hints    TV only, because nothing on a remote is self-evident.
 *   Transport    Centre of the picture on touch, bottom strip on a TV -- the
 *                zone list above says why.
 *   Scrims       TV only. See `showsScrims`: the gradients are sized from the
 *                controls they back, and on a phone in landscape the pair came
 *                to about 310dp of a 390dp screen and met in the middle, so
 *                raising the controls drew a curtain over the film. On touch the
 *                chrome backs itself -- the buttons are already translucent
 *                pills and discs, and the loose text gets a shadow.
 *
 * Skip buttons are now on *both*, which is the other change worth naming. The
 * argument for leaving them off a phone was that double-tapping either side of
 * the screen already skips and a second way to do it is clutter -- true when it
 * was competing with five other buttons for the same row. With the options gone
 * to the top right the transport row holds three controls, the standard
 * skip/play/skip group fits without crowding anything, and the gesture stops
 * being the *only* way to skip, which it never should have been: it is the one
 * gesture in the player a new user has no way to discover.
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
  const metrics = useMetrics();

  if (locked) {
    const scrim = resolveScrimHeights(resolvePlayerChrome(metrics), edges, {
      locked: true,
    });

    // Locked is a real mode, not a disabled overlay: the point is that a pocket,
    // a sleeve or a child cannot change anything, so there is exactly one
    // control on screen and no gesture does anything at all. It keeps its word
    // as well as its icon -- it is the only thing on screen and the only way
    // back, which is not a moment to make someone guess at a pictogram.
    return (
      <View style={styles.root} pointerEvents="box-none" {...keyHandlers}>
        {/* One button's worth, so the way out of the lock stays readable over a
            bright frame without dimming the film it is locked on. */}
        <Scrim edge="bottom" geometry={scrim.bottom} />

        <View
          style={[styles.lockRow, bottomPadding(edges)]}
          pointerEvents="box-none"
        >
          <ControlButton
            icon="unlock"
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
  onPictureInPicture,
  onExit,
}: PlayerControlsProps) {
  const styles = useStyles();
  const metrics = useMetrics();
  const chrome = resolvePlayerChrome(metrics);
  const scrim = resolveScrimHeights(chrome, edges);

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

  const centred = chrome.transportPlacement === 'centre';

  /**
   * The skip / play / skip group, built once and placed by `transportPlacement`.
   *
   * One node rather than one per placement, because the group is the same group
   * either way -- same sizes, same order, same handlers, same preferred focus.
   * Writing it twice would mean two places to keep a 10-second step or a
   * disabled state in sync, and the two copies would be next to each other,
   * which is exactly how they stop matching.
   */
  const transport = (
    // box-none: the row itself is only a container, and on touch it is stretched
    // across the middle of the picture where every swipe starts. Without it a
    // drag beginning in the gap between Play and a skip button dies here instead
    // of reaching the gesture layer.
    <View style={styles.transport} pointerEvents="box-none">
      <ControlButton
        icon="rewind"
        variant="skip"
        accessibilityLabel={`Back ${SEEK_STEP_SECONDS} seconds`}
        onPress={() => onSkip(-SEEK_STEP_SECONDS)}
        disabled={!canSeek}
      />
      <ControlButton
        icon={isPaused ? 'play' : 'pause'}
        variant="play"
        accessibilityLabel={isPaused ? 'Play' : 'Pause'}
        onPress={onTogglePlay}
        // The one control that claims focus when the overlay appears.
        hasTVPreferredFocus
      />
      <ControlButton
        icon="forward"
        variant="skip"
        accessibilityLabel={`Forward ${SEEK_STEP_SECONDS} seconds`}
        onPress={() => onSkip(SEEK_STEP_SECONDS)}
        disabled={!canSeek}
      />
    </View>
  );

  /**
   * Kept out of the transport group and pinned to the end of its own row.
   *
   * It appears and disappears as the viewer drifts off the live edge, and a
   * button that materialises next to Play would move the controls under a thumb
   * already on its way down -- which is why it stays in the bottom strip even
   * where the transport has gone to the middle of the picture.
   */
  const goLive = behindLive ? (
    <ControlButton
      icon="live"
      label="Go live"
      accessibilityLabel="Jump to live"
      onPress={onGoLive}
    />
  ) : null;

  return (
    <View style={styles.root} pointerEvents="box-none" {...keyHandlers}>
      {/* Behind everything, and outside the padded rows on purpose: an
          absolutely positioned child is placed inside its parent's padding, so a
          scrim in the top bar would stop short of the screen edge and leave a
          bright band above itself. */}
      <Scrim edge="top" geometry={scrim.top} />
      <Scrim edge="bottom" geometry={scrim.bottom} />

      <View style={[styles.top, topPadding(edges)]} pointerEvents="box-none">
        <ControlButton
          icon="back"
          variant="icon"
          accessibilityLabel="Leave the player"
          onPress={onExit}
        />

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

        <View style={styles.cluster}>
          {isLive ? <LivePill behind={behindLive} /> : null}

          {/* Only when it is not 1x. A speed chip that permanently reads "1x" is
              a label for the absence of a setting, and it was competing for the
              row with the settings button that changes it. Off the default, it
              becomes something else: a standing reminder of why the film sounds
              wrong, one press from the panel that undoes it. */}
          {rate !== 1 ? (
            <ControlButton
              label={formatRate(rate)}
              accessibilityLabel={`Speed ${formatRate(rate)}. Change it`}
              onPress={onOpenSettings}
            />
          ) : null}

          {chrome.showsOptionShortcuts ? (
            <ControlButton
              icon="aspect"
              variant="icon"
              // The current mode has to be *said*, since dropping the "Fit" /
              // "Fill" / "Stretch" label is exactly what made this an icon. A
              // sighted user gets the same answer from the readout the tap
              // raises; without this a screen reader would get neither.
              accessibilityLabel={`Picture size: ${SCALING_LABEL[scaling]}. Change it`}
              onPress={onCycleScaling}
            />
          ) : null}

          {chrome.showsOptionShortcuts && onPictureInPicture ? (
            <ControlButton
              icon="pip"
              variant="icon"
              accessibilityLabel="Pop out into a floating window"
              onPress={onPictureInPicture}
            />
          ) : null}

          {metrics.isTouch ? (
            <ControlButton
              icon="lock"
              variant="icon"
              accessibilityLabel="Lock the controls"
              onPress={onToggleLock}
            />
          ) : null}

          <ControlButton
            icon="settings"
            variant="icon"
            accessibilityLabel="Playback settings"
            onPress={onOpenSettings}
          />
        </View>
      </View>

      {/*
        The transport, floating over the middle of the picture on touch.

        Absolutely positioned over the whole overlay rather than placed as a
        third flex child, because the root distributes its children with
        `space-between` and a middle child would be centred in whatever is left
        between the two bars -- which is not the middle of the screen, and moves
        every time the title wraps or the live pill appears. Pinned to all four
        edges and centred in both axes, it is the middle of the *picture*, which
        is what a thumb aims at.
      */}
      {centred ? (
        <View style={styles.centreTransport} pointerEvents="box-none">
          {transport}
        </View>
      ) : null}

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
        style={[styles.bottom, bottomPadding(edges)]}
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

        {/* Nothing at all on touch unless the viewer has drifted off the live
            edge: the transport is in the middle of the picture, so the bottom
            strip is the bar and its readouts and no more. */}
        {centred ? (
          goLive ? (
            <View style={styles.goLiveRow} pointerEvents="box-none">
              {goLive}
            </View>
          ) : null
        ) : (
          <View style={styles.transportRow} pointerEvents="box-none">
            {transport}
            {goLive}
          </View>
        )}

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
  const metrics = useMetrics();
  const chrome = resolvePlayerChrome(metrics);

  return (
    <View style={[styles.livePill, behind && styles.livePillBehind]}>
      <PlayerIcon
        name="live"
        size={chrome.glyphSize}
        // Behind the edge the whole pill drops to a neutral surface, so the dot
        // has to carry the same demotion or it reads as a live indicator that
        // has merely changed background.
        color={behind ? colors.textMuted : colors.textPrimary}
      />
      <Text style={[styles.liveLabel, behind && styles.liveLabelBehind]}>
        LIVE
      </Text>
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
 *
 * It is split per zone rather than applied once to the root because the scrims
 * are absolutely positioned children of that root, and Yoga places an absolute
 * child inside its parent's padding -- so padding the root would inset the
 * gradients from the screen edge by the width of the gutter.
 */
function topPadding(edges: EdgeInsets) {
  return {
    paddingTop: edges.top,
    paddingRight: edges.right,
    paddingLeft: edges.left,
  };
}

function bottomPadding(edges: EdgeInsets) {
  return {
    paddingRight: edges.right,
    paddingBottom: edges.bottom,
    paddingLeft: edges.left,
  };
}

const useStyles = makeStyles(metrics => {
  const chrome = resolvePlayerChrome(metrics);

  /**
   * What backs the loose text where there is no scrim behind it.
   *
   * The buttons need nothing: they are translucent pills and discs with a
   * hairline border, so they carry their own contrast onto any frame. The text
   * that is not inside one -- the title, the subtitle, the two time readouts,
   * the live-stream hint -- had been relying on the gradient, and white type on
   * a white sky with the gradient gone is simply not there.
   *
   * A shadow is what replaces it because it costs the picture a couple of dp
   * around each glyph instead of a third of the screen, and it scales with the
   * content rather than with the layout: no geometry to keep in sync, nothing to
   * recompute when the phone is turned. Offset down by a dp as well as blurred,
   * so the darkest part sits where the eye reads the letterform against, not
   * evenly around it as a halo.
   */
  const shadow = chrome.showsScrims
    ? null
    : {
        textShadowColor: 'rgba(4, 6, 12, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 5,
      };

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
      // Not `center`: the title block is two lines and the buttons are one, so
      // centring them against each other drops the buttons half a line down the
      // screen and the whole bar looks like it is sagging in the middle.
      alignItems: 'flex-start',
      gap: chrome.gap,
    },
    titleBlock: {
      flex: 1,
      // Both from `playerLayout`, which measures this block to size the scrim
      // behind it -- see `chrome.titleBlock`. Hard-coding them here as well is
      // how the gradient ends up stopping a few dp above the subtitle.
      gap: TITLE_GAP,
      paddingTop: TITLE_OFFSET,
    },
    title: {
      ...metrics.typography.title,
      color: colors.textPrimary,
      ...shadow,
    },
    subtitle: {
      ...metrics.typography.body,
      color: colors.textSecondary,
      ...shadow,
    },
    cluster: {
      flexDirection: 'row',
      // Stretch, not centre: the round buttons set the row's height and the
      // labelled chips beside them (the speed readout, the LIVE pill) have a
      // smaller natural one. Centred, a 40dp chip floats inside a 48dp row and
      // the cluster stops reading as one group of controls.
      alignItems: 'stretch',
      gap: chrome.gap,
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
      ...shadow,
    },
    transportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: chrome.gap,
    },
    /**
     * The middle of the picture, for the touch placement of the transport.
     *
     * Not inset by `edges`: it is centred in the screen, and a safe-area inset
     * applied to a centred thing only moves it off centre. The insets exist to
     * keep chrome out from under a cutout or a system bar, and the middle of the
     * screen is not under either.
     */
    centreTransport: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** Where "Go live" sits once the transport has left the bottom strip. */
    goLiveRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    transport: {
      flexDirection: 'row',
      alignItems: 'center',
      // Wider apart in the middle of the picture than in a bottom strip. In a
      // strip the group is bounded by the bar above it and the screen edge below,
      // so a tight gap is what makes it read as one group; floating over the
      // film there is nothing to bound it, and three discs 8dp apart read as one
      // lozenge -- with Play, the control aimed at without looking, sharing an
      // edge with a skip button a thumb can land on by mistake.
      gap: chrome.transportPlacement === 'centre' ? spacing.xl : chrome.gap,
    },
    lockRow: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    hint: {
      ...metrics.typography.caption,
      color: colors.textMuted,
      ...shadow,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      // Matches the height of the round buttons beside it, so the cluster reads
      // as one row of controls rather than a pill floating next to some.
      height: chrome.iconButton,
      borderRadius: radius.pill,
      backgroundColor: colors.live,
    },
    livePillBehind: {
      // Behind the edge, "LIVE" is a claim the picture is not backing up, so it
      // drops to a neutral surface until the viewer jumps back.
      backgroundColor: colors.controlSurface,
    },
    liveLabel: {
      ...metrics.typography.label,
      color: colors.textPrimary,
    },
    liveLabelBehind: {
      color: colors.textMuted,
    },
  };
});
