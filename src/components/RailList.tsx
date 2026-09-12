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
  /** Shown above the rails. Omitted where the screen has no featured title. */
  featured?: ContentItem | null;
  heroEyebrow?: string;
  onPlay: (item: ContentItem) => void;
  onSelectItem: (item: ContentItem) => void;
  /** Jump to a rail's full catalog. Absent where a rail is already all of it. */
  onSeeAll?: (rail: Rail) => void;
  progress?: ReadonlyMap<string, number>;
  /** Pull-to-refresh. Touch only; a remote has no gesture for it. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /**
   * How much of this scroller's top edge is covered by floating chrome, in dp.
   *
   * Zero -- the default -- where the screen around it has already padded the
   * chrome away, which is what the catalog screens do because their category
   * sidebar has to clear the bar too. Home passes the real height, because there
   * the hero deliberately runs UNDER the bar and only the two things below care.
   *
   * It is not a padding. Nothing is inset by it; it shifts the pull-to-refresh
   * spinner and the leanback snap offset, both of which would otherwise land
   * behind the wordmark. See the render.
   */
  chromeOverlap?: number;
  /**
   * Whether the hero may take initial D-pad focus on mount. Defaults to true.
   *
   * Set false where this list is remounted by something the user is currently
   * interacting with. On a catalog screen, choosing "All" from the category
   * picker mounts a fresh hero -- and a fresh `hasTVPreferredFocus` -- which
   * would snatch focus out of the picker the instant it was used, so the picker
   * could never be used twice. It is the same guard `CatalogScreen` has always
   * applied to the first card of its grid, for the same reason.
   */
  heroClaimsFocus?: boolean;
}

/**
 * A hero over a stack of horizontal rails: the shape every browse screen in the
 * app now shares.
 *
 * ---------------------------------------------------------------------------
 * Extracted because Home and the catalog screens are the same screen
 * ---------------------------------------------------------------------------
 * Home is "a bit of every kind"; Movies is "all of one kind"; Live TV is "all of
 * another". Those differ entirely in which rails they are handed -- the
 * scrolling, the hero, the focus guides, the refresh control and the leanback
 * snapping are identical, and were about to be written four times.
 *
 * Everything that varies is a prop, and everything that varies is DATA: a list
 * of rails and a featured item. Neither this component nor any of its callers
 * names a genre.
 *
 * ---------------------------------------------------------------------------
 * Exactly one element claims initial focus, and it is the hero
 * ---------------------------------------------------------------------------
 * No rail is given `isFirstRow`, on purpose. `hasTVPreferredFocus` is a claim on
 * the platform's focus engine and two elements making it on one screen is a race
 * -- the loser silently does nothing, and which one loses is not something the
 * app decides. With a hero present the Play button is the right answer anyway:
 * it is the thing a viewer arriving at a screen most likely wants.
 *
 * Without a hero nothing claims focus, which is deliberate rather than an
 * oversight: the platform focuses the first focusable view in the tree, which is
 * the first card of the first rail -- the same place, without the race.
 *
 * `heroClaimsFocus` turns even that off, for the one case where a remount is the
 * user's own doing rather than an arrival. See the prop.
 */
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

  /**
   * Tells the floating top bar when something is behind it, so it can go opaque.
   *
   * Reported ONLY when this list actually runs under the chrome. A catalog
   * screen has already padded itself clear of the bar, so its content is never
   * behind it at any offset and reporting would turn the bar solid over a page
   * that has nothing underneath it.
   */
  const reportScroll = useReportScroll();

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      reportScroll(event.nativeEvent.contentOffset.y);
    },
    [reportScroll],
  );

  /**
   * Leanback-style row alignment, and why it is TV-only.
   *
   * On TV, instead of scrolling the minimum amount to reveal a focused card, the
   * whole focused SECTION lands at a consistent position near the top. Each
   * `ContentRow` marks itself with `scrollSnapAlign="start"`, as does the hero;
   * this is the parent half of that contract.
   *
   * `snapToItemPadding` is how far below the scroller's top edge the snapped
   * section lands -- the fork computes `focusedStart - snapToItemPadding` for a
   * "start" alignment. That is why the chrome overlap belongs in it: on Home the
   * scroller starts at the top of the window and the top bar floats over it, so
   * a row snapped to a bare 12dp would land its heading behind the wordmark and
   * the user would be walking a rail they could not read the name of.
   *
   * The mechanism is driven by focus events, so on a phone there is nothing to
   * trigger it -- but `snapToAlignment` still applies to touch scrolling, which
   * would make a flick of the wrist stick to row boundaries instead of moving
   * freely. Off it goes.
   */
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
      // Android fires scroll events every frame regardless of this value, so it
      // is here for correctness rather than for throttling. `reportScroll`
      // ignores everything that does not change the answer, which is what keeps
      // a per-frame callback from re-rendering the screen.
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

      {/* One guide around the whole stack rather than one per rail.
          `ContentRow` already has its own, which remembers the column within a
          row; this remembers which ROW you were on, so leaving the rails for the
          hero and coming back returns you where you were rather than to the
          first rail. */}
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
    // No top padding, ever. A hero must reach the top edge of its scroller on
    // every screen -- on Home that is the top of the window, and on a catalog
    // screen it is wherever the parent has already cleared the chrome to.
    paddingBottom: m.gutter.vertical + spacing.xl,
  },
}));
