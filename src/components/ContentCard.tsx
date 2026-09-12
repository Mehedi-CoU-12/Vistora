import React from 'react';
import { Image, Text, View } from 'react-native';

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

interface ContentCardProps {
  item: ContentItem;
  variant: CardVariant;
  onPress: (item: ContentItem) => void;
  onFocus?: (item: ContentItem) => void;
  hasTVPreferredFocus?: boolean;
  width?: number;
  /**
   * Fraction watched, 0..1, drawn as a bar across the foot of the artwork.
   *
   * Only ever passed by the Continue Watching rail, and only when a real
   * position exists -- see state/continueWatching.ts on why the app does not
   * currently have one and why this is wired through anyway.
   */
  progress?: number;
  /**
   * Set false where the artwork already carries the name -- a channel logo, a
   * poster with the title printed on it in a dense grid. Defaults to true.
   */
  showTitle?: boolean;
}

/**
 * One card, in every place the app shows content.
 *
 * ---------------------------------------------------------------------------
 * Image first, and the text under it earns its place one line at a time
 * ---------------------------------------------------------------------------
 * The artwork is the card. Everything else is an aid to recognising it, so the
 * title is one line, the metadata is one line, and neither is allowed to grow --
 * a card whose text wraps to three lines is a card whose neighbours no longer
 * line up, and a rail of ragged-bottomed cards reads as broken rather than as
 * informative.
 *
 * ---------------------------------------------------------------------------
 * The treatment is chosen by `item.kind`, not by a second component per kind
 * ---------------------------------------------------------------------------
 * A channel and a film want genuinely different artwork handling: a logo is a
 * MARK -- transparent, square-ish, meant to sit centred with air around it --
 * and cropping one to fill a 16:9 tile cuts the top and bottom off the thing
 * that identifies the channel. A poster is a PICTURE and must fill its frame
 * edge to edge or it reads as a thumbnail floating in a box.
 *
 * That is a real difference, and the obvious response is a `ChannelCard` beside
 * this one. It is the wrong response here, because `kind` already encodes the
 * distinction exactly: splitting the component would mean every rail, grid and
 * search result had to decide which card to render from the same field this
 * file reads in one line -- the knowledge would move from here to a dozen call
 * sites. One card, keyed on the field that already exists.
 */
export function ContentCard({
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

  // Scale the height with the width so a fluid card keeps the variant's shape
  // (16:9 for landscape, 2:3 for a poster) instead of stretching the artwork.
  const size =
    width === undefined
      ? cardSize[variant]
      : { width, height: Math.floor(width * cardAspect[variant]) };

  /**
   * Whether the artwork is a mark to be shown whole, or a picture to fill the
   * frame. See the note above. `square` is in here because the only thing that
   * ever uses a square card is a channel logo in a dense grid.
   */
  const isMark = item.kind === 'channel' || variant === 'square';

  const meta = item.subtitle;

  /**
   * Whether anything is drawn ON the artwork that needs a darker backing.
   *
   * A logo tile never qualifies: it has an opaque surface of its own, and a
   * gradient over a mark reads as the logo fading out. The top-left `badge` does
   * not qualify either -- `Badge` carries its own background precisely so it can
   * be dropped onto any frame.
   */
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
              // The glow is drawn on the artwork rather than on the Focusable
              // wrapper so it hugs the rounded corners of the image instead of
              // the square corners of the padding box around it.
              active && styles.artworkActive,
            ]}
          >
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={isMark ? styles.mark : styles.image}
                resizeMode={isMark ? 'contain' : 'cover'}
              />
            ) : (
              // Never render an empty box: a missing image should still show the
              // title, or the row looks broken rather than incomplete.
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText} numberOfLines={3}>
                  {item.title}
                </Text>
              </View>
            )}

            {/* A scrim along the foot of the picture -- but ONLY where
                something has to be read against it.

                The first version of this card drew one on every poster, for
                "seating". It dimmed the bottom of artwork a designer had already
                composed, on a card whose title sits BELOW the image and
                therefore never needed a backing at all -- so it was removed on
                looks alone, before `Gradient` became cheap enough for the cost
                not to matter either.

                So it is drawn for the two things that genuinely sit on the
                artwork and must stay legible: a progress bar, and the badge that
                explains why an item cannot be played. Both are rare. */}
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

            {/* Pinned to the very bottom edge of the artwork, under the scrim's
                densest part, which is the one place on a card where a 3dp line
                is legible against any frame of any film. */}
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
}

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
  /** A logo tile: lighter than a poster's backing, and the logo gets air. */
  artworkMark: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
  },
  /**
   * The focused card's glow.
   *
   * `elevation` is what actually draws it on Android -- `shadowColor` and
   * friends are iOS properties and are listed so the intent survives if this
   * ever runs there. Deliberately modest: `Focusable` is already drawing a ring
   * and a scale, and a fourth loud cue on top of three turns a focused card into
   * a light source on a 55-inch panel in a dark room.
   */
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
  /**
   * A mark is sized by the padding on `artworkMark`, so it fills what is left
   * rather than the whole tile. `100%` of a padded box is the padded box.
   */
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
    // Deep enough to back a badge and a progress bar sitting at the very foot of
    // the card, shallow enough to leave the face of whoever is on the poster
    // alone.
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
