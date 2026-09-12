import { useRoute, type RouteProp } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { Image, SectionList, Text, TVFocusGuideView, View } from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { Badge } from '../components/Badge';
import { Focusable } from '../components/Focusable';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
import { usePlayItem } from '../hooks/usePlayItem';
import {
  fetchSeriesDetail,
  type SeriesDetail,
} from '../services/contentService';
import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import type { ContentItem } from '../types/content';
import type { RootStackParamList } from '../types/navigation';

/**
 * One series: what it is, and every episode of it.
 *
 * ---------------------------------------------------------------------------
 * A list, not a grid
 * ---------------------------------------------------------------------------
 * Every other content surface in this app is a grid, and this one deliberately
 * is not. A grid is for choosing between unlike things, where the artwork does
 * the distinguishing; an episode list is a sequence of near-identical stills
 * whose only useful differences are a number and a sentence of synopsis. Laid
 * out as a grid those differences are exactly what gets cropped, and the thing
 * a viewer actually wants -- "where was I" -- becomes the hardest thing to
 * find. A row per episode gives the number, the title and the synopsis room to
 * be read, and on a D-pad it means one axis of travel instead of two.
 *
 * ---------------------------------------------------------------------------
 * Season headers appear only when there is more than one season
 * ---------------------------------------------------------------------------
 * Most of what gets imported is a single run, and "Season 1" above a list that
 * has no season 2 is a row of chrome that answers a question nobody has. But
 * where there ARE several, an unlabelled jump from episode 12 back to episode 1
 * is indistinguishable from a sorting bug, so the header is not cosmetic
 * either. Rendering it conditionally costs one comparison and means the common
 * case pays nothing.
 *
 * ---------------------------------------------------------------------------
 * Selecting an episode may leave the app, and that is not this screen's problem
 * ---------------------------------------------------------------------------
 * Episodes imported from an official YouTube channel carry
 * `stream_protocol = 'youtube'`, which opens in the YouTube app rather than in
 * VideoPlayer (see services/externalPlayback.ts for why that is the only legal
 * way to carry one). This screen does not know that: it calls `usePlayItem`,
 * and the decision lives in one place for every surface that starts a video.
 *
 * Note it is `usePlayItem` and not `useOpenItem`. A card elsewhere in the app
 * opens a details screen; an episode row plays immediately, because this list IS
 * the details screen for the series and a second one per episode would be a
 * synopsis you already read two lines of, with a button under it.
 */
export function SeriesScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Series'>>();
  const styles = useStyles();
  const playItem = usePlayItem();

  const { seriesId } = params;

  const { data, isLoading, error, reload } = useAsyncData<SeriesDetail>(
    () => fetchSeriesDetail(seriesId),
    [seriesId],
  );

  const sections = useMemo(
    () =>
      (data?.seasons ?? []).map(season => ({
        season: season.season,
        data: season.episodes,
      })),
    [data],
  );

  const hasSeasonHeaders = sections.length > 1;

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: ContentItem;
      index: number;
      section: { season: number };
    }) => (
      <EpisodeRow
        episode={item}
        onPress={playItem}
        // Exactly one element on the screen seeds focus, and it is the first
        // episode of the first season -- the thing a viewer arriving here is
        // overwhelmingly likely to want, and the top of the only list.
        hasTVPreferredFocus={
          index === 0 && section.season === sections[0]?.season
        }
      />
    ),
    [playItem, sections],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { season: number } }) =>
      hasSeasonHeaders ? (
        <Text style={styles.seasonHeader}>Season {section.season}</Text>
      ) : null,
    [hasSeasonHeaders, styles.seasonHeader],
  );

  /**
   * The title comes from the route while the fetch is in flight, so the header
   * is correct from the first frame instead of reading "Loading" and then
   * changing under the user. `params.title` is the same string the card that
   * navigated here was already displaying.
   */
  const header = (
    <AppHeader title={data?.title ?? params.title} subtitle={data?.subtitle} />
  );

  if (isLoading && data === null) {
    return (
      <ScreenContainer>
        {header}
        <LoadingState label="Loading episodes…" />
      </ScreenContainer>
    );
  }

  if (error && data === null) {
    return (
      <ScreenContainer>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </ScreenContainer>
    );
  }

  // Not dead code and not an error case: this is the single render between
  // mount and the loader's first tick, where `isLoading` is still true from the
  // initial state but the two branches above have already been evaluated. A
  // spinner is what it actually is. Manufacturing an AppError to reuse
  // ErrorState here would put a "Try again" button under a screen that is
  // loading perfectly well.
  if (!data) {
    return (
      <ScreenContainer>
        {header}
        <LoadingState label="Loading episodes…" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {header}

      <TVFocusGuideView autoFocus style={styles.body}>
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={<SeriesHero series={data} />}
          ListEmptyComponent={
            <EmptyState
              title="No episodes"
              message={
                'This series has no episodes yet. Re-run `npm run import:anime` ' +
                'and apply the seed file it writes.'
              }
              action={{ label: 'Reload', onPress: reload }}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // Recycling views out from under the focus engine makes focus jump to
          // the top of the list. Same reason the catalog grid disables it.
          removeClippedSubviews={false}
          // A season header that sticks would cover the episode above it as you
          // scroll -- and on a D-pad you scroll by moving focus, so the covered
          // row is the focused one.
          stickySectionHeadersEnabled={false}
        />
      </TVFocusGuideView>
    </ScreenContainer>
  );
}

const keyExtractor = (item: ContentItem) => item.id;

/**
 * The synopsis block above the list.
 *
 * Rendered as the list's header rather than as a fixed pane beside it, which is
 * the one decision here worth defending. A fixed pane means two independently
 * scrollable regions and therefore a D-pad ambiguity at every row -- does LEFT
 * go to the synopsis, or to nothing? -- for the sake of text most viewers read
 * once. As a header it scrolls away after the first press of DOWN and the
 * screen has exactly one focus axis.
 */
function SeriesHero({ series }: { series: SeriesDetail }) {
  const styles = useStyles();
  const { contentWidth } = useMetrics();

  const artwork = series.backdropUrl ?? series.posterUrl;

  if (!artwork && !series.description) {
    return null;
  }

  return (
    <View style={styles.hero}>
      {artwork ? (
        <Image
          source={{ uri: artwork }}
          style={[
            styles.heroImage,
            // 16:9 off the measured content width, capped so a television does
            // not give the whole first screen to a still. The list is the point.
            {
              width: Math.min(contentWidth, 420),
              height: Math.round(Math.min(contentWidth, 420) * (9 / 16)),
            },
          ]}
          resizeMode="cover"
        />
      ) : null}

      {series.description ? (
        <Text style={styles.heroDescription} numberOfLines={6}>
          {series.description}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One episode.
 *
 * The still is deliberately small. It is a frame from the episode and carries
 * almost no information -- every still in a run of twenty-six looks like the
 * others -- so it gets enough width to be recognisable and no more, and the
 * number, title and synopsis get the rest.
 */
function EpisodeRow({
  episode,
  onPress,
  hasTVPreferredFocus,
}: {
  episode: ContentItem;
  onPress: (item: ContentItem) => void;
  hasTVPreferredFocus: boolean;
}) {
  const styles = useStyles();
  const { cardSize } = useMetrics();

  const thumbWidth = Math.round(cardSize.landscape.width * 0.75);
  const thumbHeight = Math.round(thumbWidth * (9 / 16));

  return (
    <Focusable
      onPress={() => onPress(episode)}
      hasTVPreferredFocus={hasTVPreferredFocus}
      // A full-width row grows across the whole screen if it scales, which
      // reads as the layout twitching rather than as a selection.
      scaleOnFocus={false}
      style={styles.episode}
      accessibilityLabel={[episode.badge, episode.title, episode.subtitle]
        .filter(Boolean)
        .join(', ')}
    >
      {active => (
        <View style={styles.episodeInner}>
          <View
            style={[styles.thumb, { width: thumbWidth, height: thumbHeight }]}
          >
            {episode.imageUrl ? (
              <Image
                source={{ uri: episode.imageUrl }}
                style={styles.thumbImage}
                resizeMode="cover"
              />
            ) : (
              // Never an empty box: without a still, the number is the thing
              // that identifies the row, so it becomes the artwork.
              <View style={styles.thumbPlaceholder}>
                <Text style={styles.thumbPlaceholderText}>
                  {episode.badge ?? '—'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.episodeText}>
            <View style={styles.episodeTitleRow}>
              {episode.badge ? <Badge label={episode.badge} /> : null}
              <Text
                style={[
                  styles.episodeTitle,
                  active && styles.episodeTitleActive,
                ]}
                numberOfLines={1}
              >
                {episode.title}
              </Text>
            </View>

            {episode.subtitle ? (
              <Text style={styles.episodeMeta} numberOfLines={1}>
                {episode.subtitle}
              </Text>
            ) : null}

            {episode.description ? (
              <Text style={styles.episodeDescription} numberOfLines={2}>
                {episode.description}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Focusable>
  );
}

const useStyles = makeStyles(m => ({
  body: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: m.gutter.horizontal,
    paddingBottom: m.gutter.vertical + spacing.xl,
  },
  hero: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroImage: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  heroDescription: {
    ...m.typography.body,
    color: colors.textSecondary,
    maxWidth: 720,
  },
  seasonHeader: {
    ...m.typography.title,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  episode: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  episodeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // A remote lands on any height accurately; a fingertip needs the minimum.
    minHeight: m.minTouchTarget,
  },
  thumb: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  thumbPlaceholderText: {
    ...m.typography.body,
    color: colors.textMuted,
  },
  episodeText: {
    flex: 1,
    gap: 2,
  },
  episodeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  episodeTitle: {
    ...m.typography.body,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  episodeTitleActive: {
    color: colors.textPrimary,
  },
  episodeMeta: {
    ...m.typography.caption,
    color: colors.textMuted,
  },
  episodeDescription: {
    ...m.typography.caption,
    color: colors.textMuted,
  },
}));
