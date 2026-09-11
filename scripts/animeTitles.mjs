// @ts-check
/**
 * Turning a YouTube video title into an episode number.
 *
 * ---------------------------------------------------------------------------
 * Why this is a separate file with tests, when the other importers have none
 * ---------------------------------------------------------------------------
 * Everything else scripts/import-anime.mjs does is either an HTTP call or a
 * string template, and both fail loudly. This does not: it takes free text
 * written by whoever uploaded the video and produces the number the episode is
 * stored and sorted under. Get it wrong and nothing errors -- you get a series
 * whose episode 12 sits between 1 and 2, or two episodes claiming the same
 * slot, which the database rejects at 3am in the middle of an import with a
 * constraint violation naming neither of them.
 *
 * It is also the only part of the importer that can be exercised without a
 * network or an API key, and the part most likely to need a new pattern when
 * some channel starts titling things differently. So it lives here, alone, with
 * `src/__tests__/animeTitles.test.ts` pinning the cases that have been seen.
 *
 * ---------------------------------------------------------------------------
 * The shape of the problem
 * ---------------------------------------------------------------------------
 * Official anime channels do not agree on a format. Across Muse Asia, Ani-One
 * and the rest the same field carries all of these:
 *
 *   Show Name | Episode 7 | English Sub
 *   [Show Name] EP07
 *   Show Name - 07
 *   Show Name Season 2 Episode 3
 *   Show Name #7
 *
 * and, mixed in among them, plenty of things that are not episodes at all: a
 * PV, an opening-theme upload, a recap, a trailer.
 */

/**
 * Digit runs that are almost never an episode number, checked before any loose
 * pattern is allowed to claim one.
 *
 * A title like "Show Name (2024) - 1080p" contains two four-digit numbers and
 * one of the patterns below would happily take either. Years and resolutions
 * are the two that actually show up; both are rejected only for the LOOSE
 * patterns, never for an explicit "Episode 2024", which would be absurd but is
 * at least unambiguous about what it means.
 */
const NOT_AN_EPISODE = new Set([240, 360, 480, 720, 1080, 1440, 2160]);

/**
 * @param {number} value
 * @returns {boolean}
 */
function isImplausible(value) {
  if (NOT_AN_EPISODE.has(value)) {
    return true;
  }
  // A plain four-digit number in the 1900-2100 range is a year. Anime runs do
  // get long, but not that long -- the longest ever is under 1500 episodes and
  // is not on YouTube.
  return value >= 1900 && value <= 2100;
}

/**
 * Patterns that name an episode explicitly, tried in order.
 *
 * These are trusted even when the number looks implausible, because the word
 * "episode" is the uploader telling us directly. Only the loose patterns below
 * are second-guessed.
 */
const EXPLICIT_PATTERNS = [
  // "Episode 7", "episode.7", "Episode #7", "Episódio 7", "Folge 7"
  /\b(?:episode|episodio|epis[oó]dio|folge|ep|eps)\s*[.#:_-]?\s*(\d{1,4})\b/i,
  // "S2E07". Kept separate from the bare "E07" rule below rather than folded
  // into it with an optional group, because the boundary they each need is
  // different: here the E is preceded by a DIGIT, so `\bE` cannot match -- both
  // sides of that position are word characters and there is no boundary there
  // at all. Written as one pattern with `(?:\bS\d{1,2})?\bE`, this case
  // silently returns null and every S2E07-style title falls through to
  // positional numbering.
  /\bS\d{1,2}\s*E\s*[.#:_-]?\s*(\d{1,4})\b/i,
  // Bare "E07", where the E does begin a word.
  /\bE\s*[.#:_-]?\s*(\d{1,4})\b/i,
];

/**
 * Looser patterns, used only when nothing above matched and only when the
 * number they find is plausible.
 *
 * The first of these is the important one and also the most dangerous: a number
 * standing alone inside a delimited segment, which is how "Show Name | 07 |
 * English Sub" works. It is restricted to a WHOLE segment -- delimiter, only
 * digits, delimiter or end -- because loosening it to "a number near a
 * delimiter" starts matching the season in "Show Name - Season 2" and the year
 * in "Show Name | 2024 | PV".
 */
const LOOSE_PATTERNS = [
  /[|–—\-\[({]\s*#?\s*(\d{1,4})\s*(?:[|–—\-\])}]|$)/,
  /#\s*(\d{1,4})\b/,
  // Trailing number at the very end of the title: "Show Name 07".
  /\s(\d{1,4})\s*$/,
];

/**
 * Titles that are published to a series playlist but are not episodes of it.
 *
 * Worth filtering rather than importing-and-ignoring, because each one that
 * slips through consumes an episode number: a PV sitting at position 1 pushes
 * every real episode one slot along whenever the fallback numbering is used.
 *
 * Every noun here carries an explicit optional plural, which looks like
 * over-care and is not. `\btrailer\b` does NOT match "Trailers": the boundary
 * it wants sits between "r" and "s", both word characters, so there is no
 * boundary there at all. A channel playlist actually called "Trailers and PVs"
 * sailed through an earlier version of this and imported as a series.
 */
const NOT_EPISODE_TITLE =
  /\b(pvs?|promotional videos?|trailers?|teasers?|previews?|openings?|endings?|theme songs?|op\s*\d*\s*(?:full|ver)|ed\s*\d*\s*(?:full|ver)|recaps?|digests?|announcements?|behind the scenes|interviews?|character trailers?|key visuals?|clips?|highlights?)\b/i;

/**
 * True when this video is promotional material rather than an episode.
 *
 * @param {unknown} title
 * @returns {boolean}
 */
export function isNonEpisodeTitle(title) {
  return NOT_EPISODE_TITLE.test(String(title ?? ''));
}

/**
 * The episode number a title claims, or null when it claims none.
 *
 * Null rather than a guess, deliberately. The caller has a position in the
 * playlist to fall back on and knows whether that is trustworthy; this function
 * does not, and inventing a number here would erase the distinction between
 * "the title says episode 7" and "this was the seventh thing in the list".
 *
 * @param {unknown} title
 * @returns {number | null}
 */
export function parseEpisodeNumber(title) {
  const text = String(title ?? '');

  for (const pattern of EXPLICIT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (value > 0) {
        return value;
      }
    }
  }

  /**
   * Season markers are removed before the loose patterns run, and only before
   * them. Without this, "Show Name - Season 2" falls through the explicit
   * patterns and the trailing-number rule reads the 2 as episode 2 -- a wrong
   * answer that looks completely reasonable in the seed file. The explicit
   * patterns must NOT see this stripped text, because "S2E07" needs its S2.
   */
  const loose = text.replace(/\bseason\s*[.#:_-]?\s*\d{1,2}\b/gi, ' ');

  for (const pattern of LOOSE_PATTERNS) {
    const match = loose.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (value > 0 && !isImplausible(value)) {
        return value;
      }
    }
  }

  return null;
}

/**
 * The season a title claims, defaulting to 1.
 *
 * Defaults rather than returning null because almost nothing says "Season 1"
 * explicitly, and a null here would have to be turned into 1 by every caller.
 *
 * @param {unknown} title
 * @returns {number}
 */
export function parseSeasonNumber(title) {
  const text = String(title ?? '');
  const match =
    text.match(/\bseason\s*[.#:_-]?\s*(\d{1,2})\b/i) ??
    text.match(/\bS(\d{1,2})\s*E\d{1,4}\b/i);

  if (!match) {
    return 1;
  }

  const value = Number(match[1]);
  return value > 0 && value <= 50 ? value : 1;
}

/**
 * Strips the decoration around a series name so it can be looked up on AniList.
 *
 * Playlist titles arrive as `[Official] Show Name (Season 2) | English Sub`,
 * and AniList's search does considerably better on "Show Name" than on that.
 * Everything removed here is a wrapper the uploader added, never part of a
 * title -- which is why the season marker goes too: AniList indexes seasons as
 * separate entries with their own names, so leaving "Season 2" in reliably
 * finds nothing.
 *
 * @param {unknown} title
 * @returns {string}
 */
export function cleanSeriesTitle(title) {
  return (
    String(title ?? '')
      // Bracketed prefixes: [Official], 【Anime】, (Sub Indo)
      .replace(/[[\](){}【】]/g, ' ')
      // Everything after a pipe is almost always language/subtitle metadata.
      .replace(/\|.*$/, ' ')
      .replace(
        /\b(official|full episode|full episodes|english sub(?:bed|title)?|sub indo|subtitle indonesia|multi[\s-]?sub|anime|playlist|complete series|season\s*\d{1,2}|episode\s*\d{1,4}|ep\s*\d{1,4}|\d{3,4}p|4k|fhd|hd)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
      .trim()
  );
}

/**
 * Turns an ISO 8601 duration (`PT23M40S`, what the YouTube API returns) into
 * seconds, or null when it is absent or unparseable.
 *
 * Hand-written rather than pulled from a library: this is the only ISO duration
 * in the project, YouTube emits a narrow and well-documented subset of the
 * format, and a dependency in a build script is a dependency somebody has to
 * keep current.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseIsoDuration(value) {
  const match = String(value ?? '').match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) {
    return null;
  }

  const [, days, hours, minutes, seconds] = match.map(part =>
    part === undefined ? 0 : Number(part),
  );

  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}
