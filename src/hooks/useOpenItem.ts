import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

import { isExternalStream, openExternally } from '../services/externalPlayback';
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
 * survivable the moment two of them did not: a series has to open an episode
 * list, and a YouTube episode has to leave the app entirely. Three copies means
 * three chances to forget, and forgetting looks like a card that silently does
 * nothing on one screen and works on the other two.
 *
 * So: one decision, in one place, exhaustive over the three cases.
 */
export function useOpenItem(): (item: ContentItem) => void {
  const navigation = useNavigation();

  return useCallback(
    (item: ContentItem) => {
      // A series is a container. There is nothing to play, so selecting one
      // opens what it contains -- and it is checked first because a series also
      // has `stream: null`, which the guard below would otherwise read as "not
      // playable" and turn into a card that does nothing at all.
      if (item.kind === 'series') {
        navigation.navigate('Series', {
          seriesId: item.id,
          title: item.title,
        });
        return;
      }

      // Not every item is playable -- a fixture whose stream URL has not been
      // published yet has `stream: null`. Guarding here is what keeps the
      // player free of "what if there is no URL" logic. The card has already
      // told the user why, via `unavailableLabel`.
      if (!item.stream) {
        return;
      }

      // Some streams are not ours to decode. See services/externalPlayback.ts.
      // Not awaited and not `.catch`-ed: `openExternally` handles its own
      // failure with an Alert and never rejects, so there is nothing here for
      // a caller to do with the promise.
      if (isExternalStream(item.stream)) {
        openExternally(item.stream, item.title);
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
}
