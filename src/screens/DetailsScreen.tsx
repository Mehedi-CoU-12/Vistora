import { useRoute, type RouteProp } from '@react-navigation/native';
import React from 'react';
import { ScrollView, TVFocusGuideView } from 'react-native';

import { ContentRow } from '../components/ContentRow';
import { HeroBanner } from '../components/HeroBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { SkeletonRow } from '../components/Skeleton';
import { useAsyncData } from '../hooks/useAsyncData';
import { useOpenItem } from '../hooks/useOpenItem';
import { usePlayItem } from '../hooks/usePlayItem';
import { fetchRelated } from '../services/contentService';
import { makeStyles, spacing } from '../theme';
import type { ContentItem } from '../types/content';
import type { RootStackParamList } from '../types/navigation';

const RELATED_LIMIT = 20;

export function DetailsScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Details'>>();
  const styles = useStyles();

  const { item } = params;

  const playItem = usePlayItem();
  const openItem = useOpenItem();

  const { data, isLoading } = useAsyncData<ContentItem[]>(
    () => fetchRelated(item, RELATED_LIMIT),
    [item.id],
  );

  const relatedTitle =
    item.kind === 'channel'
      ? `More ${item.meta?.genre ?? 'channels'}`
      : 'More like this';

  const relatedVariant = item.kind === 'channel' ? 'landscape' : 'poster';

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HeroBanner
          item={item}
          onPlay={playItem}
          hasTVPreferredFocus
          eyebrow={item.meta?.genre}
        />

        {}
        <TVFocusGuideView>
          {isLoading && data === null ? (
            <SkeletonRow variant={relatedVariant} />
          ) : data && data.length > 0 ? (
            <ContentRow
              title={relatedTitle}
              items={data}
              cardVariant={relatedVariant}
              onSelectItem={openItem}
            />
          ) : null}
        </TVFocusGuideView>
      </ScrollView>
    </ScreenContainer>
  );
}

const useStyles = makeStyles(m => ({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: m.gutter.vertical + spacing.xl,
  },
}));
