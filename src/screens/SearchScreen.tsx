import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, TVFocusGuideView, View } from 'react-native';

import { ContentRow } from '../components/ContentRow';
import { SearchField } from '../components/SearchField';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { catalogTabs, formatCount, type CatalogTab } from '../navigation/tabs';
import {
  isSearchable,
  MIN_SEARCH_LENGTH,
  normalizeSearchTerm,
} from '../services/searchQuery';
import { makeStyles, spacing, useMetrics } from '../theme';
import type { ContentItem } from '../types/content';

/**
 * How many matches each kind contributes.
 *
 * Higher than a home shelf's twelve, because a search is a question with an
 * answer rather than a browse -- if you typed three letters of a title you want
 * the whole plausible set -- and lower than unbounded, because a two-letter term
 * matches a large fraction of the library and five shelves of it is a slow query
 * whose tail nobody reads.
 */
const SHELF_LIMIT = 24;

/**
 * How long typing has to stop before the query runs.
 *
 * Long enough that a word typed at speed is one request rather than seven, short
 * enough that it still feels like the results are following the keystrokes. See
 * the note in useDebouncedValue on why this matters more on a television.
 */
const DEBOUNCE_MS = 300;

/** One kind's matches. */
interface ResultShelf {
  tab: CatalogTab;
  items: ContentItem[];
}

/**
 * Search across every content kind: channels, films, cartoons, anime, fixtures.
 *
 * ---------------------------------------------------------------------------
 * A shelf per kind, not one merged list
 * ---------------------------------------------------------------------------
 * The obvious rendering is a single grid of everything that matched. It is the
 * wrong one, for a reason that is visible before it is architectural: a channel
 * is a 16:9 tile and a film is a 2:3 poster, so a merged grid has to pick one
 * shape and stretch the other. Worse, "Iron" matching a channel called Iron
 * Sports and the film Iron Giant would interleave them in whatever order the
 * database happened to return, and the user's actual question -- "is this film
 * in here?" -- gets harder to answer the more results there are.
 *
 * Grouped by kind, each group keeps its own card shape and its own count, and
 * the answer is one glance: "Movies · 2 films".
 *
 * ---------------------------------------------------------------------------
 * The groups are derived from the tab list, not written out here
 * ---------------------------------------------------------------------------
 * `catalogTabs()` is the single list of what this app browses, and each entry
 * already carries the query for its kind. Mapping over it means this screen
 * names no content kind at all: adding one to navigation/tabs.ts makes it
 * searchable with no edit here. It is the same derivation `HomeScreen` uses for
 * its shelves, and it matters more here -- a kind missing from search looks
 * exactly like a kind with nothing in it, so the bug would never be reported.
 *
 * ---------------------------------------------------------------------------
 * Exactly one element claims initial focus, and it is the field
 * ---------------------------------------------------------------------------
 * `ContentRow` is deliberately NOT given `isFirstRow` here, which is what it
 * would take for the first result card to seed focus. On this screen the field
 * owns it: the user arrived to type, and a card stealing focus mid-search would
 * send the next keystroke to the platform's focus engine instead of the query.
 * The results are one press of DOWN away, and the focus guide around them means
 * that press lands on the card the user was last looking at.
 */
export function SearchScreen() {
  const navigation = useNavigation();
  const { isTV, isTouch } = useMetrics();
  const styles = useStyles();

  const [typed, setTyped] = useState('');

  // The raw value drives the field, so typing stays responsive; the settled
  // value drives the query. See useDebouncedValue.
  const settled = useDebouncedValue(typed, DEBOUNCE_MS);
  const term = normalizeSearchTerm(settled);
  const canSearch = isSearchable(term);

  /**
   * `isLoading` is deliberately not read.
   *
   * The three states this screen can be in are already distinguishable without
   * it -- `data === null` is "no completed search", and `error` says whether the
   * reason is a failure -- and reading it would introduce a bug rather than fix
   * one. `useAsyncData` sets it inside an effect, so on the render where the
   * term first becomes searchable it is still `false` from the previous
   * (skipped) load: a spinner keyed on it would be a frame late, and a "No
   * matches" keyed on its absence would flash on every search.
   */
  const { data, error, reload } = useAsyncData<
    ResultShelf[] | null
  >(async () => {
    // Returning null rather than [] is what keeps the states below honest: []
    // is a completed search that found nothing, null is "no search has run".
    // Collapsing them would flash "No matches" over the first keystroke of
    // every search.
    if (!canSearch) {
      return null;
    }

    const shelves = await Promise.all(
      catalogTabs().map(async tab => ({
        tab,
        items: await tab.catalog.load({ search: term, limit: SHELF_LIMIT }),
      })),
    );

    // Drop the kinds that matched nothing rather than rendering a heading over
    // an empty row. On a TV that is not tidiness: a row with no cards in it is
    // a focus trap, and the D-pad appears to stop working when it reaches one.
    return shelves.filter(shelf => shelf.items.length > 0);
  }, [term, canSearch]);

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
   * Headings carry their own count -- "Movies · 2 films" -- rather than the
   * screen carrying a total.
   *
   * A total answers a question nobody asked ("47 things matched"), and it would
   * need a status line above the results: a row of chrome on a 540dp-tall
   * television, and one that appears and disappears as the term changes, moving
   * the results under the user. The per-kind counts put the information where it
   * is actually useful and cost no extra row.
   */
  const headings = useMemo(
    () =>
      new Map(
        (data ?? []).map(shelf => [
          shelf.tab.id,
          `${shelf.tab.title} · ${formatCount(
            shelf.items.length,
            shelf.tab.catalog.countNoun,
          )}`,
        ]),
      ),
    [data],
  );

  /** Leanback row alignment, TV-only for the reasons HomeScreen documents. */
  const snapProps = isTV
    ? ({ snapToAlignment: 'item', snapToItemPadding: spacing.md } as const)
    : null;

  return (
    <View style={styles.screen}>
      <SearchField value={typed} onChangeText={setTyped} />

      {!canSearch ? (
        <EmptyState
          title="What are you looking for?"
          message={`Type at least ${MIN_SEARCH_LENGTH} characters to search across channels, films, cartoons, anime and fixtures.`}
        />
      ) : data === null ? (
        // The first search for this term, with nothing to keep on screen. A
        // re-search over existing results deliberately falls through to the
        // shelves below and leaves them up while the new query runs -- and so
        // does a re-search that FAILS, which is the same trade CatalogScreen
        // makes and has the same proper fix, a transient banner.
        error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <LoadingState label={`Searching for “${term}”…`} />
        )
      ) : data.length === 0 ? (
        <EmptyState
          title="No matches"
          message={`Nothing matched “${term}”. Try fewer words, or part of a title.`}
        />
      ) : (
        <TVFocusGuideView autoFocus style={styles.results}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            // Tapping a result while the soft keyboard is up should open it,
            // not just dismiss the keyboard and lose the tap.
            keyboardShouldPersistTaps="handled"
            // Dragging the results puts the keyboard away, which is the only way
            // to see more than two rows of them on a phone. Nothing to dismiss
            // on a TV, where the IME is modal and already gone.
            keyboardDismissMode={isTouch ? 'on-drag' : 'none'}
            {...snapProps}
          >
            {data.map(shelf => (
              <ContentRow
                key={shelf.tab.id}
                title={headings.get(shelf.tab.id) ?? shelf.tab.title}
                items={shelf.items}
                cardVariant={shelf.tab.catalog.cardVariant}
                onSelectItem={openItem}
                // No "See all": beside a heading reading "Cartoons · 4 cartoons"
                // it would mean either "all four matches" or "the whole Cartoons
                // tab", and there is no way for the user to tell which. The tab
                // bar is the unambiguous route to the latter.
              />
            ))}
          </ScrollView>
        </TVFocusGuideView>
      )}
    </View>
  );
}

const useStyles = makeStyles(m => ({
  screen: {
    flex: 1,
  },
  results: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    // Bottom padding so the last row can scroll clear of the bottom edge -- and
    // of the tab bar, on a phone where that bar runs along the bottom.
    paddingBottom: m.gutter.vertical + spacing.xl,
  },
}));
