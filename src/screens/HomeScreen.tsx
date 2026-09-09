import {useNavigation} from '@react-navigation/native';
import React, {useCallback} from 'react';
import {ScrollView} from 'react-native';

import {AppHeader} from '../components/AppHeader';
import {ContentRow} from '../components/ContentRow';
import {ScreenContainer} from '../components/ScreenContainer';
import {EmptyState, ErrorState, LoadingState} from '../components/StateViews';
import {TextButton} from '../components/TextButton';
import {useAsyncData} from '../hooks/useAsyncData';
import {fetchChannels, fetchMovies, fetchSportsEvents} from '../services/contentService';
import {makeStyles, spacing, useMetrics} from '../theme';
import type {ContentItem, ContentSection} from '../types/content';

/** How many items each home row loads. Rows are a preview, not the full list. */
const ROW_LIMIT = 12;

/**
 * The home screen: a vertical stack of horizontal rows.
 *
 * ---------------------------------------------------------------------------
 * Why one loader for all four rows instead of one per row
 * ---------------------------------------------------------------------------
 * `Promise.all` fires the four queries concurrently but gives the screen a
 * single loading state and a single retry. Per-row loading would mean rows
 * popping in at different moments, and on a TV that is actively harmful: the
 * focused element moves under the user as the layout reflows. One coordinated
 * load means focus lands once, on the first card, and stays there.
 *
 * ---------------------------------------------------------------------------
 * Row-of-shelves survives the move to a phone; the snapping does not
 * ---------------------------------------------------------------------------
 * The shape of this screen needs no responsive branch -- a vertical stack of
 * horizontal shelves is what a phone media app looks like too, only with fewer
 * cards per shelf, which the theme handles. The one thing that has to be turned
 * off is the fork's item snapping (see below).
 */
export function HomeScreen() {
  const navigation = useNavigation();
  const {isTV} = useMetrics();
  const styles = useStyles();

  const {data, isLoading, error, reload} = useAsyncData<ContentSection[]>(async () => {
    const [channels, sports, movies, cartoons] = await Promise.all([
      fetchChannels({limit: ROW_LIMIT}),
      fetchSportsEvents({limit: ROW_LIMIT}),
      fetchMovies({categoryKind: 'movie', limit: ROW_LIMIT}),
      fetchMovies({categoryKind: 'cartoon', limit: ROW_LIMIT}),
    ]);

    const sections: ContentSection[] = [
      {
        id: 'live-tv',
        title: 'Live TV',
        items: channels,
        cardVariant: 'landscape',
      },
      {
        id: 'live-sports',
        title: 'Live & Upcoming Sport',
        items: sports,
        cardVariant: 'poster',
      },
      {id: 'movies', title: 'Movies', items: movies, cardVariant: 'poster'},
      {
        id: 'cartoons',
        title: 'Cartoons',
        items: cartoons,
        cardVariant: 'poster',
      },
    ];

    // Drop empty rows rather than rendering a heading over nothing. A row that
    // exists but cannot be entered is a focus trap: the D-pad appears to stop
    // working when it reaches it.
    return sections.filter(section => section.items.length > 0);
  }, []);

  const openItem = useCallback(
    (item: ContentItem) => {
      // Not every item is playable -- a fixture whose stream URL has not been
      // published yet has `stream: null`. Guarding here is what keeps the player
      // free of "what if there is no URL" logic.
      if (!item.stream) {
        return;
      }

      navigation.navigate('Player', {
        stream: item.stream,
        title: item.title,
        subtitle: item.subtitle,
      });
    },
    [navigation],
  );

  const openLiveTv = useCallback(() => {
    navigation.navigate('LiveTv');
  }, [navigation]);

  /**
   * Leanback-style row alignment, and why it is TV-only.
   *
   * On TV, instead of scrolling the minimum amount to reveal a focused card, we
   * land the whole focused SECTION at a consistent position near the top. Each
   * ContentRow marks itself with `scrollSnapAlign="start"`; this is the parent
   * half of that contract.
   *
   * The mechanism is driven by focus events, so on a phone there is nothing to
   * trigger it -- but `snapToAlignment` still applies to touch scrolling, which
   * would make a flick of the wrist stick to row boundaries instead of moving
   * freely. Off it goes.
   */
  const snapProps = isTV
    ? ({snapToAlignment: 'item', snapToItemPadding: spacing.md} as const)
    : null;

  return (
    <ScreenContainer>
      <AppHeader
        subtitle="Personal media library"
        right={<TextButton label="All channels" onPress={openLiveTv} />}
      />

      {isLoading ? <LoadingState label="Loading your library…" /> : null}

      {error ? <ErrorState error={error} onRetry={reload} /> : null}

      {!isLoading && !error && data?.length === 0 ? (
        <EmptyState
          title="No content yet"
          message="Your database is reachable but empty. Apply supabase/seed.sql to load sample channels, movies and fixtures."
        />
      ) : null}

      {!isLoading && !error && data && data.length > 0 ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          {...snapProps}>
          {data.map((section, index) => (
            <ContentRow
              key={section.id}
              title={section.title}
              items={section.items}
              cardVariant={section.cardVariant}
              onSelectItem={openItem}
              // Only the first row seeds initial focus, so exactly one element
              // on the screen claims it.
              isFirstRow={index === 0}
            />
          ))}
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}

const useStyles = makeStyles(m => ({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // Bottom padding so the last row can scroll clear of the bottom edge.
    paddingBottom: m.gutter.vertical + spacing.xl,
  },
}));
