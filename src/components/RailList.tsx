import React, { useCallback } from 'react';
import {
  RefreshControl,
  ScrollView,
  TVFocusGuideView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { Rail } from '../navigation/rails';
import { colors, makeStyles, spacing, useMetrics } from '../theme';
import type { ContentItem } from '../types/content';
import { useReportScroll } from './ChromeInset';
import { ContentRow } from './ContentRow';
import { HeroBanner } from './HeroBanner';

interface RailListProps {
  rails: readonly Rail[];

  featured?: ContentItem | null;
  heroEyebrow?: string;
  onPlay: (item: ContentItem) => void;
  onSelectItem: (item: ContentItem) => void;

  onSeeAll?: (rail: Rail) => void;
  progress?: ReadonlyMap<string, number>;

  onRefresh?: () => void;
  refreshing?: boolean;

  chromeOverlap?: number;

  heroClaimsFocus?: boolean;
}

export function RailList({
  rails,
  featured,
  heroEyebrow,
  onPlay,
  onSelectItem,
  onSeeAll,
  progress,
  onRefresh,
  refreshing = false,
  chromeOverlap = 0,
  heroClaimsFocus = true,
}: RailListProps) {
  const { isTV, isTouch } = useMetrics();
  const styles = useStyles();

  const reportScroll = useReportScroll();

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      reportScroll(event.nativeEvent.contentOffset.y);
    },
    [reportScroll],
  );

  const snapProps = isTV
    ? ({
        snapToAlignment: 'item',
        snapToItemPadding: chromeOverlap + spacing.md,
      } as const)
    : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onScroll={chromeOverlap > 0 ? handleScroll : undefined}
      scrollEventThrottle={16}
      refreshControl={
        isTouch && onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
            progressViewOffset={chromeOverlap}
          />
        ) : undefined
      }
      {...snapProps}
    >
      {featured ? (
        <HeroBanner
          item={featured}
          onPlay={onPlay}
          onMoreInfo={onSelectItem}
          eyebrow={heroEyebrow}
          hasTVPreferredFocus={heroClaimsFocus}
        />
      ) : null}

      {}
      <TVFocusGuideView autoFocus>
        {rails.map(rail => (
          <ContentRow
            key={rail.id}
            title={rail.title}
            items={rail.items}
            cardVariant={rail.cardVariant}
            onSelectItem={onSelectItem}
            progress={progress}
            onSeeAll={
              onSeeAll && rail.seeAll ? () => onSeeAll(rail) : undefined
            }
          />
        ))}
      </TVFocusGuideView>
    </ScrollView>
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
