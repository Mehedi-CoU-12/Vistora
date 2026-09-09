import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

import {cardSize, colors, radius, spacing, typography, type CardVariant} from '../theme';
import type {ContentItem} from '../types/content';
import {Badge} from './Badge';
import {Focusable} from './Focusable';

interface ContentCardProps {
  item: ContentItem;
  variant: CardVariant;
  onPress: (item: ContentItem) => void;
  onFocus?: (item: ContentItem) => void;
  hasTVPreferredFocus?: boolean;
}

/**
 * One card. Used by every row and grid in the app.
 *
 * The title sits BELOW the artwork rather than on top of it. On a TV that is the
 * safer choice: posters vary wildly in brightness, and text overlaid on an
 * unpredictable image is the classic way to end up with an unreadable card on
 * someone else's panel.
 */
export function ContentCard({
  item,
  variant,
  onPress,
  onFocus,
  hasTVPreferredFocus,
}: ContentCardProps) {
  const size = cardSize[variant];
  const isPlayable = item.stream !== null;

  return (
    <Focusable
      onPress={() => onPress(item)}
      onFocus={onFocus ? () => onFocus(item) : undefined}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.card}
      accessibilityLabel={[item.title, item.subtitle].filter(Boolean).join(', ')}>
      {focused => (
        <View style={{width: size.width}}>
          <View style={[styles.artwork, size]}>
            {item.imageUrl ? (
              <Image
                source={{uri: item.imageUrl}}
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
                <Badge label={item.badge} tone={item.badge === 'LIVE' ? 'live' : 'neutral'} />
              </View>
            ) : null}

            {!isPlayable ? (
              <View style={styles.badgeSlotBottom}>
                <Badge label="Not started" />
              </View>
            ) : null}
          </View>

          <Text
            style={[styles.title, focused && styles.titleFocused]}
            numberOfLines={1}>
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

const styles = StyleSheet.create({
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
    ...typography.caption,
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
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  titleFocused: {
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
