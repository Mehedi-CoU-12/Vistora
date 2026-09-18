import React, { useCallback, useMemo } from 'react';

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
import {
  clearHomeCache,
  homeRailsCached,
} from '../services/moviebox/catalogue';
import { useContinueWatching } from '../state/continueWatching';
import { useMyList } from '../state/myList';
import type { ContentItem } from '../types/content';

const RAILS_PER_KIND = 2;

/**
 * The home payload carries roughly sixteen usable groups; this is how many of
 * them make the landing page before it stops being a landing page.
 */
const MAX_RAILS = 10;

const SESSION_SEED = Math.floor(Math.random() * 100_000);

interface HomeData {
  featured: ContentItem | null;
  rails: Rail[];
}

/** Which catalogue tab a curated rail mostly belongs to. */
function dominantTab(items: readonly ContentItem[]): TabId {
  const series = items.filter(item => item.kind === 'series').length;

  return series > items.length - series ? 'series' : 'movies';
}

export function HomeScreen({ onSeeAll }: { onSeeAll: (id: TabId) => void }) {
  const { data, isLoading, error, reload } =
    useAsyncData<HomeData>(async () => {
      const liveTab = catalogTabs().find(tab => tab.id === 'live-tv');

      const [catalogueRails, live] = await Promise.all([
        homeRailsCached().catch(() => []),
        liveTab === undefined
          ? Promise.resolve(null)
          : Promise.all([
              liveTab.catalog.load(),
              fetchCategories(liveTab.catalog.categoryKind),
            ]).then(([items, categories]) => ({
              tab: liveTab,
              items: withGenre(items, categories),
              categories,
            })),
      ]);

      const browse: Rail[] = catalogueRails.map(rail => ({
        id: rail.id,
        title: rail.title,
        items: rail.items,
        cardVariant: 'poster',

        // Send "See all" to whichever paged tab matches the rail's contents,
        // so a curated row is a way into the full catalogue.
        seeAll: dominantTab(rail.items),
      }));

      const liveRails =
        live === null
          ? []
          : homeRails(live.tab, live.items, live.categories, RAILS_PER_KIND);

      return {
        featured: pickFeatured(
          browse.flatMap(rail => rail.items),
          SESSION_SEED,
        ),
        rails: interleave([liveRails, browse]).slice(0, MAX_RAILS),
      };
    }, []);

  const openItem = useOpenItem();
  const playItem = usePlayItem();

  // The home payload is cached for the session, so a pull-to-refresh has to
  // drop it or it would re-render the same body.
  const refresh = useCallback(() => {
    clearHomeCache();
    reload();
  }, [reload]);

  const chromeOverlap = useChromeInset();

  const continueWatching = useContinueWatching();
  const myList = useMyList();

  const sessionRails = useMemo<Rail[]>(() => {
    const rails: Rail[] = [];

    if (continueWatching.length > 0) {
      rails.push({
        id: 'session:continue',
        title: 'Continue Watching',
        items: continueWatching.map(entry => entry.item),

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

  const progress = useMemo(
    () =>
      new Map(
        continueWatching
          .filter(entry => entry.progress !== undefined)
          .map(entry => [entry.item.id, entry.progress as number]),
      ),
    [continueWatching],
  );

  if (isLoading && data === null) {
    return <SkeletonScreen rows={3} />;
  }

  if (error && data === null) {
    return <ErrorState error={error} onRetry={refresh} />;
  }

  if (!data || (data.rails.length === 0 && sessionRails.length === 0)) {
    return (
      <EmptyState
        title="No content yet"
        message="Nothing to show yet. MovieBox returned no titles and no live channels were found."
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
      onRefresh={refresh}
      refreshing={isLoading}
      chromeOverlap={chromeOverlap}
    />
  );
}
