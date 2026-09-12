import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

import type { ContentItem } from '../types/content';

/**
 * What happens when you select a card, wherever the card is.
 *
 * ---------------------------------------------------------------------------
 * Why this is a hook and not three copies of an `openItem` callback
 * ---------------------------------------------------------------------------
 * It used to be three copies -- one each in HomeScreen, CatalogScreen and
 * SearchScreen -- and they were identical, comment included, which is the
 * clearest possible sign that the knowledge belonged somewhere else. That was
 * survivable while every selectable thing did the same thing. It stopped being
 * survivable the moment two of them did not.
 *
 * So: one decision, in one place, exhaustive over the cases.
 *
 * ---------------------------------------------------------------------------
 * A card opens a screen. It does not start a video.
 * ---------------------------------------------------------------------------
 * This hook used to navigate straight to the player, which is why the app had
 * nowhere to put a synopsis, a cast of metadata, a My List button or a "More
 * like this" rail: pressing OK on a poster committed you to watching it.
 *
 * Now every card opens `Details`, and `usePlayItem` is the verb that actually
 * starts playback. The cost is one extra press before a film begins; what it
 * buys is the screen that every other premium streaming app has between the two,
 * and the ability for an unplayable item -- a fixture with no URL yet -- to
 * explain itself rather than to silently do nothing when pressed.
 *
 * A series is still the exception, and still checked first. There is no such
 * thing as playing one, and its details ARE its episode list, so a details
 * screen in front of that list would be a screen whose only content is a button
 * to the next screen.
 */
export function useOpenItem(): (item: ContentItem) => void {
  const navigation = useNavigation();

  return useCallback(
    (item: ContentItem) => {
      if (item.kind === 'series') {
        navigation.navigate('Series', {
          seriesId: item.id,
          title: item.title,
        });
        return;
      }

      navigation.navigate('Details', { item });
    },
    [navigation],
  );
}
