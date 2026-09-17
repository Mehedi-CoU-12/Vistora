import React from 'react';
import { Text, TVFocusGuideView, View } from 'react-native';

import { colors, makeStyles, radius, spacing } from '../theme';
import { ControlButton } from './ControlButton';
import { formatCountdown } from './playbackOptions';
import { resolvePlayerChrome, type EdgeInsets } from './playerLayout';

interface UpNextCardProps {
  title: string;
  subtitle?: string;

  remainingMs: number | null;

  busy: boolean;

  onPlayNow: () => void;
  onCancel: () => void;
  edges: EdgeInsets;
}

export function UpNextCard({
  title,
  subtitle,
  remainingMs,
  busy,
  onPlayNow,
  onCancel,
  edges,
}: UpNextCardProps) {
  const styles = useStyles();

  const heading =
    remainingMs === null
      ? 'UP NEXT'
      : `UP NEXT IN ${formatCountdown(remainingMs)}`;

  return (
    <View
      style={[
        styles.layer,
        {
          right: edges.right,
          bottom: edges.bottom,
          left: edges.left,
        },
      ]}
      pointerEvents="box-none"
    >
      <TVFocusGuideView autoFocus style={styles.card}>
        <Text style={styles.heading}>{heading}</Text>

        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <ControlButton
            icon="play"
            label={busy ? 'Starting…' : 'Play now'}
            accessibilityLabel={`Play ${title} now`}
            onPress={onPlayNow}
            disabled={busy}
            hasTVPreferredFocus
          />
          <ControlButton
            label="Cancel"
            accessibilityLabel="Stay on this episode"
            onPress={onCancel}
            disabled={busy}
          />
        </View>
      </TVFocusGuideView>
    </View>
  );
}

const useStyles = makeStyles(metrics => {
  const chrome = resolvePlayerChrome(metrics);

  return {
    layer: {
      position: 'absolute',
      alignItems: chrome.compact ? 'stretch' : 'flex-end',
    },
    card: {
      gap: spacing.xs,
      maxWidth: chrome.compact ? undefined : 420,
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.controlBorder,
      backgroundColor: colors.scrim,
    },
    heading: {
      ...metrics.typography.label,
      color: colors.accent,
    },
    title: {
      ...metrics.typography.sectionTitle,
      color: colors.textPrimary,
    },
    subtitle: {
      ...metrics.typography.caption,
      color: colors.textSecondary,
    },
    actions: {
      flexDirection: 'row',
      gap: chrome.gap,
      marginTop: spacing.sm,
    },
  };
});
