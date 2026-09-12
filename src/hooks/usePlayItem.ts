import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

import { isExternalStream, openExternally } from '../services/externalPlayback';
import { recordPlayback } from '../state/continueWatching';
import type { ContentItem } from '../types/content';

/**
 * Starts playback of an item, wherever the request came from.
 *
 * ---------------------------------------------------------------------------
 * Split out of `useOpenItem`, and the split is the point
 * ---------------------------------------------------------------------------
 * Selecting a card used to mean "play this", so one hook covered both. The
 * redesign puts a details screen between a card and the player, which makes them
 * two different verbs with two different sets of callers:
 *
 *   open   A card, anywhere. Goes to details (or to an episode list).
 *   play   The Play button on a hero or a details screen; an episode row, which
 *          IS already a detail view and would be absurd to have one of its own.
 *
 * Keeping the second verb in its own hook is what lets an episode row keep the
 * old behaviour exactly while every card changes, without either of them
 * carrying a flag about which it wants.
 *
 * The three cases below are unchanged from the original `useOpenItem`, comment
 * included -- only the entry point moved.
 */
export function usePlayItem(): (item: ContentItem) => void {
  const navigation = useNavigation();

  return useCallback(
    (item: ContentItem) => {
      // Not every item is playable -- a fixture whose stream URL has not been
      // published yet has `stream: null`, and a series has one by definition.
      // Guarding here is what keeps the player free of "what if there is no URL"
      // logic. The card and the details screen have already told the user why.
      if (!item.stream) {
        return;
      }

      // Recorded before the navigation rather than after, so a stream that
      // leaves the app entirely (below) still counts as started. Live channels
      // are dropped inside `recordPlayback` -- see the note there on why a
      // broadcast has no position to continue from.
      recordPlayback(item);

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
