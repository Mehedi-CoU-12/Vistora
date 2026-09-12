import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { Alert } from 'react-native';

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
 * ---------------------------------------------------------------------------
 * Playback never leaves the app
 * ---------------------------------------------------------------------------
 * There used to be a third case here: a stream whose protocol was `youtube` was
 * handed to `Linking.openURL`, because the URL was a page rather than media. It
 * meant pressing Play on a film could close Vistora and show a trailer for a
 * film the library did not have -- an answer worse than no answer, since it
 * looked like the app working.
 *
 * Those rows now arrive with `stream: null` (see `toStream` in types/content.ts)
 * and land in the unplayable branch below with everything else that cannot be
 * watched. Every path out of this hook is now either the player or a sentence
 * explaining why not.
 */
export function usePlayItem(): (item: ContentItem) => void {
  const navigation = useNavigation();

  return useCallback(
    (item: ContentItem) => {
      // A series has no stream by definition -- it is a container -- so it must
      // be answered before the unplayable branch, which would otherwise call
      // the one kind of item that is working exactly as intended "unavailable".
      // The hero labels its button "View episodes" for precisely this case, and
      // this is what makes that label true.
      if (item.kind === 'series') {
        navigation.navigate('Series', { seriesId: item.id, title: item.title });
        return;
      }

      // Everything else with no stream genuinely cannot be watched: a fixture
      // whose URL has not been published, or a row carrying something the app
      // refuses to decode. A card already badges it, but the Play button on a
      // hero is pressable regardless, and a button that does nothing at all
      // reads as a broken app rather than as missing content.
      if (item.stream === null) {
        Alert.alert('Not available', unavailableMessage(item));
        return;
      }

      // Recorded before the navigation rather than after, so the row reaches
      // Continue Watching the moment playback is committed to. Live channels are
      // dropped inside `recordPlayback` -- see the note there on why a broadcast
      // has no position to continue from.
      recordPlayback(item);

      navigation.navigate('Player', {
        stream: item.stream,
        title: item.title,
        subtitle: item.subtitle,
      });
    },
    [navigation],
  );
}

/**
 * Why this item will not play, in a sentence.
 *
 * Reuses `unavailableLabel` rather than re-deriving the reason: the mapper
 * already decided which of the two it is, and a second copy of that rule here
 * would be the one that drifts. The badge is two words because it sits in the
 * corner of a 124dp card; this has a whole dialog, so it can finish the thought.
 */
function unavailableMessage(item: ContentItem): string {
  if (item.unavailableLabel === 'Not started') {
    return `“${item.title}” has not started yet. There is nothing to play until it does.`;
  }

  return `“${item.title}” is not available to watch. The library has no stream for it.`;
}
