import React, { useCallback, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { PlayerIcon } from '../player/PlayerIcon';
import { toggleMyList, useIsInMyList } from '../state/myList';
import {
  backgroundAlpha,
  colors,
  makeStyles,
  radius,
  shadeAlpha,
  spacing,
  useMetrics,
} from '../theme';
import { metaParts, type ContentItem } from '../types/content';
import { Badge } from './Badge';
import { Gradient } from './Gradient';
import { TextButton } from './TextButton';

interface HeroBannerProps {
  item: ContentItem;
  /** Start playing. The hero's primary action, so it is never optional. */
  onPlay: (item: ContentItem) => void;
  /** Open the details screen. Omitted where the hero IS the details screen. */
  onMoreInfo?: (item: ContentItem) => void;
  /** Small line above the title: "Trending now", "Featured channel". */
  eyebrow?: string;
  /** Give the Play button initial D-pad focus. One element per screen. */
  hasTVPreferredFocus?: boolean;
}

/**
 * The cinematic banner at the top of a browse screen.
 *
 * ---------------------------------------------------------------------------
 * The image has to stop being an image
 * ---------------------------------------------------------------------------
 * The single thing that separates a premium streaming home screen from a grid of
 * pictures is that the hero artwork has no visible edges. It fills the width,
 * fades down into the page colour so the first rail appears to emerge from it,
 * and fades in from the leading side so the title sits on darkness rather than
 * on whatever happened to be in that part of the frame.
 *
 * Three gradients do that, and each is answering a different problem:
 *
 *   bottom   Ends the picture. Runs to fully opaque `background`, so there is
 *            no seam at all between the hero and the rail beneath it.
 *   leading  Makes the copy legible over an unknown photograph. Only drawn on a
 *            layout where the text occupies one side (see `align`); on a phone
 *            the text is centred over the whole frame and a side fade would
 *            darken the wrong half.
 *   top      Backs the app's own chrome. Without it a bright sky in the top of
 *            a backdrop puts white wordmark on white cloud.
 *
 * ---------------------------------------------------------------------------
 * Most titles have no backdrop, so "no backdrop" is the designed case
 * ---------------------------------------------------------------------------
 * Only the TMDB-sourced films in this library carry a 16:9 backdrop; everything
 * imported from the Archive has a poster and nothing else, and a channel has a
 * logo, which is not a photograph at all. A hero that only worked with a
 * backdrop would therefore be broken for most of the catalogue, so there are
 * three treatments and the artwork decides which:
 *
 *   backdrop   Fills the frame. The intended case.
 *   poster     Fills the frame too, heavily scrimmed so it reads as an ambient
 *              wash of the title's own colours rather than as a crop -- and the
 *              poster is ALSO shown intact, as a card on the trailing side,
 *              where it is the right shape. A 2:3 poster cropped to a 960x324
 *              frame is a horizontal slice of someone's chin; shown whole beside
 *              the text it is the artwork the designer drew.
 *   mark       A channel logo. No photograph exists, so the field is the brand
 *              sweep and the logo sits on it as a mark, contained and padded.
 *
 * The trailing artwork is dropped on a phone in portrait, where there is no
 * trailing side to put it on.
 */
/**
 * Narrowest the copy column is allowed to get before the trailing artwork is
 * dropped to make room for it.
 *
 * A hero title at 34-44dp needs roughly this much to avoid breaking short words
 * across lines. Below it the choice is between a legible title and a visible
 * poster, and the title wins every time -- it is the thing the screen is for.
 */
const MIN_TEXT_WIDTH = 280;

export function HeroBanner({
  item,
  onPlay,
  onMoreInfo,
  eyebrow,
  hasTVPreferredFocus = false,
}: HeroBannerProps) {
  const { hero, isTV, gutter } = useMetrics();
  const styles = useStyles();

  /**
   * The hero's own width, which is NOT always the window's.
   *
   * On Home it is the full screen; on a catalog screen it is whatever is left
   * beside the category sidebar, which on a tablet in portrait is barely half of
   * it. The trailing poster is absolutely positioned, so in that narrower box it
   * would silently sit on top of the title rather than pushing it aside.
   *
   * Measuring rather than deriving: the alternative is for every caller to pass
   * its available width down, which is a number three components would have to
   * carry and any one of them could get wrong.
   */
  const [width, setWidth] = useState(0);

  const measure = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const inMyList = useIsInMyList(item.id);

  /** Text down one side, or centred over the whole frame. See `HeroMetrics`. */
  const sideBySide = hero.align === 'start';

  /** A logo is a mark on a field; a poster and a backdrop are photographs. */
  const isMark = item.kind === 'channel';
  const backdrop = item.backdropUrl;
  const poster = item.imageUrl;

  /**
   * The full-bleed layer. A backdrop if there is one, otherwise the poster
   * standing in as an ambient wash -- see the note above on why that is scrimmed
   * so much harder than a real backdrop.
   */
  const fill = isMark ? null : backdrop ?? poster;
  const fillIsStandIn = !isMark && !backdrop && poster !== null;

  /** Artwork shown intact on the trailing side, where the layout has one. */
  const asideSource = sideBySide
    ? isMark
      ? poster
      : backdrop
      ? null
      : poster
    : null;

  // A mark is squarer than a poster, so it needs less width for the same height.
  const asideWidth = isMark
    ? Math.round(hero.height * 0.42)
    : Math.round((hero.height - spacing.xl * 2) * (2 / 3));

  /**
   * Shown only once the box has been measured AND the measurement leaves a
   * readable column beside it. Before the first layout `width` is 0, so the
   * first frame draws without it and it fades in on the second -- which is the
   * right way round: a poster appearing is unremarkable, a poster appearing on
   * top of the title and then jumping away is not.
   */
  const aside =
    asideSource !== null &&
    width - asideWidth - gutter.horizontal * 2 >= MIN_TEXT_WIDTH
      ? asideSource
      : null;

  const facts = metaParts(item.meta);

  /**
   * Nothing is playable on a series (it is a container) or on a fixture whose
   * URL has not been published. Rather than a Play button that silently does
   * nothing, the label changes to what pressing it will actually do.
   */
  const canPlay = item.stream !== null;
  const playLabel =
    item.kind === 'series'
      ? 'View episodes'
      : item.stream?.isLive
      ? 'Watch live'
      : 'Play';

  return (
    // `scrollSnapAlign` marks the hero as a unit the vertical scroller aligns
    // to when focus lands inside it, exactly as each `ContentRow` does. Without
    // it, pressing UP from the first rail scrolls the minimum distance to reveal
    // the Play button and leaves the title and artwork above it clipped off the
    // top -- so the viewer would be looking at a button with no idea what it
    // plays. See the parent half of the contract in HomeScreen.
    <View
      style={[styles.hero, { height: hero.height }]}
      onLayout={measure}
      scrollSnapAlign="start"
    >
      {fill ? (
        <Image
          source={{ uri: fill }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          // Decorative: the title beside it says everything this conveys, and
          // TalkBack announcing a URL fragment helps nobody.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        // No photograph exists for this item. The brand sweep is the field --
        // which is the one place in the app that uses the logo's full range,
        // because here it IS the artwork rather than a highlight on top of some.
        <Gradient
          colors={[colors.brandViolet, colors.brandBlue, colors.background]}
          direction="right"
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* A poster standing in for a backdrop is a crop of the wrong shape, so it
          is pushed most of the way to black and used for its colours only. A
          real backdrop was composed to be looked at and keeps its brightness. */}
      {fillIsStandIn ? (
        <View style={styles.standInScrim} pointerEvents="none" />
      ) : null}

      {/* Leading fade. Wide layouts only -- see the header. */}
      {sideBySide ? (
        <Gradient
          colors={[backgroundAlpha(0.96), backgroundAlpha(0)]}
          direction="right"
          style={styles.leadingFade}
        />
      ) : null}

      {/* Chrome backing. Short, and above the artwork on every layout. */}
      <Gradient
        colors={[backgroundAlpha(0.75), backgroundAlpha(0)]}
        direction="down"
        style={styles.topFade}
      />

      {/* The one that ends the picture. Runs to solid `background`. */}
      <Gradient
        colors={[backgroundAlpha(0), backgroundAlpha(0.85), backgroundAlpha(1)]}
        direction="down"
        style={styles.bottomFade}
      />

      {aside ? (
        <View
          style={[styles.aside, { width: asideWidth }]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: aside }}
            style={styles.asideImage}
            // Contained, always: the entire reason this element exists is that
            // the artwork's own shape is worth preserving.
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </View>
      ) : null}

      <View
        style={[
          styles.content,
          sideBySide ? styles.contentStart : styles.contentCenter,
          // Reserves the trailing artwork's column so the copy stops short of
          // it. `maxWidth` on the text block alone would not: the block is
          // positioned from the left and knows nothing about what is pinned to
          // the right.
          aside ? { paddingRight: asideWidth + spacing.lg } : null,
        ]}
      >
        <View style={{ maxWidth: hero.textMaxWidth }}>
          {eyebrow ? (
            <Text
              style={[styles.eyebrow, !sideBySide && styles.centered]}
              numberOfLines={1}
            >
              {eyebrow}
            </Text>
          ) : null}

          <Text
            style={[styles.title, !sideBySide && styles.centered]}
            // Two lines is the ceiling on every device. A three-line film title
            // at hero size is taller than the buttons under it and pushes them
            // off the bottom of a phone's hero.
            numberOfLines={2}
          >
            {item.title}
          </Text>

          {facts.length > 0 || item.badge ? (
            <View
              style={[styles.factRow, !sideBySide && styles.factRowCentered]}
            >
              {item.badge ? (
                <Badge
                  label={item.badge}
                  tone={item.badge === 'LIVE' ? 'live' : 'neutral'}
                />
              ) : null}

              {facts.map((fact, index) => (
                // Keyed on the position as well as the value: the list is
                // generated and positional, and two facts CAN coincide -- a
                // genre named after a year, a rating that matches a quality --
                // which would otherwise be a duplicate-key warning and a
                // dropped fact.
                <React.Fragment key={`${index}-${fact}`}>
                  {index > 0 ? <Text style={styles.factDot}>·</Text> : null}
                  <Text style={styles.fact}>{fact}</Text>
                </React.Fragment>
              ))}
            </View>
          ) : null}

          {hero.descriptionLines > 0 && item.description ? (
            <Text
              style={[styles.description, !sideBySide && styles.centered]}
              numberOfLines={hero.descriptionLines}
            >
              {item.description}
            </Text>
          ) : null}

          {/* The focus guide gives the action row focus memory: leave the hero
              on My List, come back up from a rail, and you return to My List
              rather than to whichever button happens to be geometrically
              nearest. On a phone it renders as a plain View. */}
          <TVFocusGuideView
            autoFocus
            style={[styles.actions, !sideBySide && styles.actionsCentered]}
          >
            <TextButton
              variant="primary"
              label={playLabel}
              onPress={() => onPlay(item)}
              hasTVPreferredFocus={hasTVPreferredFocus}
              // On a phone the pair shares the row equally; on a wide screen
              // each hugs its label, since a stretched pair across 620dp would
              // be two enormous buttons.
              stretch={!sideBySide}
            >
              {color =>
                canPlay ? (
                  <PlayerIcon name="play" size={14} color={color} />
                ) : null
              }
            </TextButton>

            <TextButton
              variant="secondary"
              label={inMyList ? 'In My List' : 'My List'}
              onPress={() => toggleMyList(item)}
              selected={inMyList}
              stretch={!sideBySide}
            >
              {color => (
                <PlayerIcon
                  name={inMyList ? 'tick' : 'plus'}
                  size={14}
                  color={color}
                />
              )}
            </TextButton>

            {/* Info is a TV affordance. On a phone the poster is a tap away on
                the rail below and the hero's own artwork is not tappable, so a
                third button would be a third thing competing for a 390dp row
                that already holds two. */}
            {onMoreInfo && isTV ? (
              <TextButton
                variant="secondary"
                accessibilityLabel={`More about ${item.title}`}
                onPress={() => onMoreInfo(item)}
              >
                {color => <PlayerIcon name="info" size={16} color={color} />}
              </TextButton>
            ) : null}
          </TVFocusGuideView>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(m => ({
  hero: {
    width: '100%',
    // Everything inside is either absolutely placed or the content block, and
    // the artwork must not spill past the rounded page edges on a tablet.
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
  },
  standInScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: shadeAlpha(0.55),
  },
  leadingFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    // Past the text column's right edge, so the copy never sits on the part of
    // the ramp that has already cleared.
    width: '72%',
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '28%',
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // Tall, because this is the one that has to reach full opacity gradually
    // enough that the eye never finds the point where the picture ended.
    height: '62%',
  },
  aside: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: m.gutter.horizontal,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  asideImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  content: {
    paddingHorizontal: m.gutter.horizontal,
    paddingBottom: spacing.lg,
  },
  contentStart: {
    alignItems: 'flex-start',
  },
  contentCenter: {
    alignItems: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  eyebrow: {
    ...m.typography.label,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  title: {
    ...m.typography.heroTitle,
    color: colors.textPrimary,
    // Artwork can be light behind the copy even after the scrims, and a hero
    // title is the one piece of text in the app big enough for a shadow to read
    // as depth rather than as a printing fault.
    textShadowColor: shadeAlpha(0.6),
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  factRowCentered: {
    justifyContent: 'center',
  },
  fact: {
    ...m.typography.caption,
    color: colors.textOnArt,
    fontWeight: '600',
  },
  factDot: {
    ...m.typography.caption,
    color: colors.textMuted,
  },
  description: {
    ...m.typography.body,
    color: colors.textOnArt,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    // The row is a flex child of a `maxWidth` block, so on a phone it has to be
    // told to fill it -- otherwise two stretched buttons stretch to nothing.
    alignSelf: 'stretch',
  },
  actionsCentered: {
    justifyContent: 'center',
  },
}));
