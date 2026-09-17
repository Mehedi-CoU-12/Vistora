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
              message="This series has no episodes available from MovieBox."
              action={{ label: 'Reload', onPress: reload }}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          stickySectionHeadersEnabled={false}
        />
      </TVFocusGuideView>
    </ScreenContainer>
  );
}

const keyExtractor = (item: ContentItem) => item.id;

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
