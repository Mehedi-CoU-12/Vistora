import type { ContentItem, Stream } from './content';

/**
 * Route names and their parameters.
 *
 * Everything passed as a param must be plain JSON: React Navigation serialises
 * params for state persistence and deep links, so a Date or a class instance
 * would not survive. `Stream` is deliberately a plain object for this reason.
 *
 * Note the Player route takes a `Stream`, not a channel or movie id. The player
 * therefore does not re-fetch anything and does not care what kind of content it
 * was handed -- the screen that navigated already has the metadata.
 */
export type RootStackParamList = {
  /**
   * Everything you can browse. The tabs inside it are component state rather
   * than routes -- see the note in screens/BrowseScreen.tsx on why.
   */
  Browse: undefined;
  /**
   * One series and its episodes.
   *
   * Takes an id and re-fetches, which is the opposite of what `Player` does
   * below and for a reason that does not contradict it. The player is handed a
   * whole `Stream` because the screen that navigated already had every field
   * it needs; a series card does NOT already have the episode list, so passing
   * the metadata it does have would save nothing and put a list of a hundred
   * episodes into navigation state, which React Navigation serialises.
   *
   * `title` rides along anyway, purely so the screen can render its heading
   * during the fetch instead of an empty bar above a spinner.
   */
  Series: {
    seriesId: string;
    title: string;
  };
  /**
   * One title, before you commit to watching it.
   *
   * Takes the whole `ContentItem` rather than an id, and that is the same trade
   * `Player` makes below for the same reason: the card that navigated here was
   * already rendering every field this screen shows above the fold -- artwork,
   * title, metadata, synopsis, stream -- so re-fetching would put a spinner
   * between a press and a screen whose content is already in memory.
   *
   * The one thing it does NOT already have is the "More like this" rail, which
   * is why that is fetched here and nothing else is. `ContentItem` is plain JSON
   * by construction (see the note on the mappers in types/content.ts), so it
   * survives React Navigation serialising the params.
   */
  Details: {
    item: ContentItem;
  };
  Player: {
    stream: Stream;
    title: string;
    subtitle?: string;
  };
};

/**
 * Makes `useNavigation()` typed everywhere without each call site passing
 * generics. See https://reactnavigation.org/docs/typescript
 */
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
