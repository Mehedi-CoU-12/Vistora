import React, { useCallback, useState } from 'react';
import {
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
import { RemoteImage } from './RemoteImage';
import { TextButton } from './TextButton';

interface HeroBannerProps {
  item: ContentItem;

  onPlay: (item: ContentItem) => void;

  onMoreInfo?: (item: ContentItem) => void;

  eyebrow?: string;

  hasTVPreferredFocus?: boolean;
}

const MIN_TEXT_WIDTH = 280;

export function HeroBanner({
  item,
  onPlay,
  onMoreInfo,
  eyebrow,
  hasTVPreferredFocus = false,
}: HeroBannerProps) {
  const { hero, isTV, gutter, width: screenWidth } = useMetrics();
  const styles = useStyles();

  const [width, setWidth] = useState(0);

  const measure = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const inMyList = useIsInMyList(item.id);

  const sideBySide = hero.align === 'start';

  const isMark = item.kind === 'channel';
  const backdrop = item.backdropUrl;
  const poster = item.imageUrl;

  const fill = isMark ? null : backdrop ?? poster;
  const fillIsStandIn = !isMark && !backdrop && poster !== null;

  const asideSource = sideBySide
    ? isMark
      ? poster
      : backdrop
      ? null
      : poster
    : null;

  const asideWidth = isMark
    ? Math.round(hero.height * 0.42)
    : Math.round((hero.height - spacing.xl * 2) * (2 / 3));

  const aside =
    asideSource !== null &&
    width - asideWidth - gutter.horizontal * 2 >= MIN_TEXT_WIDTH
      ? asideSource
      : null;

  const facts = metaParts(item.meta);

  const canPlay = item.stream !== null;
  const playLabel =
    item.kind === 'series'
      ? 'View episodes'
      : item.stream?.isLive
      ? 'Watch live'
      : 'Play';

  return (
    <View
      style={[styles.hero, { height: hero.height }]}
      onLayout={measure}
      scrollSnapAlign="start"
    >
      {fill ? (
        <RemoteImage
          url={fill}
          displayWidth={screenWidth}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        <Gradient
          colors={[colors.brandViolet, colors.brandBlue, colors.background]}
          direction="right"
          style={StyleSheet.absoluteFill}
        />
      )}

      {}
      {fillIsStandIn ? (
        <View style={styles.standInScrim} pointerEvents="none" />
      ) : null}

      {}
      {sideBySide ? (
        <Gradient
          colors={[backgroundAlpha(0.96), backgroundAlpha(0)]}
          direction="right"
          style={styles.leadingFade}
        />
      ) : null}

      {}
      <Gradient
        colors={[backgroundAlpha(0.75), backgroundAlpha(0)]}
        direction="down"
        style={styles.topFade}
      />

      {}
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
          <RemoteImage
            url={aside}
            displayWidth={asideWidth}
            style={styles.asideImage}
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

          {}
          <TVFocusGuideView
            autoFocus
            style={[styles.actions, !sideBySide && styles.actionsCentered]}
          >
            <TextButton
              variant="primary"
              label={playLabel}
              onPress={() => onPlay(item)}
              hasTVPreferredFocus={hasTVPreferredFocus}
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

            {}
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

    alignSelf: 'stretch',
  },
  actionsCentered: {
    justifyContent: 'center',
  },
}));
