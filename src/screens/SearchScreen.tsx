import React, { useMemo, useState } from 'react';
import { ScrollView, TVFocusGuideView, View } from 'react-native';

import { useChromeInset } from '../components/ChromeInset';
import { ContentRow } from '../components/ContentRow';
import { SearchField } from '../components/SearchField';
import { SkeletonScreen } from '../components/Skeleton';
import { EmptyState, ErrorState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useOpenItem } from '../hooks/useOpenItem';
import {
  catalogTabs,
  catalogTitleList,
  formatCount,
  type CatalogTab,
} from '../navigation/tabs';
import {
  isSearchable,
  MIN_SEARCH_LENGTH,
  normalizeSearchTerm,
} from '../services/searchQuery';
import { makeStyles, spacing, useMetrics } from '../theme';
import type { ContentItem } from '../types/content';










const SHELF_LIMIT = 24;








const DEBOUNCE_MS = 300;


interface ResultShelf {
  tab: CatalogTab;
  items: ContentItem[];
}






































export function SearchScreen() {
  const { isTV, isTouch } = useMetrics();
  const styles = useStyles();

  
  const chromeInset = useChromeInset();

  const [typed, setTyped] = useState('');

  
  
  const settled = useDebouncedValue(typed, DEBOUNCE_MS);
  const term = normalizeSearchTerm(settled);
  const canSearch = isSearchable(term);

  










  const { data, error, reload } = useAsyncData<
    ResultShelf[] | null
  >(async () => {
    
    
    
    
    if (!canSearch) {
      return null;
    }

    const shelves = await Promise.all(
      catalogTabs().map(async tab => ({
        tab,
        items: await tab.catalog.load({ search: term, limit: SHELF_LIMIT }),
      })),
    );

    
    
    
    return shelves.filter(shelf => shelf.items.length > 0);
  }, [term, canSearch]);

  const openItem = useOpenItem();

  









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

  
  const snapProps = isTV
    ? ({ snapToAlignment: 'item', snapToItemPadding: spacing.md } as const)
    : null;

  return (
    <View style={[styles.screen, { paddingTop: chromeInset }]}>
      <SearchField value={typed} onChangeText={setTyped} />

      {!canSearch ? (
        <EmptyState
          title="What are you looking for?"
          message={`Type at least ${MIN_SEARCH_LENGTH} characters to search across ${catalogTitleList()}.`}
        />
      ) : data === null ? (
        
        
        
        
        
        error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          
          
          
          <SkeletonScreen hero={false} rows={2} />
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
            
            
            keyboardShouldPersistTaps="handled"
            
            
            
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
    
    
    paddingBottom: m.gutter.vertical + spacing.xl,
  },
}));
