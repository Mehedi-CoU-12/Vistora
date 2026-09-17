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


const RAILS_PER_KIND = 2;













const MAX_RAILS = 6;











const SESSION_SEED = Math.floor(Math.random() * 100_000);


interface HomeData {
  featured: ContentItem | null;
  rails: Rail[];
}










































export function HomeScreen({
  onSeeAll,
}: {
  
  onSeeAll: (id: TabId) => void;
}) {
  const { data, isLoading, error, reload } = useAsyncData<HomeData>(async () => {
    const kinds = await Promise.all(
      catalogTabs().map(async tab => {
        const [items, categories] = await Promise.all([
          tab.catalog.load(),
          fetchCategories(tab.catalog.categoryKind),
        ]);

        
        
        
        return { tab, items: withGenre(items, categories), categories };
      }),
    );

    return {
      featured: pickFeatured(
        
        
        
        
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
