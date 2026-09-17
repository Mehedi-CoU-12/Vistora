import React, { useState } from 'react';
import { ScrollView, Text, TVFocusGuideView, View } from 'react-native';

import type { PlayerPrefs } from '../state/playerPrefs';
import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { ControlButton } from './ControlButton';
import {
  formatCountdown,
  formatPercent,
  formatRate,
  formatSkipStep,
  PLAYBACK_RATES,
  SCALING_DESCRIPTION,
  SCALING_LABEL,
  SCALING_MODES,
  SEEK_GESTURE_LABEL,
  SEEK_GESTURE_SPEEDS,
  SKIP_STEPS,
  SLEEP_TIMER_MINUTES,
  sleepTimerLabel,
  SUBTITLE_LIFTS,
  SUBTITLE_OPACITIES,
  SUBTITLE_SIZES,
  type LabelledValue,
  type ScalingMode,
  type TrackChoice,
  type TrackSelection,
} from './playbackOptions';
import type { EdgeInsets } from './playerLayout';
import { resolvePlayerChrome } from './playerLayout';

export type SettingsTab = 'playback' | 'audio' | 'subtitles' | 'general';

const TABS: readonly { key: SettingsTab; label: string }[] = [
  { key: 'playback', label: 'Playback' },
  { key: 'audio', label: 'Audio' },
  { key: 'subtitles', label: 'Subtitles' },
  { key: 'general', label: 'General' },
];

const VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1];

interface SettingsPanelProps {
  onClose: () => void;
  edges: EdgeInsets;

  rate: number;
  onRateChange: (rate: number) => void;

  qualities: TrackChoice[];
  selectedQuality: TrackSelection;
  onSelectQuality: (selection: TrackSelection) => void;

  scaling: ScalingMode;
  onScalingChange: (mode: ScalingMode) => void;

  audioTracks: TrackChoice[];
  selectedAudio: TrackSelection;
  onSelectAudio: (selection: TrackSelection) => void;

  textTracks: TrackChoice[];
  selectedText: TrackSelection;
  onSelectText: (selection: TrackSelection) => void;

  volume: number;
  onVolumeChange: (volume: number) => void;
  muted: boolean;
  onToggleMute: () => void;

  loop: boolean;
  onToggleLoop: () => void;

  sleepMinutes: number;
  sleepRemainingMs: number | null;
  onSleepChange: (minutes: number) => void;

  hasUpNext: boolean;

  prefs: PlayerPrefs;
  onPrefChange: <K extends keyof PlayerPrefs>(
    key: K,
    value: PlayerPrefs[K],
  ) => void;
  onResetPrefs: () => void;
  prefsAreDefault: boolean;

  onPictureInPicture?: () => void;

  info: string[];
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { onClose, edges } = props;
  const styles = useStyles();
  const metrics = useMetrics();
  const chrome = resolvePlayerChrome(metrics);
  const sheet = chrome.panelMode === 'sheet';

  const [tab, setTab] = useState<SettingsTab>('playback');

  return (
    <TVFocusGuideView
      autoFocus
      style={[
        styles.panel,
        sheet ? styles.sheet : styles.side,
        panelPadding(edges, sheet),
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.heading}>Player settings</Text>
        <ControlButton
          icon="close"
          variant="icon"
          accessibilityLabel="Close settings"
          onPress={onClose}
        />
      </View>

      <View style={styles.tabs}>
        {TABS.map(entry => (
          <ControlButton
            key={entry.key}
            label={entry.label}
            accessibilityLabel={`${entry.label} settings`}
            selected={entry.key === tab}
            onPress={() => setTab(entry.key)}
            hasTVPreferredFocus={entry.key === 'playback'}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'playback' ? <PlaybackTab {...props} /> : null}
        {tab === 'audio' ? <AudioTab {...props} /> : null}
        {tab === 'subtitles' ? <SubtitlesTab {...props} /> : null}
        {tab === 'general' ? <GeneralTab {...props} /> : null}
      </ScrollView>
    </TVFocusGuideView>
  );
}

function PlaybackTab({
  rate,
  onRateChange,
  qualities,
  selectedQuality,
  onSelectQuality,
  scaling,
  onScalingChange,
  info,
}: SettingsPanelProps) {
  const styles = useStyles();

  return (
    <>
      <Section title="Speed">
        <OptionRow>
          {PLAYBACK_RATES.map(option => (
            <ControlButton
              key={option}
              label={formatRate(option)}
              accessibilityLabel={`Speed ${formatRate(option)}`}
              selected={option === rate}
              onPress={() => onRateChange(option)}
            />
          ))}
        </OptionRow>
      </Section>

      <Section
        title="Quality"
        caption={
          qualities.length === 0
            ? 'This stream offers one quality only.'
            : 'Auto follows the connection. A fixed choice stays put.'
        }
      >
        <View style={styles.list}>
          <TrackRow
            label="Auto"
            selected={selectedQuality === 'auto'}
            onPress={() => onSelectQuality('auto')}
          />
          {qualities.map(quality => (
            <TrackRow
              key={quality.index}
              label={quality.label}
              detail={quality.detail}
              selected={selectedQuality === quality.index}
              onPress={() => onSelectQuality(quality.index)}
            />
          ))}
        </View>
      </Section>

      <Section title="Screen fit" caption={SCALING_DESCRIPTION[scaling]}>
        <OptionRow>
          {SCALING_MODES.map(mode => (
            <ControlButton
              key={mode}
              label={SCALING_LABEL[mode]}
              accessibilityLabel={`Screen fit ${SCALING_LABEL[mode]}`}
              selected={mode === scaling}
              onPress={() => onScalingChange(mode)}
            />
          ))}
        </OptionRow>
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
    </>
  );
}

function AudioTab({
  audioTracks,
  selectedAudio,
  onSelectAudio,
  volume,
  onVolumeChange,
  muted,
  onToggleMute,
  prefs,
  onPrefChange,
}: SettingsPanelProps) {
  const styles = useStyles();

  return (
    <>
      <TrackSection
        title="Audio track"
        emptyLabel="This stream offers one audio track only."
        tracks={audioTracks}
        selection={selectedAudio}
        onSelect={onSelectAudio}
      />

      <Section
        title="Volume"
        caption={
          prefs.keepDeviceVolume
            ? 'The player is leaving the device volume alone.'
            : undefined
        }
      >
        <OptionRow>
          {VOLUME_STEPS.map(step => (
            <ControlButton
              key={step}
              label={formatPercent(step)}
              accessibilityLabel={`Volume ${formatPercent(step)}`}
              selected={!prefs.keepDeviceVolume && !muted && step === volume}
              disabled={prefs.keepDeviceVolume}
              onPress={() => onVolumeChange(step)}
            />
          ))}
        </OptionRow>
      </Section>

      <Section title="Also">
        <OptionRow>
          <ControlButton
            label={muted ? 'Unmute' : 'Mute'}
            accessibilityLabel={muted ? 'Unmute' : 'Mute'}
            selected={muted}
            disabled={prefs.keepDeviceVolume}
            onPress={onToggleMute}
          />
          <ControlButton
            label="Keep device volume"
            accessibilityLabel="Keep device volume"
            selected={prefs.keepDeviceVolume}
            onPress={() =>
              onPrefChange('keepDeviceVolume', !prefs.keepDeviceVolume)
            }
          />
        </OptionRow>
        <Text style={styles.caption}>
          With this on, the volume swipe and the buttons above stay out of the
          way and the hardware keys do the work.
        </Text>
      </Section>
    </>
  );
}

function SubtitlesTab({
  textTracks,
  selectedText,
  onSelectText,
  prefs,
  onPrefChange,
}: SettingsPanelProps) {
  const styles = useStyles();
  const off = selectedText === 'off';

  return (
    <>
      <TrackSection
        title="Subtitle track"
        emptyLabel="None in this stream."
        tracks={textTracks}
        selection={selectedText}
        onSelect={onSelectText}
        allowOff
      />

      {off ? (
        <Text style={styles.info}>
          Subtitles are off, so nothing below will change the picture until you
          pick a track.
        </Text>
      ) : null}

      <Section title="Text size">
        <ValueRow
          options={SUBTITLE_SIZES}
          selected={prefs.subtitleSize}
          name="Text size"
          onSelect={value => onPrefChange('subtitleSize', value)}
        />
      </Section>

      <Section
        title="Vertical position"
        caption="How far the lines sit above the bottom of the frame."
      >
        <ValueRow
          options={SUBTITLE_LIFTS}
          selected={prefs.subtitleLift}
          name="Vertical position"
          onSelect={value => onPrefChange('subtitleLift', value)}
        />
      </Section>

      <Section title="Opacity">
        <ValueRow
          options={SUBTITLE_OPACITIES}
          selected={prefs.subtitleOpacity}
          name="Opacity"
          onSelect={value => onPrefChange('subtitleOpacity', value)}
        />
      </Section>

      <Text style={styles.caption}>
        Colour, outline and font come from the stream itself. This player leaves
        them as the source wrote them.
      </Text>
    </>
  );
}

function GeneralTab({
  loop,
  onToggleLoop,
  sleepMinutes,
  sleepRemainingMs,
  onSleepChange,
  hasUpNext,
  prefs,
  onPrefChange,
  onResetPrefs,
  prefsAreDefault,
  onPictureInPicture,
}: SettingsPanelProps) {
  const styles = useStyles();

  return (
    <>
      <Section
        title="Skip step"
        caption="How far the skip buttons and a double-tap at either edge move."
      >
        <OptionRow>
          {SKIP_STEPS.map(step => (
            <ControlButton
              key={step}
              label={formatSkipStep(step)}
              accessibilityLabel={`Skip step ${formatSkipStep(step)}`}
              selected={step === prefs.skipStep}
              onPress={() => onPrefChange('skipStep', step)}
            />
          ))}
        </OptionRow>
      </Section>

      <Section
        title="Swipe seek"
        caption="How far one drag across the screen travels."
      >
        <OptionRow>
          {SEEK_GESTURE_SPEEDS.map(speed => (
            <ControlButton
              key={speed}
              label={SEEK_GESTURE_LABEL[speed]}
              accessibilityLabel={`Swipe seek ${SEEK_GESTURE_LABEL[speed]}`}
              selected={speed === prefs.seekSpeed}
              onPress={() => onPrefChange('seekSpeed', speed)}
            />
          ))}
        </OptionRow>
      </Section>

      <Section
        title="Sleep timer"
        caption={
          sleepRemainingMs === null
            ? 'Pauses playback when it runs out.'
            : `Pausing in ${formatCountdown(sleepRemainingMs)}s.`
        }
      >
        <OptionRow>
          {SLEEP_TIMER_MINUTES.map(minutes => (
            <ControlButton
              key={minutes}
              label={sleepTimerLabel(minutes)}
              accessibilityLabel={`Sleep timer ${sleepTimerLabel(minutes)}`}
              selected={minutes === sleepMinutes}
              onPress={() => onSleepChange(minutes)}
            />
          ))}
        </OptionRow>
      </Section>

      <Section
        title="Up next"
        caption={
          hasUpNext
            ? 'Rolls into the next episode when this one ends.'
            : 'Nothing queued after this one.'
        }
      >
        <OptionRow>
          <ControlButton
            label="Autoplay next"
            accessibilityLabel="Autoplay the next episode"
            selected={prefs.autoplayNext}
            onPress={() => onPrefChange('autoplayNext', !prefs.autoplayNext)}
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
        </OptionRow>
      </Section>

      <Section title="Reset">
        <OptionRow>
          <ControlButton
            label="Reset player settings"
            accessibilityLabel="Reset player settings"
            disabled={prefsAreDefault}
            onPress={onResetPrefs}
          />
        </OptionRow>
        <Text style={styles.caption}>
          Skip step, swipe seek, subtitle styling and screen fit go back to
          their defaults. Nothing you have watched is touched.
        </Text>
      </Section>
    </>
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

function OptionRow({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.optionRow}>{children}</View>;
}

function ValueRow({
  options,
  selected,
  name,
  onSelect,
}: {
  options: readonly LabelledValue<number>[];
  selected: number;
  name: string;
  onSelect: (value: number) => void;
}) {
  return (
    <OptionRow>
      {options.map(option => (
        <ControlButton
          key={option.value}
          label={option.label}
          accessibilityLabel={`${name} ${option.label}`}
          selected={option.value === selected}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </OptionRow>
  );
}

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

function TrackSection({
  title,
  emptyLabel,
  tracks,
  selection,
  onSelect,
  allowOff = false,
}: {
  title: string;
  emptyLabel: string;
  tracks: TrackChoice[];
  selection: TrackSelection;
  onSelect: (selection: TrackSelection) => void;
  allowOff?: boolean;
}) {
  const styles = useStyles();

  if (tracks.length === 0 && !allowOff) {
    return (
      <Section title={title}>
        <Text style={styles.info}>{emptyLabel}</Text>
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
        />

        {allowOff ? (
          <TrackRow
            label="Off"
            selected={selection === 'off'}
            onPress={() => onSelect('off')}
          />
        ) : null}

        {tracks.map(track => (
          <TrackRow
            key={track.index}
            label={track.label}
            detail={track.detail}
            selected={selection === track.index}
            onPress={() => onSelect(track.index)}
          />
        ))}

        {tracks.length === 0 ? (
          <Text style={styles.info}>{emptyLabel}</Text>
        ) : null}
      </View>
    </Section>
  );
}

function TrackRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();

  return (
    <ControlButton
      icon={selected ? 'tick' : undefined}
      reserveIcon
      label={detail ? `${label} · ${detail}` : label}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
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

    sheet: {
      left: 0,
      right: 0,
      bottom: 0,

      maxHeight: '78%',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },

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
    tabs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: chrome.gap,
      paddingTop: spacing.xs,
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
