import React from 'react';
import { Text, View } from 'react-native';

import {
  backgroundAlpha,
  cardAspect,
  colors,
  makeStyles,
  radius,
  spacing,
  useMetrics,
  type CardVariant,
} from '../theme';
import type { ContentItem } from '../types/content';
import { Badge } from './Badge';
import { Focusable } from './Focusable';
import { Gradient } from './Gradient';
import { RemoteImage } from './RemoteImage';

interface ContentCardProps {
  item: ContentItem;
  variant: CardVariant;
  onPress: (item: ContentItem) => void;
  onFocus?: (item: ContentItem) => void;
  hasTVPreferredFocus?: boolean;
  width?: number;

  progress?: number;

  showTitle?: boolean;
}

export const ContentCard = React.memo(function ContentCardView({
  item,
  variant,
  onPress,
  onFocus,
  hasTVPreferredFocus,
  width,
  progress,
  showTitle = true,
}: ContentCardProps) {
  const { cardSize } = useMetrics();
  const styles = useStyles();

  const size =
    width === undefined
      ? cardSize[variant]
      : { width, height: Math.floor(width * cardAspect[variant]) };

  const isMark = item.kind === 'channel' || variant === 'square';

  const meta = item.subtitle;

  const needsScrim =
    !isMark && (progress !== undefined || item.unavailableLabel !== undefined);

  return (
    <Focusable
      onPress={() => onPress(item)}
      onFocus={onFocus ? () => onFocus(item) : undefined}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.card}
      accessibilityLabel={[item.title, item.subtitle]
        .filter(Boolean)
        .join(', ')}
    >
      {active => (
        <View style={{ width: size.width }}>
          <View
            style={[
              styles.artwork,
              size,
              isMark && styles.artworkMark,

              active && styles.artworkActive,
            ]}
          >
            {item.imageUrl ? (
              <RemoteImage
                url={item.imageUrl}
                displayWidth={size.width}
                style={isMark ? styles.mark : styles.image}
                resizeMode={isMark ? 'contain' : 'cover'}
              />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText} numberOfLines={3}>
                  {item.title}
                </Text>
              </View>
            )}

            {}
            {needsScrim ? (
              <Gradient
                colors={[backgroundAlpha(0), backgroundAlpha(0.7)]}
                style={styles.artScrim}
              />
            ) : null}

            {item.badge ? (
              <View style={styles.badgeSlot}>
                <Badge
                  label={item.badge}
                  tone={item.badge === 'LIVE' ? 'live' : 'neutral'}
                />
              </View>
            ) : null}

            {}
            {item.unavailableLabel ? (
              <View style={styles.badgeSlotBottom}>
                <Badge label={item.unavailableLabel} />
              </View>
            ) : null}

            {}
            {progress === undefined ? null : (
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(clamp01(progress) * 100)}%` },
                  ]}
                />
              </View>
            )}
          </View>

          {showTitle ? (
            <Text
              style={[styles.title, active && styles.titleActive]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          ) : null}

          {showTitle && meta ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      )}
    </Focusable>
  );
});

ContentCard.displayName = 'ContentCard';

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

const useStyles = makeStyles(m => ({
  card: {
    padding: spacing.xs,
  },
  artwork: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },

  artworkMark: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
  },

  artworkActive: {
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },

  mark: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  placeholderText: {
    ...m.typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  artScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,

    height: '30%',
  },
  badgeSlot: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  badgeSlotBottom: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(243, 245, 249, 0.25)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  title: {
    ...m.typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  titleActive: {
    color: colors.textPrimary,
  },
  subtitle: {
    ...m.typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
}));
