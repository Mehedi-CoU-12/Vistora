import { useNavigation } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView } from 'react-native';

import { ContentRow } from '../components/ContentRow';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
import { catalogTabs, type CatalogTab, type TabId } from '../navigation/tabs';
import { colors, makeStyles, spacing, useMetrics } from '../theme';
import type { ContentItem } from '../types/content';

/** How many items each home shelf loads. Shelves are a preview, not the list. */
const ROW_LIMIT = 12;

/** One home shelf: a catalog tab, and a preview of what is in it. */
interface Shelf {
  tab: CatalogTab;
  items: ContentItem[];
}

/**
 * The home screen: a vertical stack of horizontal shelves.
 *
 * ---------------------------------------------------------------------------
 * The shelves are derived, not listed
 * ---------------------------------------------------------------------------
 * This screen used to hard-code its four rows, which meant the set of things on
 * the home screen and the set of things you could browse were two lists kept in
 * step by hand. It now maps over `catalogTabs()`, so adding a content kind to
 * navigation/tabs.ts gives it a tab AND a shelf, or neither. Each shelf's "See
 * all" goes to the tab it was built from, which is a link that cannot point at
 * the wrong place.
 *
 * ---------------------------------------------------------------------------
 * Why one loader for every shelf instead of one per shelf
 * ---------------------------------------------------------------------------
 * `Promise.all` fires the queries concurrently but gives the screen a single
 * loading state and a single retry. Per-shelf loading would mean shelves
 * popping in at different moments, and on a TV that is actively harmful: the
 * focused element moves under the user as the layout reflows. One coordinated
 * load means focus lands once, on the first card, and stays there.
 *
 * ---------------------------------------------------------------------------
 * The shape survives the move to a phone; the snapping does not
 * ---------------------------------------------------------------------------
 * A vertical stack of horizontal shelves is what a phone media app looks like
 * too, only with fewer cards per shelf, which the theme handles. The one thing
 * that has to be turned off is the fork's item snapping (see below).
 */
export function HomeScreen({
  onSeeAll,
}: {
  /** Switch to a tab. Supplied by BrowseScreen, which owns the tab state. */
  onSeeAll: (id: TabId) => void;
}) {
  const navigation = useNavigation();
  const { isTV, isTouch } = useMetrics();
  const styles = useStyles();

  const { data, isLoading, error, reload } = useAsyncData<Shelf[]>(async () => {
    const shelves = await Promise.all(
      catalogTabs().map(async tab => ({
        tab,
        items: await tab.catalog.load(ROW_LIMIT),
      })),
    );

    // Drop empty shelves rather than rendering a heading over nothing. A row
    // that exists but cannot be entered is a focus trap: the D-pad appears to
    // stop working when it reaches it. The tab for that kind stays in the bar
    // either way, where its own empty state explains what is missing.
    return shelves.filter(shelf => shelf.items.length > 0);
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
    ? ({ snapToAlignment: 'item', snapToItemPadding: spacing.md } as const)
    : null;

  // First load has nothing to keep on screen, so the spinner owns it. A reload
  // over existing shelves shows the refresh spinner instead -- see the note in
  // CatalogScreen, which also covers what a FAILED reload does.
  if (isLoading && data === null) {
    return <LoadingState label="Loading your library…" />;
  }

  if (error && data === null) {
    return <ErrorState error={error} onRetry={reload} />;
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No content yet"
        message="Your database is reachable but empty. Apply supabase/seed.sql to load sample channels, movies and fixtures."
      />
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        isTouch ? (
          <RefreshControl
            refreshing={isLoading}
            onRefresh={reload}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
      {...snapProps}
    >
      {data.map((shelf, index) => (
        <ContentRow
          key={shelf.tab.id}
          title={shelf.tab.title}
          items={shelf.items}
          cardVariant={shelf.tab.catalog.cardVariant}
          onSelectItem={openItem}
          onSeeAll={() => onSeeAll(shelf.tab.id)}
          // Only the first row seeds initial focus, so exactly one element on
          // the screen claims it.
          isFirstRow={index === 0}
        />
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles(m => ({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // A little air above the first shelf heading, which now sits directly under
    // the top bar rather than under a screen title.
    paddingTop: spacing.sm,
    // Bottom padding so the last row can scroll clear of the bottom edge.
    paddingBottom: m.gutter.vertical + spacing.xl,
  },
}));
