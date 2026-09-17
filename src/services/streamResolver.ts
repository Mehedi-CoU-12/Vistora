import type { ContentItem, Stream } from '../types/content';
import { AppError, toAppError } from './errors';
import { createTtlCache } from './streamCache';

/**
 * Where a playable URL comes from, decided at the moment Play is pressed.
 *
 * ---------------------------------------------------------------------------
 * The problem this replaces
 * ---------------------------------------------------------------------------
 * Until now a stream URL was a column. `movies.stream_url` was read by
 * `movieToContentItem`, carried around inside the `ContentItem` as every screen
 * passed it about, put into navigation params, and finally handed to the
 * player -- so the URL the player opened was decided whenever the importer last
 * ran, which might be weeks ago.
 *
 * That works for exactly as long as URLs are permanent, and the ones this app
 * actually has are not:
 *
 *   - Archive.org derivative paths change when an item is re-derived, and the
 *     old path 404s.
 *   - IPTV playlist entries rotate constantly; a channel that worked yesterday
 *     is a different URL today, often on a different host.
 *   - Anything signed carries an expiry measured in minutes.
 *
 * The symptom is always the same and always misleading: the catalogue looks
 * healthy, the card looks healthy, and the failure appears as a black screen
 * with "Response code: 403" after the viewer has committed to watching
 * something. The library is not broken; the answer is just old.
 *
 * So the URL stops being a stored fact and becomes a question asked at press
 * time. A row still carries whatever URL the importer found, and for most of
 * the library that is still the right answer -- see `storedStreamSource`, which
 * is the source that returns it -- but it is now one candidate among however
 * many are registered, rather than the only thing the player can be given.
 *
 * ---------------------------------------------------------------------------
 * What a source is, and what it is deliberately not
 * ---------------------------------------------------------------------------
 * A `StreamSource` answers one question: "given this item, what URLs could play
 * it, best first?" It does not know about screens, navigation, the player, or
 * the cache, and it is never asked to decide whether the app should play
 * something. That keeps a new source a single self-contained file with no edits
 * anywhere else except one line in `sources/index.ts`.
 *
 * Adding one is the expected way this file grows. It is NOT expected to grow by
 * adding branches to `resolveStream`.
 */

/**
 * One URL the player could be given, plus enough about it to choose and to
 * debug.
 *
 * `stream` is the existing player contract unchanged -- see the note on
 * `Stream` in types/content.ts. The extra fields are about the candidate rather
 * than about the bytes, which is why they are here and not in `Stream`: the
 * player needs a URL, a protocol and some headers, and has no business knowing
 * which mirror they came from.
 */
export interface StreamCandidate {
  stream: Stream;
  /**
   * Where this came from, for a human: "Stored URL", "Archive.org · h.264".
   *
   * Shown in the player's stream-info readout and included in the message when
   * every candidate has failed, because "this stream would not play" is a much
   * more actionable sentence when it can say what was tried.
   */
  label: string;
  /**
   * "1080p", "720p", "4K" -- whatever the source calls it. Free text rather
   * than an enum because sources name resolutions inconsistently and inventing
   * a canonical set here would mean every source doing a lossy translation into
   * it. `qualityRank` below is what imposes an order.
   */
  quality?: string;
}

/**
 * The full answer to "play this": every candidate, best first.
 *
 * A list rather than a single stream, and that is the point of the type. The
 * player walks it -- see the failover note in `VideoPlayer` -- so a dead mirror
 * costs a second of buffering instead of an error screen.
 */
export interface Playback {
  /** Which item this was resolved for, so a cached answer can be matched back. */
  itemId: string;
  /** Non-empty by construction: `resolveStream` throws rather than return none. */
  candidates: StreamCandidate[];
}

export interface StreamSource {
  /** Stable, unique, lowercase. Appears in logs and in cache keys. */
  id: string;
  /**
   * Whether this source has any chance of resolving the item, judged from the
   * item alone and WITHOUT a network call.
   *
   * Cheap and synchronous on purpose: it runs for every source on every press,
   * and its job is to keep an archive.org resolver from firing at an IPTV
   * channel. A source that cannot tell should return true and return an empty
   * list from `resolve`.
   */
  canResolve: (item: ContentItem) => boolean;
  /**
   * The candidates, best first. An empty array means "not mine after all" and
   * lets the next source try; it is not an error.
   *
   * Throwing IS allowed and is treated the same way -- logged, then the next
   * source is tried -- so a source does not have to catch its own network
   * failures to avoid taking the whole press down with it.
   */
  resolve: (item: ContentItem) => Promise<StreamCandidate[]>;
  /**
   * How long this source's answers stay true, in milliseconds.
   *
   * Set it from what the source knows: a signed URL with a ten-minute expiry
   * should say so, a stored URL that only changes when an importer runs can say
   * hours. Defaults to `DEFAULT_TTL_MS`, which is deliberately short.
   */
  ttlMs?: number;
}

/**
 * How long a resolution is assumed to stay valid when its source does not say.
 *
 * Five minutes is chosen against the failure mode rather than against the hit
 * rate: the cost of a cache miss is one network round trip behind a spinner the
 * app now draws, and the cost of a stale hit is a black screen. Long enough to
 * cover press / Back / press again and an episode-to-episode hop, short enough
 * that a rotated IPTV URL heals itself without the app being restarted.
 */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * The registered sources, in priority order.
 *
 * A module-level array rather than a context or a provider object, for the same
 * reason `src/state/` uses module-level stores: this is written once at startup
 * and read from `usePlayItem`, which is a callback rather than a component, so
 * threading a provider through would buy nothing and cost every call site.
 */
const sources: StreamSource[] = [];

/**
 * Adds a source. Order is priority: the first one that yields candidates wins.
 *
 * Registering the same id twice REPLACES the earlier one in place rather than
 * appending, so that a hot reload -- which re-runs the registration module
 * without clearing the array -- does not end up with five copies of the same
 * source and five identical candidates behind the Play button.
 */
export function registerSource(source: StreamSource): void {
  const existing = sources.findIndex(other => other.id === source.id);

  if (existing >= 0) {
    sources[existing] = source;
    return;
  }

  sources.push(source);
}

/** The registered sources, in the order they will be tried. For tests and debug. */
export function registeredSources(): readonly StreamSource[] {
  return sources;
}

/** Drops every source and every cached answer. Exists for tests. */
export function resetSources(): void {
  sources.length = 0;
  cache.clear();
}

const cache = createTtlCache<Playback>();

/**
 * Cache key for an item.
 *
 * Includes `kind` because ids are only unique within a table -- a movie and an
 * episode could in principle share one -- and the two would resolve through
 * completely different sources.
 */
function cacheKey(item: ContentItem): string {
  return `${item.kind}:${item.id}`;
}

/**
 * Whether any registered source even claims this item, answered synchronously.
 *
 * This is what lets an unplayable title say so instantly instead of showing a
 * spinner for a frame and then an alert. `canResolve` is required to be cheap
 * and synchronous precisely so this question can be asked before committing to
 * the asynchronous part -- see its note on the `StreamSource` interface.
 *
 * A true here is not a promise that resolution will succeed; sources routinely
 * claim an item and then find nothing. It only rules out the case where there
 * was never anything to wait for.
 */
export function canResolveAny(item: ContentItem): boolean {
  return sources.some(source => source.canResolve(item));
}

/**
 * Forgets the cached answer for an item, so the next press resolves afresh.
 *
 * Called when a resolved URL turns out not to play. Without it, a cached answer
 * that has gone bad would be handed back for the rest of its TTL, so pressing
 * Play again -- the first thing any viewer does -- would fail identically for
 * five minutes and look like the app rather than the mirror being broken.
 */
export function invalidateResolution(item: ContentItem): void {
  cache.delete(cacheKey(item));
}

/**
 * Everything that could play this item, best first.
 *
 * ---------------------------------------------------------------------------
 * Every source is asked, in parallel, rather than the first match winning
 * ---------------------------------------------------------------------------
 * The obvious design is a chain of responsibility: walk the sources in priority
 * order, take the first non-empty answer, stop. It is simpler, it does less
 * work, and it throws away the thing this whole layer exists to provide.
 *
 * Consider the case the refactor is FOR. A film has a stored archive.org URL
 * that has rotted, and a live source that can find the current one. Under
 * first-match-wins the ordering decides which failure you get: put the stored
 * source first and the rotted URL is the only candidate, exactly as broken as
 * before; put it last and a momentarily failing network source means the
 * perfectly good stored URL is never offered. Neither order is right, because
 * the question "which of these works" cannot be answered before playing them.
 *
 * Asking everything and handing the player the whole ranked list means it does
 * not have to be answered here. A rotted URL costs a second of buffering before
 * the next candidate takes over -- see the failover note in `VideoPlayer` --
 * instead of costing the viewer the title.
 *
 * `allSettled` in parallel, so the wait is the slowest source rather than the
 * sum of them, and one source hanging does not hide the answers of the others
 * behind it.
 *
 * Throws `AppError` rather than returning an empty `Playback`, because there is
 * no useful thing for a caller to do with one: every call site would need the
 * same `if (candidates.length === 0)` branch, and the one that forgot it would
 * navigate to a player with nothing to play. `kind: 'notFound'` marks it as not
 * retryable, so `ErrorState` and `usePlayItem` both know not to offer a Retry
 * that would fail the same way.
 */
export async function resolveStream(item: ContentItem): Promise<Playback> {
  const key = cacheKey(item);

  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const applicable = sources.filter(source => source.canResolve(item));

  const settled = await Promise.allSettled(
    applicable.map(source => source.resolve(item)),
  );

  const produced: StreamCandidate[] = [];
  const contributing: StreamSource[] = [];

  settled.forEach((result, index) => {
    const source = applicable[index];

    if (result.status === 'rejected') {
      // A source that fails is a source that does not answer, not a failed
      // press: another may well have the film. The message is kept because a
      // source failing silently for everything is otherwise indistinguishable
      // from a library that genuinely has no URL for the title.
      console.warn(
        `[streamResolver] source "${source.id}" failed for ${key}:`,
        toAppError(result.reason).message,
      );
      return;
    }

    if (result.value.length === 0) {
      return;
    }

    produced.push(...result.value);
    contributing.push(source);
  });

  const candidates = rankCandidates(dedupeByUrl(produced));

  if (candidates.length === 0) {
    throw new AppError(
      'notFound',
      'No playable source was found for this title.',
    );
  }

  const playback: Playback = { itemId: item.id, candidates };

  cache.set(key, playback, shortestTtl(contributing));

  return playback;
}

/**
 * How long a multi-source answer stays true: as long as its shortest-lived part.
 *
 * Taking the minimum rather than the maximum is the conservative direction, and
 * the asymmetry of the two mistakes is why. Caching for too long means handing
 * back a candidate list whose best entries have expired, which is the exact
 * failure this layer was built to remove. Caching for too short means one extra
 * round trip behind a spinner the app already draws.
 */
function shortestTtl(contributing: readonly StreamSource[]): number {
  const shortest = contributing.reduce(
    (best, source) => Math.min(best, source.ttlMs ?? DEFAULT_TTL_MS),
    Infinity,
  );

  // `Infinity` means nothing contributed, which cannot happen on the path that
  // calls this -- a non-empty candidate list implies a contributor. Handled
  // anyway so that a future caller cannot turn it into a cache entry that never
  // expires, which is the one outcome this file is built to prevent.
  return Number.isFinite(shortest) ? shortest : DEFAULT_TTL_MS;
}

/**
 * Drops candidates that point at a URL already in the list, keeping the first.
 *
 * Two sources describing the same file is normal rather than exceptional -- a
 * live source that has re-found the URL an importer stored earlier will return
 * exactly the stored one. Without this, the player's failover would "retry" a
 * dead URL against itself before reaching a mirror that differs, which reads to
 * the viewer as the retry doing nothing.
 *
 * Keeping the FIRST occurrence keeps the better-labelled, better-ranked copy:
 * it is the one that sorted higher.
 */
function dedupeByUrl(
  candidates: readonly StreamCandidate[],
): StreamCandidate[] {
  const seen = new Set<string>();

  return candidates.filter(candidate => {
    if (seen.has(candidate.stream.url)) {
      return false;
    }
    seen.add(candidate.stream.url);
    return true;
  });
}

/**
 * Orders candidates best first: higher resolution wins, ties keep the order the
 * sources were registered in.
 *
 * A stable sort by one key, rather than a scoring function over several. The
 * temptation is to weigh resolution against a guess at reliability or at
 * bandwidth, and every version of that is a number nobody can explain when the
 * wrong mirror is chosen. Resolution is the only ranking signal a source
 * actually reports, so it is the only one used, and registration order decides
 * everything it cannot -- equal qualities are never reordered.
 *
 * `Array.prototype.sort` is specified as stable, so that tie-break needs no
 * index bookkeeping.
 */
export function rankCandidates(
  candidates: readonly StreamCandidate[],
): StreamCandidate[] {
  return [...candidates].sort(
    (a, b) => qualityRank(b.quality) - qualityRank(a.quality),
  );
}

/**
 * A quality label as a number of lines, for ordering.
 *
 * Unknown sorts LAST rather than as some assumed middle value. A source that
 * does not report quality is usually one with a single URL, and putting an
 * unlabelled candidate above a known 1080p would silently demote the better
 * stream on the strength of no information at all.
 */
export function qualityRank(quality: string | undefined): number {
  if (quality === undefined) {
    return 0;
  }

  const text = quality.trim().toLowerCase();

  if (text === '4k' || text === 'uhd') {
    return 2160;
  }
  if (text === '2k' || text === 'qhd') {
    return 1440;
  }
  if (text === 'hd') {
    return 720;
  }
  if (text === 'sd') {
    return 480;
  }

  // "1080p", "1080", "1080P" and anything else that leads with a line count.
  const digits = /^(\d{3,4})/.exec(text);

  return digits ? Number(digits[1]) : 0;
}
