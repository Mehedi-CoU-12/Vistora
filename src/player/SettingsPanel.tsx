import React from 'react';
import { ScrollView, Text, TVFocusGuideView, View } from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { ControlButton } from './ControlButton';
import {
  formatRate,
  PLAYBACK_RATES,
  SCALING_DESCRIPTION,
  SCALING_LABEL,
  SCALING_MODES,
  type ScalingMode,
  type TrackChoice,
  type TrackSelection,
} from './playbackOptions';
import type { EdgeInsets } from './playerLayout';
import { resolvePlayerChrome } from './playerLayout';

interface SettingsPanelProps {
  onClose: () => void;
  rate: number;
  onRateChange: (rate: number) => void;
  scaling: ScalingMode;
  onScalingChange: (mode: ScalingMode) => void;
  audioTracks: TrackChoice[];
  selectedAudio: TrackSelection;
  onSelectAudio: (selection: TrackSelection) => void;
  textTracks: TrackChoice[];
  selectedText: TrackSelection;
  onSelectText: (selection: TrackSelection) => void;
  muted: boolean;
  onToggleMute: () => void;
  loop: boolean;
  onToggleLoop: () => void;
  /** Touch only: hand playback to the system's floating window. */
  onPictureInPicture?: () => void;
  /** One line per fact about the stream: resolution, protocol, speed. */
  info: string[];
  edges: EdgeInsets;
}

/**
 * Everything that is a *setting* rather than a control.
 *
 * The split is worth being strict about, because it is what keeps the overlay
 * usable: play, skip and seek are things you do constantly and they live on the
 * bar; speed, picture size, audio track and subtitles are things you set once for
 * a piece of content and then forget. Putting the second group on the bar too --
 * which is the obvious way to build this -- gives a phone a row of nine tiny
 * buttons over the video, and a TV a focus row so long that reaching Back takes
 * eight presses.
 *
 * The panel changes shape rather than scaling: a column down the side where
 * there is width for one (TV, tablet, phone in landscape), and a sheet up from
 * the bottom on a narrow screen, which is where a thumb can actually reach.
 */
export function SettingsPanel({
  onClose,
  rate,
  onRateChange,
  scaling,
  onScalingChange,
  audioTracks,
  selectedAudio,
  onSelectAudio,
  textTracks,
  selectedText,
  onSelectText,
  muted,
  onToggleMute,
  loop,
  onToggleLoop,
  onPictureInPicture,
  info,
  edges,
}: SettingsPanelProps) {
  const styles = useStyles();
  const metrics = useMetrics();
  const chrome = resolvePlayerChrome(metrics);
  const sheet = chrome.panelMode === 'sheet';

  return (
    // autoFocus so opening the panel with the remote lands focus inside it.
    // Without it the D-pad is still driving the bar underneath, and the panel is
    // a picture of a menu rather than a menu.
    <TVFocusGuideView
      autoFocus
      style={[
        styles.panel,
        sheet ? styles.sheet : styles.side,
        panelPadding(edges, sheet),
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.heading}>Playback</Text>
        <ControlButton
          icon="close"
          variant="icon"
          accessibilityLabel="Close settings"
          onPress={onClose}
          hasTVPreferredFocus
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Speed">
          <View style={styles.optionRow}>
            {PLAYBACK_RATES.map(option => (
              <ControlButton
                key={option}
                label={formatRate(option)}
                accessibilityLabel={`Speed ${formatRate(option)}`}
                selected={option === rate}
                onPress={() => onRateChange(option)}
              />
            ))}
          </View>
        </Section>

        <Section title="Picture size" caption={SCALING_DESCRIPTION[scaling]}>
          <View style={styles.optionRow}>
            {SCALING_MODES.map(mode => (
              <ControlButton
                key={mode}
                label={SCALING_LABEL[mode]}
                accessibilityLabel={`Picture size ${SCALING_LABEL[mode]}`}
                selected={mode === scaling}
                onPress={() => onScalingChange(mode)}
              />
            ))}
          </View>
        </Section>

        <TrackSection
          title="Audio"
          tracks={audioTracks}
          selection={selectedAudio}
          onSelect={onSelectAudio}
          styles={styles}
        />

        <TrackSection
          title="Subtitles"
          tracks={textTracks}
          selection={selectedText}
          onSelect={onSelectText}
          allowOff
          styles={styles}
        />

        <Section title="Also">
          <View style={styles.optionRow}>
            <ControlButton
              label={muted ? 'Unmute' : 'Mute'}
              accessibilityLabel={muted ? 'Unmute' : 'Mute'}
              selected={muted}
              onPress={onToggleMute}
            />
            <ControlButton
              label="Repeat"
              accessibilityLabel="Repeat when finished"
              selected={loop}
              onPress={onToggleLoop}
            />
            {onPictureInPicture ? (
              <ControlButton
                label="Pop out"
                accessibilityLabel="Picture in picture"
                onPress={onPictureInPicture}
              />
            ) : null}
          </View>
        </Section>

        {info.length > 0 ? (
          <Section title="Stream">
            {info.map(line => (
              <Text key={line} style={styles.info}>
                {line}
              </Text>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </TVFocusGuideView>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

/**
 * Padding that keeps the panel clear of the system bars and the cutout.
 *
 * A function rather than an object literal in the JSX for the same reason as in
 * `PlayerControls`: the safe-area insets are not part of `Metrics`, so this is
 * the one piece of the panel's layout that a cached StyleSheet cannot hold.
 *
 * A sheet takes the left and right insets only when they exceed its own padding
 * -- it spans the full width, so in landscape a cutout inset can be larger than
 * the margin, while in portrait it is zero.
 */
function panelPadding(edges: EdgeInsets, sheet: boolean) {
  return sheet
    ? {
        paddingBottom: edges.bottom,
        paddingLeft: Math.max(edges.left, spacing.lg),
        paddingRight: Math.max(edges.right, spacing.lg),
      }
    : {
        paddingTop: edges.top,
        paddingBottom: edges.bottom,
        paddingRight: edges.right,
      };
}

/**
 * A track list, including the two selections that are not tracks.
 *
 * "Auto" is not the same as picking the first track and it is the correct
 * default: a stream can mark a track as the one to use -- the original-language
 * audio, a forced subtitle for a foreign-language scene -- and Media3 honours
 * that until we override it. Offering only the concrete tracks would quietly
 * throw that information away.
 */
function TrackSection({
  title,
  tracks,
  selection,
  onSelect,
  allowOff = false,
  styles,
}: {
  title: string;
  tracks: TrackChoice[];
  selection: TrackSelection;
  onSelect: (selection: TrackSelection) => void;
  allowOff?: boolean;
  styles: ReturnType<typeof useStyles>;
}) {
  if (tracks.length === 0 && !allowOff) {
    return (
      <Section title={title}>
        <Text style={styles.info}>
          This stream offers one audio track only.
        </Text>
      </Section>
    );
  }

  return (
    <Section title={title}>
      <View style={styles.list}>
        <TrackRow
          label="Auto"
          selected={selection === 'auto'}
          onPress={() => onSelect('auto')}
          styles={styles}
        />

        {allowOff ? (
          <TrackRow
            label="Off"
            selected={selection === 'off'}
            onPress={() => onSelect('off')}
            styles={styles}
          />
        ) : null}

        {tracks.map(track => (
          <TrackRow
            key={track.index}
            label={track.label}
            selected={selection === track.index}
            onPress={() => onSelect(track.index)}
            styles={styles}
          />
        ))}

        {tracks.length === 0 ? (
          <Text style={styles.info}>None in this stream.</Text>
        ) : null}
      </View>
    </Section>
  );
}

function TrackRow({
  label,
  selected,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof useStyles>;
}) {
  return (
    <ControlButton
      icon={selected ? 'tick' : undefined}
      // Reserved rather than conditional: without the empty slot the unselected
      // rows would sit a tick's width to the left of the selected one, so the
      // list would appear to indent whichever row happens to be current.
      reserveIcon
      label={label}
      accessibilityLabel={label}
      selected={selected}
      onPress={onPress}
      style={styles.listRow}
    />
  );
}

const useStyles = makeStyles(metrics => {
  const chrome = resolvePlayerChrome(metrics);

  return {
    panel: {
      position: 'absolute',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      gap: spacing.sm,
      paddingTop: spacing.lg,
    },
    /** Up from the bottom edge: where a thumb can reach on a narrow screen. */
    sheet: {
      left: 0,
      right: 0,
      bottom: 0,
      // Never more than about two thirds of the height, so the picture the
      // settings are being applied to stays visible while they change.
      maxHeight: '72%',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    /** Down the side: full height, where there is width to spare for it. */
    side: {
      top: 0,
      right: 0,
      bottom: 0,
      width: chrome.panelWidth,
      paddingLeft: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    heading: {
      ...metrics.typography.sectionTitle,
      color: colors.textPrimary,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      gap: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      ...metrics.typography.label,
      color: colors.textMuted,
    },
    optionRow: {
      flexDirection: 'row',
      // Wrapping is what lets eight speeds and a 320dp panel coexist, and it is
      // also what keeps the row intact when the phone is turned.
      flexWrap: 'wrap',
      gap: chrome.gap,
    },
    list: {
      gap: spacing.xs,
    },
    listRow: {
      alignSelf: 'stretch',
      justifyContent: 'flex-start',
      borderRadius: radius.sm,
    },
    caption: {
      ...metrics.typography.caption,
      color: colors.textMuted,
    },
    info: {
      ...metrics.typography.caption,
      color: colors.textSecondary,
    },
  };
});
