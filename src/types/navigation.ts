import type {Stream} from './content';

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
  Home: undefined;
  LiveTv: undefined;
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
