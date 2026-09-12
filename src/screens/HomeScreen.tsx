import React, { useMemo } from 'react';

import { useChromeInset } from '../components/ChromeInset';
import { RailList } from '../components/RailList';
import { SkeletonScreen } from '../components/Skeleton';
import { EmptyState, ErrorState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
import { useOpenItem } from '../hooks/useOpenItem';
import { usePlayItem } from '../hooks/usePlayItem';
import {
  homeRails,
  interleave,
  pickFeatured,
  withGenre,
  type Rail,
} from '../navigation/rails';
import { catalogTabs, type TabId } from '../navigation/tabs';
import { fetchCategories } from '../services/contentService';
import { useContinueWatching } from '../state/continueWatching';
import { useMyList } from '../state/myList';
import type { ContentItem } from '../types/content';

/** Rails each content kind contributes to Home. See `homeRails`. */
const RAILS_PER_KIND = 2;

/**
 * Ceiling on the rails Home renders at once.
 *
 * This screen is a vertical ScrollView, not a virtualised list, which is a
 * deliberate constraint rather than an oversight -- see the note on the render
 * below. A ScrollView lays out every child on mount, so the number of children
 * is the performance budget, and six rails of eight initially-rendered cards is
 * about fifty views: comfortable on the weakest Android TV this targets.
 *
 * Everything cut here is one press away in its own tab, which is the difference
 * between a cap on Home and a cap on the app.
 */
const MAX_RAILS = 6;

/**
 * Which title the hero opens on.
 *
 * Module scope, so it is fixed for the life of the process: the app opens on a
 * different film each launch and on the SAME film every time you return to Home
 * within a session. Both halves matter. Re-rolling per mount would change the
 * hero every time a TV viewer switched tabs and came back, which reads as the
 * screen having reloaded behind their back; never rolling at all would make the
 * home screen identical forever.
 */
const SESSION_SEED = Math.floor(Math.random() * 100_000);

/** Everything the screen renders, resolved in one load. */
interface HomeData {
  featured: ContentItem | null;
  rails: Rail[];
}

/**
 * The home screen: one cinematic hero over a stack of horizontal rails.
 *
 * ---------------------------------------------------------------------------
 * The rails are derived twice over, and neither list is written down
 * ---------------------------------------------------------------------------
 * This screen used to render one row per catalog tab -- four rows, all of them
 * called the same thing as the tab they came from. That is a table of contents,
 * not a home screen: it tells you what kinds of thing exist and nothing about
 * what is in them.
 *
 * It now asks `catalogTabs()` what kinds exist (unchanged, and still the reason
 * adding a kind needs no edit here) and then asks `buildRails` to split each
 * kind by its own CATEGORIES -- so the rows are "Trending", "In Cinemas",
 * "News", "Kids & Cartoons", which are rows from the `categories` table and not
 * strings in this file. Adding a genre in the database adds a rail.
 *
 * ---------------------------------------------------------------------------
 * One load, still, and now it is load-bearing for the hero as well
 * ---------------------------------------------------------------------------
 * `Promise.all` fires every query concurrently and gives the screen a single
 * loading state, which on a television is a correctness property rather than a
 * nicety: shelves appearing one at a time move the focused element under the
 * user. With a hero on top that gets worse, not better -- a hero that arrives
 * after the rails would shove the entire screen down by 324dp.
 *
 * So nothing renders until everything has arrived, and what renders in the
 * meantime is a skeleton in the same shape (see components/Skeleton.tsx).
 *
 * ---------------------------------------------------------------------------
 * A ScrollView, deliberately, and what keeps it affordable
 * ---------------------------------------------------------------------------
 * A `FlatList` of rails would virtualise the vertical axis and is the obvious
 * choice for a long feed. It is the wrong one here: virtualisation unmounts
 * rows, the platform focus engine can only move to views that EXIST, and a row
 * unmounted from under the D-pad drops focus to the top of the screen. Every
 * list in this app sets `removeClippedSubviews={false}` for the same reason.
 *
 * The budget is held instead by `MAX_RAILS` above and by each rail's own
 * `initialNumToRender`.
 */
export function HomeScreen({
  onSeeAll,
}: {
  /** Switch to a tab. Supplied by BrowseScreen, which owns the tab state. */
  onSeeAll: (id: TabId) => void;
}) {
  const { data, isLoading, error, reload } = useAsyncData<HomeData>(async () => {
    const kinds = await Promise.all(
      catalogTabs().map(async tab => {
        const [items, categories] = await Promise.all([
          tab.catalog.load(),
          fetchCategories(tab.catalog.categoryKind),
        ]);

        // Genre is a category NAME and an item carries only a category id, so
        // this is the one point in the app where both are in hand. The hero
        // reads it for its eyebrow and its metadata line.
        return { tab, items: withGenre(items, categories), categories };
      }),
    );

    return {
      featured: pickFeatured(
        // Every kind is a candidate, and the ranking inside `pickFeatured`
        // sorts it out: in practice the films win, because they are the only
        // rows that carry a backdrop -- but a library of nothing but channels
        // would still get a hero rather than an empty band.
        kinds.flatMap(kind => kind.items),
        SESSION_SEED,
      ),
      rails: interleave(
        kinds.map(kind =>
          homeRails(kind.tab, kind.items, kind.categories, RAILS_PER_KIND),
        ),
      ).slice(0, MAX_RAILS),
    };
  }, []);

  const openItem = useOpenItem();
  const playItem = usePlayItem();

  /**
   * The top bar floats over this screen rather than sitting above it, which is
   * what lets the hero artwork reach the top of the window. Nothing here is
   * padded by it -- that is the point -- but the two things that would otherwise
   * be lost behind it need to know how tall it is. See `RailList`.
   */
  const chromeOverlap = useChromeInset();

  /**
   * The two session-only rails, pinned above everything derived from the
   * database. See src/state/ for why they are session-only and what replacing
   * that looks like; both are empty on a cold start, and an empty rail renders
   * as nothing at all.
   */
  const continueWatching = useContinueWatching();
  const myList = useMyList();

  const sessionRails = useMemo<Rail[]>(() => {
    const rails: Rail[] = [];

    if (continueWatching.length > 0) {
      rails.push({
        id: 'session:continue',
        title: 'Continue Watching',
        items: continueWatching.map(entry => entry.item),
        // Poster, because everything that reaches this rail is a film: live
        // channels are excluded at the source and episodes only exist inside a
        // series screen. If that stops being true the rail should take the
        // variant of what is actually on it.
        cardVariant: 'poster',
      });
    }

    if (myList.length > 0) {
      rails.push({
        id: 'session:my-list',
        title: 'My List',
        items: [...myList],
        cardVariant: 'poster',
      });
    }

    return rails;
  }, [continueWatching, myList]);

  /** Real positions, once the player reports any. See state/continueWatching.ts. */
  const progress = useMemo(
    () =>
      new Map(
        continueWatching
          .filter(entry => entry.progress !== undefined)
          .map(entry => [entry.item.id, entry.progress as number]),
      ),
    [continueWatching],
  );

  // First load has nothing to keep on screen, so the skeleton owns it. A reload
  // over existing rails shows the refresh spinner instead -- see the note in
  // CatalogScreen, which also covers what a FAILED reload does.
  if (isLoading && data === null) {
    return <SkeletonScreen rows={3} />;
  }

  if (error && data === null) {
    return <ErrorState error={error} onRetry={reload} />;
  }

  if (!data || (data.rails.length === 0 && sessionRails.length === 0)) {
    return (
      <EmptyState
        title="No content yet"
        message="Your database is reachable but empty. Apply supabase/seed.sql to load sample channels, movies and fixtures."
      />
    );
  }

  const rails = [...sessionRails, ...data.rails];

  return (
    <RailList
      rails={rails}
      featured={data.featured}
      heroEyebrow="Featured on Vistora"
      onPlay={playItem}
      onSelectItem={openItem}
      onSeeAll={rail => {
        if (rail.seeAll) {
          onSeeAll(rail.seeAll);
        }
      }}
      progress={progress}
      onRefresh={reload}
      refreshing={isLoading}
      chromeOverlap={chromeOverlap}
    />
  );
}
