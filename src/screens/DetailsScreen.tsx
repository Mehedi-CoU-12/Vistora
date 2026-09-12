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

/** How many neighbours the "More like this" rail asks for. */
const RELATED_LIMIT = 20;

/**
 * One title: what it is, and what to do about it.
 *
 * ---------------------------------------------------------------------------
 * The hero IS the details screen
 * ---------------------------------------------------------------------------
 * The obvious build is a bespoke layout -- backdrop, title block, buttons --
 * which is the same five elements `HeroBanner` already arranges, already
 * responsively, already with the gradient treatment that makes artwork sit on a
 * page properly. Writing it twice would mean a details screen that slowly
 * drifted out of step with the home screen's hero, and the drift would show up
 * on exactly the transition where the two are seen back to back: press a card on
 * Home and the thing you pressed should appear to expand into the screen, not to
 * be replaced by a differently-designed one.
 *
 * So this screen is the hero, at its normal size, with a rail under it. The one
 * difference is `onMoreInfo`, which is absent here because "more info" is where
 * you already are.
 *
 * ---------------------------------------------------------------------------
 * Nothing about the item is fetched; only its neighbours are
 * ---------------------------------------------------------------------------
 * The whole `ContentItem` arrives in the route params, so the screen paints
 * completely on the first frame -- artwork, synopsis, buttons -- and the only
 * thing in flight is the rail at the bottom. That is what makes this feel like a
 * detail sheet rather than a page load, and it is why the loading state below is
 * a single skeleton row rather than a spinner over the whole screen: there is
 * nothing to wait for above it.
 *
 * ---------------------------------------------------------------------------
 * There is no back button, on either device
 * ---------------------------------------------------------------------------
 * The native stack wires Android's hardware BACK for free -- see the note in
 * navigation/RootNavigator.tsx -- which is the remote's primary way out of
 * anything and the phone's system gesture. A drawn one would be a permanent
 * focus stop between Play and the rail, bought with no new capability.
 *
 * A failure is silent by design. `fetchRelated` returning nothing and
 * `fetchRelated` failing produce the same screen -- a complete details view with
 * no rail -- because an error banner under a working screen would be reporting a
 * problem the viewer cannot act on and did not ask about.
 */
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

  /**
   * What the rail is called.
   *
   * "More like this" is the phrase every streaming app uses and it is a claim
   * about similarity that `fetchRelated` deliberately does not make -- it
   * returns the rest of the category. For a channel that category is the thing
   * the viewer is most likely to want next ("more News"), and naming it plainly
   * is both more accurate and more useful than the idiom.
   */
  const relatedTitle =
    item.kind === 'channel'
      ? `More ${item.meta?.genre ?? 'channels'}`
      : 'More like this';

  /**
   * Channels are 16:9 tiles and everything else is a 2:3 poster -- the same
   * split `navigation/tabs.ts` makes, for the same reason: a channel's artwork
   * is a logo on a banner and a film's is a poster. Read once here so the
   * skeleton and the real rail cannot disagree about the shape, which would show
   * up as the row changing height the moment the fetch lands.
   */
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
          // Exactly one element on this screen claims initial focus and it is
          // Play, which is what the viewer pressed a card to get to.
          hasTVPreferredFocus
          eyebrow={item.meta?.genre}
        />

        {/* The rail is the only focusable thing below the hero, so it gets a
            guide of its own: press DOWN from Play and land on the card you were
            last on, rather than wherever geometry points. */}
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
