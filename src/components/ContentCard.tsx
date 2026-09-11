import React from 'react';
import { Image, Text, View } from 'react-native';

import {
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

interface ContentCardProps {
  item: ContentItem;
  variant: CardVariant;
  onPress: (item: ContentItem) => void;
  onFocus?: (item: ContentItem) => void;
  hasTVPreferredFocus?: boolean;
  width?: number;
}

export function ContentCard({
  item,
  variant,
  onPress,
  onFocus,
  hasTVPreferredFocus,
  width,
}: ContentCardProps) {
  const { cardSize } = useMetrics();
  const styles = useStyles();

  // Scale the height with the width so a fluid card keeps the variant's shape
  // (16:9 for landscape, 2:3 for a poster) instead of stretching the artwork.
  const size =
    width === undefined
      ? cardSize[variant]
      : { width, height: Math.floor(width * cardAspect[variant]) };

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
          <View style={[styles.artwork, size]}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.image}
                // `contain` for channel logos (which have their own padding and
                // should not be cropped), `cover` for posters and stills.
                resizeMode={variant === 'square' ? 'contain' : 'cover'}
              />
            ) : (
              // Never render an empty box: a missing image should still show the
              // title, or the row looks broken rather than incomplete.
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            )}

            {item.badge ? (
              <View style={styles.badgeSlot}>
                <Badge
                  label={item.badge}
                  tone={item.badge === 'LIVE' ? 'live' : 'neutral'}
                />
              </View>
            ) : null}

            {/* Driven by an explicit label rather than by `stream === null`.
                Those used to be the same thing; since series exist they are
                not -- a series has no stream BY DESIGN, and stamping it "Not
                started" would call every show in the Anime tab broken. The
                mapper that knows which situation it is now says so. */}
            {item.unavailableLabel ? (
              <View style={styles.badgeSlotBottom}>
                <Badge label={item.unavailableLabel} />
              </View>
            ) : null}
          </View>

          <Text
            style={[styles.title, active && styles.titleActive]}
            numberOfLines={1}
          >
            {item.title}
          </Text>

          {item.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>
      )}
    </Focusable>
  );
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
  image: {
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
