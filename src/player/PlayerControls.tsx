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
  keyHandlers?: RemoteKeyHandlers;
  title: string;
  subtitle?: string;
  isPaused: boolean;
  isLive: boolean;

  canSeek: boolean;

  position: number;
  start: number;
  end: number;
  buffered: number;
  rate: number;
  scaling: ScalingMode;
  locked: boolean;

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

  onPictureInPicture?: () => void;
  onExit: () => void;
}

export function PlayerControls(props: PlayerControlsProps) {
  const { locked, edges, onToggleLock, keyHandlers } = props;
  const styles = useStyles();
  const metrics = useMetrics();

  if (locked) {
    const scrim = resolveScrimHeights(resolvePlayerChrome(metrics), edges, {
      locked: true,
    });

    return (
      <View style={styles.root} pointerEvents="box-none" {...keyHandlers}>
        {}
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

  const leftLabel = isLive
    ? behindLive
      ? `-${formatTime(end - position)}`
      : 'Live'
    : elapsed;
  const rightLabel = isLive ? null : total;

  const centred = chrome.transportPlacement === 'centre';

  const transport = (
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
      {}
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

          {}
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

      {}
      {centred ? (
        <View style={styles.centreTransport} pointerEvents="box-none">
          {transport}
        </View>
      ) : null}

      {}
      <TVFocusGuideView
        autoFocus
        pointerEvents="box-none"
        style={[styles.bottom, bottomPadding(edges)]}
      >
        {isLive && !canSeek ? (
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

        {}
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
        color={behind ? colors.textMuted : colors.textPrimary}
      />
      <Text style={[styles.liveLabel, behind && styles.liveLabelBehind]}>
        LIVE
      </Text>
    </View>
  );
}

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

      alignItems: 'flex-start',
      gap: chrome.gap,
    },
    titleBlock: {
      flex: 1,

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

      fontVariant: ['tabular-nums'],
      ...shadow,
    },
    transportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: chrome.gap,
    },

    centreTransport: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },

    goLiveRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    transport: {
      flexDirection: 'row',
      alignItems: 'center',

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

      height: chrome.iconButton,
      borderRadius: radius.pill,
      backgroundColor: colors.live,
    },
    livePillBehind: {
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
