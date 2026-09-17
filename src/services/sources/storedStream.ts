import type { ContentItem } from '../../types/content';
import type { StreamCandidate, StreamSource } from '../streamResolver';

/**
 * The URL the row itself carries, as a resolver source.
 *
 * ---------------------------------------------------------------------------
 * This is the old behaviour, preserved exactly, in one file
 * ---------------------------------------------------------------------------
 * Before the resolver existed, `stream_url` went from the database through
 * `toStream` in types/content.ts into the `ContentItem`, and `usePlayItem`
 * handed it straight to the player. That path was the whole of playback, and
 * for most of this library it is still the correct answer: an archive.org film
 * that has not been re-derived, an IPTV channel whose playlist has not rotated,
 * every YouTube-sourced episode.
 *
 * So it is not deleted, and it is not special. It becomes a source like any
 * other, which is what makes the refactor safe to land with nothing else
 * registered: resolve every item through the seam, get back exactly the URL the
 * app would have used before, play it. Nothing about the library needs to
 * change first.
 *
 * ---------------------------------------------------------------------------
 * It is registered LAST, and it should stay there
 * ---------------------------------------------------------------------------
 * Not because it is worse -- for a healthy row it is the best answer available,
 * being correct and costing no network at all -- but because it is the one
 * answer that is always available, and registration order is the tie-break when
 * two candidates report the same quality. A live source that has just confirmed
 * a URL should be tried before a URL that was written down weeks ago and has
 * had every opportunity since to rot.
 *
 * The stored URL still ends up in the candidate list either way, which is the
 * property that matters: when the live source is down, the thing that has
 * always worked is still there to fall back to.
 *
 * ---------------------------------------------------------------------------
 * Why `stream` being null is not this source's problem
 * ---------------------------------------------------------------------------
 * `toStream` returns null for a fixture with no URL yet and for a row whose
 * protocol is `youtube` -- see its header for why a trailer is not the film.
 * Both arrive here as "I have nothing", and this source says so by returning an
 * empty list rather than by throwing. Whether that means the item is unplayable
 * is a question for the resolver, once every other source has also had its say.
 */
export const storedStreamSource: StreamSource = {
  id: 'stored',

  canResolve: (item: ContentItem) => item.stream !== null,

  resolve: async (item: ContentItem): Promise<StreamCandidate[]> => {
    if (item.stream === null) {
      return [];
    }

    return [
      {
        stream: item.stream,
        label: 'Library URL',
        /**
         * `meta.quality` rather than a guess from the URL. The schema has no
         * column saying whether a given file is 1080p, so for almost every row
         * this is undefined -- which `qualityRank` deliberately sorts last, and
         * which is the honest position for a URL nobody has measured.
         */
        quality: item.meta?.quality,
      },
    ];
  },

  /**
   * An hour, where a live source would say minutes.
   *
   * There is no network call behind this answer, so the TTL is not protecting a
   * signature or a token -- it is bounding how long a `ContentItem` that was
   * itself fetched some time ago keeps deciding playback. An hour is long
   * enough that it never costs anything in a session, short enough that a
   * long-running TV app eventually notices a re-import.
   *
   * Note the resolver caches the MERGED answer under the shortest TTL of the
   * sources that contributed to it, so this number only governs the case where
   * the stored URL is the only thing that answered.
   */
  ttlMs: 60 * 60 * 1000,
};
