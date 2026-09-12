import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  TVFocusGuideView,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { CategoryPicker } from '../components/CategoryPicker';
import { useChromeInset } from '../components/ChromeInset';
import { ContentCard } from '../components/ContentCard';
import { RailList } from '../components/RailList';
import { SkeletonScreen } from '../components/Skeleton';
import { EmptyState, ErrorState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
import { useOpenItem } from '../hooks/useOpenItem';
import { usePlayItem } from '../hooks/usePlayItem';
import {
  buildRails,
  pickFeatured,
  withGenre,
  type Rail,
} from '../navigation/rails';
import { formatCount, type CatalogTab } from '../navigation/tabs';
import { fetchCategories } from '../services/contentService';
import {
  cardAspect,
  colors,
  COLUMN_GAP,
  computeCardWidth,
  gridPadding,
  makeStyles,
  spacing,
  useMetrics,
} from '../theme';
import type { Category, ContentItem } from '../types/content';

interface CatalogData {
  items: ContentItem[];
  categories: Category[];
  /** One per category with enough content. Empty when the kind will not split. */
  rails: Rail[];
  featured: ContentItem | null;
}

/**
 * Which title heroes the kind, fixed for the life of the process.
 *
 * Shared with `HomeScreen`'s seed in spirit but deliberately its own constant:
 * Home picks across every kind and this picks within one, so the same seed would
 * still choose different items and pretending otherwise would be a coupling with
 * no payoff.
 */
const SESSION_SEED = Math.floor(Math.random() * 100_000);

/**
 * One tab's catalog: a category filter beside either a discovery view or a grid.
 *
 * ---------------------------------------------------------------------------
 * "All" and "a category" are two different questions, so they get two answers
 * ---------------------------------------------------------------------------
 * This screen used to render one thing: a grid of everything, filtered. That is
 * the right answer to "show me all the horror films" and the wrong answer to
 * "what is on Live TV?" -- the second is a browse, and a wall of sixty-four
 * identical channel tiles answers it by making the viewer do the sorting.
 *
 * So the filter now selects between two modes rather than just narrowing one:
 *
 *   All (nothing selected)   A hero over one rail per category -- "News",
 *                            "Entertainment", "Trending", "In Cinemas". This is
 *                            the discovery view, and it is built from the same
 *                            `categories` rows the picker beside it lists, so
 *                            the two can never disagree about what exists.
 *   A category selected      The grid, exactly as before, showing all of it.
 *
 * The modes are alternatives rather than stacked, which is what stops the screen
 * from showing the same twenty films twice -- once in a "Trending" rail and
 * again in the grid underneath it.
 *
 * A kind that will not split into rails (everything uncategorised, or only one
 * category with content) falls through to the grid in both modes, which is what
 * the Anime tab gets today. See `buildRails` for where that decision is made.
 *
 * ---------------------------------------------------------------------------
 * Written once, pointed at one query per kind
 * ---------------------------------------------------------------------------
 * Live TV, Movies and Anime differ only in which query fills the grid, which
 * categories the filter offers, and whether the artwork is a poster or a 16:9
 * tile. All three are fields on the `CatalogSpec` this screen
 * is handed (see navigation/tabs.ts), so there is one grid implementation, one
 * set of focus guides, and one place where a bug in any of it can live.
 *
 * ---------------------------------------------------------------------------
 * The two focus guides
 * ---------------------------------------------------------------------------
 * Moving between the halves of a split layout with a D-pad is exactly where TV
 * layouts usually go wrong. The picker owns one (press RIGHT out of the sidebar
 * and enter the grid where you left it); the grid owns the other, below (press
 * LEFT from the first column and return to the category you selected, rather
 * than dropping focus entirely).
 *
 * ---------------------------------------------------------------------------
 * Reloading keeps what it already has
 * ---------------------------------------------------------------------------
 * `isLoading` goes true on a reload as well as on a first load, so rendering the
 * spinner whenever it is set would blank the whole screen on a pull-to-refresh
 * and throw away the scroll position. The spinner is therefore for a FIRST load
 * only -- `data === null` -- and a reload over existing content shows the
 * refresh spinner in place instead.
 *
 * The same test guards the error state, which means a reload that FAILS over
 * content that loaded keeps showing that content rather than replacing a
 * working screen with an error. The cost is that the failure is quiet: the
 * refresh spinner simply stops. That is the better of the two, but it is a
 * trade rather than a free win, and a transient banner is what would fix it
 * properly.
 */
export function CatalogScreen({ tab }: { tab: CatalogTab }) {
  const metrics = useMetrics();
  const styles = useStyles();
  const { isTouch, usesSidebar } = metrics;

  const spec = tab.catalog;
  const columns = metrics.gridColumns[spec.cardVariant];

  /**
   * Wording for the states, taken from the spec's plural noun rather than from
   * the tab title: "Loading channels" reads correctly where a lowercased title
   * would give "Loading live tv".
   */
  const plural = spec.countNoun[1];

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  /**
   * Whether the content area is still allowed to claim initial focus.
   *
   * The content is remounted on every category change -- the grid via the `key`
   * below, and the discovery view because choosing "All" swaps the whole branch
   * -- and a fresh mount would re-assert `hasTVPreferredFocus`, yanking focus out
   * of the picker the instant you used it, so you could never try a second
   * category. We therefore let the content take focus once, on arrival, and
   * never again.
   *
   * It covers BOTH modes, which is why it is no longer called `gridMayClaim`:
   * the hero at the top of the discovery view claims focus exactly as the grid's
   * first card does, and gets the identical guard.
   */
  const [contentMayClaimFocus, setContentMayClaimFocus] = useState(true);

  /**
   * Measured width of the grid area, used to size cards. Starts at 0 and the
   * grid is not rendered until it is known, so the cards are never laid out at
   * the wrong size and then reflowed -- a reflow would move the focused card out
   * from under the user.
   */
  const [gridWidth, setGridWidth] = useState(0);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    setGridWidth(event.nativeEvent.layout.width);
  }, []);

  const selectCategory = useCallback((categoryId: string | null) => {
    setContentMayClaimFocus(false);
    setSelectedCategoryId(categoryId);
  }, []);

  const { data, isLoading, error, reload } =
    useAsyncData<CatalogData>(async () => {
      const [loaded, categories] = await Promise.all([
        spec.load(),
        fetchCategories(spec.categoryKind),
      ]);

      // The category NAME, onto items that carry only a category id. Both are
      // in hand exactly here, which is why the enrichment happens at this point
      // and not in the mapper -- see `withGenre`.
      const items = withGenre(loaded, categories);

      return {
        items,
        categories,
        rails: buildRails({
          items,
          categories,
          cardVariant: spec.cardVariant,
          fallbackTitle: tab.title,
          idPrefix: tab.id,
        }),
        featured: pickFeatured(items, SESSION_SEED),
      };
    }, [spec, tab.id, tab.title]);

  // Filtering client-side rather than re-querying: the list is already loaded,
  // and switching categories should be instant. Re-fetching would put a spinner
  // between two presses of the D-pad.
  const visibleItems = useMemo(() => {
    if (!data) {
      return [];
    }
    if (!selectedCategoryId) {
      return data.items;
    }
    return data.items.filter(item => item.categoryId === selectedCategoryId);
  }, [data, selectedCategoryId]);

  const openItem = useOpenItem();
  const playItem = usePlayItem();

  /** Clears the floating top bar. See components/ChromeInset.tsx. */
  const chromeInset = useChromeInset();

  /**
   * Whether to show the discovery view instead of the grid.
   *
   * Both conditions matter. "Nothing selected" is the user asking to browse
   * rather than to filter; "more than one rail" is the library being organised
   * enough for that to mean anything -- a single rail called the same thing as
   * the tab is a grid with extra steps.
   */
  const showRails =
    selectedCategoryId === null && (data?.rails.length ?? 0) > 1;

  const cardWidth =
    gridWidth > 0
      ? computeCardWidth(gridWidth, columns, gridPadding(metrics))
      : 0;

  const renderItem = useCallback(
    ({ item, index }: { item: ContentItem; index: number }) => (
      <ContentCard
        item={item}
        variant={spec.cardVariant}
        width={cardWidth}
        onPress={openItem}
        hasTVPreferredFocus={contentMayClaimFocus && index === 0}
      />
    ),
    [cardWidth, contentMayClaimFocus, openItem, spec.cardVariant],
  );

  /**
   * Row height has to follow the measured card, not the theme's row-card size:
   * the grid divides its own width, so its cards are a different size from the
   * ones a horizontal shelf gets. The extra `spacing.xl` leaves room for the
   * focus ring and the scale-up.
   */
  const columnWrapperStyle = useMemo(
    () => [
      styles.gridRow,
      {
        minHeight:
          Math.floor(cardWidth * cardAspect[spec.cardVariant]) + spacing.xl,
      },
    ],
    [cardWidth, spec.cardVariant, styles.gridRow],
  );

  /**
   * Pull-to-refresh, on a finger only. A remote has no gesture for it, and the
   * control would be a spinner nothing on a TV could ever trigger.
   */
  const refreshControl = isTouch ? (
    <RefreshControl
      refreshing={isLoading && data !== null}
      onRefresh={reload}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.surface}
    />
  ) : undefined;

  /**
   * The screen's own heading, and why it appears in one mode only.
   *
   * In grid mode it carries the count -- "Movies · 11 films" -- which is the
   * thing a filtered view most needs to say. In discovery mode the hero is the
   * heading: a title bar above a cinematic banner is a label on a thing that is
   * already announcing itself, and it would cost the hero the top of the screen
   * that makes it a hero.
   */
  const header = (
    <AppHeader
      title={tab.title}
      subtitle={
        data ? formatCount(visibleItems.length, spec.countNoun) : undefined
      }
    />
  );

  /**
   * First load: nothing to keep on screen, so a skeleton owns it.
   *
   * It is drawn with a hero, which is a guess -- whether this kind gets the
   * discovery view or the grid depends on how its categories divide up, and that
   * is not known until the query lands. The guess is deliberately the common
   * case: three of the four catalog tabs split into rails. The fourth (a kind
   * with everything in one category) shows a hero-shaped block and then a grid,
   * which is a single transient frame and the cheaper of the two errors -- the
   * alternative guesses wrong on three tabs instead of one.
   */
  if (isLoading && data === null) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        <SkeletonScreen rows={2} variant={spec.cardVariant} />
      </View>
    );
  }

  if (error && data === null) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        {header}
        <EmptyState
          title={`No ${plural}`}
          message={spec.emptyMessage}
          // The message above says to go and import something; this is what you
          // press when you have.
          action={{ label: 'Reload', onPress: reload }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: chromeInset }]}>
      {/* Discovery mode leads with the hero instead, which has to reach the top
          of its column for the artwork to read as the page. */}
      {showRails ? null : header}

      {/* `usesSidebar` decides the axis here and the picker's own shape inside
          `CategoryPicker`. Two reads of one metric rather than a prop, so the
          two cannot disagree about which way round the layout is. */}
      <View style={usesSidebar ? styles.splitRow : styles.splitColumn}>
        <CategoryPicker
          categories={data.categories}
          selectedCategoryId={selectedCategoryId}
          onSelect={selectCategory}
        />

        <TVFocusGuideView
          autoFocus
          style={styles.gridArea}
          onLayout={handleGridLayout}
        >
          {showRails ? (
            <RailList
              rails={data.rails}
              featured={data.featured}
              heroEyebrow={tab.title}
              onPlay={playItem}
              onSelectItem={openItem}
              onRefresh={reload}
              refreshing={isLoading}
              heroClaimsFocus={contentMayClaimFocus}
            />
          ) : visibleItems.length === 0 ? (
            <EmptyState
              title="Nothing in this category"
              message={
                usesSidebar
                  ? 'Pick another category from the left.'
                  : 'Pick another category from the row above.'
              }
            />
          ) : cardWidth <= 0 ? null : (
            <FlatList
              // Remounting on category change resets scroll position to the top,
              // which is what you want: keeping the old offset would leave the
              // user staring at blank space in a shorter list.
              //
              // The column count is in the key because FlatList cannot change
              // `numColumns` in place -- and it does change, the moment a phone
              // is rotated.
              key={`${selectedCategoryId ?? 'all'}-${columns}`}
              data={visibleItems}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              numColumns={columns}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={columnWrapperStyle}
              showsVerticalScrollIndicator={false}
              initialNumToRender={columns * 3}
              refreshControl={refreshControl}
              // Recycling views out from under the focus engine causes focus to
              // jump to the top of the screen. Cards are cheap; keep them
              // mounted.
              removeClippedSubviews={false}
            />
          )}
        </TVFocusGuideView>
      </View>
    </View>
  );
}

const keyExtractor = (item: ContentItem) => item.id;

const useStyles = makeStyles(m => {
  // Read from the same helper the card-width calculation is handed, so the
  // padding the grid actually renders and the padding subtracted to size a card
  // cannot drift apart.
  const padding = gridPadding(m);

  return {
    screen: {
      flex: 1,
    },
    splitRow: {
      flex: 1,
      flexDirection: 'row',
    },
    splitColumn: {
      flex: 1,
      flexDirection: 'column',
    },
    gridArea: {
      flex: 1,
    },
    gridContent: {
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingBottom: m.gutter.vertical + spacing.lg,
    },
    gridRow: {
      gap: COLUMN_GAP,
      marginBottom: spacing.md,
      // Grid rows are left-aligned so a partially filled last row does not
      // centre its cards under the full rows above.
      justifyContent: 'flex-start' as const,
    },
  };
});
