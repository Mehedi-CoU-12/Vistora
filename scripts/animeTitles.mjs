const NOT_AN_EPISODE = new Set([240, 360, 480, 720, 1080, 1440, 2160]);

/**
 * @param {number} value
 * @returns {boolean}
 */
function isImplausible(value) {
  if (NOT_AN_EPISODE.has(value)) {
    return true;
  }

  return value >= 1900 && value <= 2100;
}

const EXPLICIT_PATTERNS = [
  /\b(?:episode|episodio|epis[oó]dio|folge|ep|eps)\s*[.#:_-]?\s*(\d{1,4})\b/i,

  /\bS\d{1,2}\s*E\s*[.#:_-]?\s*(\d{1,4})\b/i,
  // Bare "E07", where the E does begin a word.
  /\bE\s*[.#:_-]?\s*(\d{1,4})\b/i,
];

const LOOSE_PATTERNS = [
  /[|–—\-\[({]\s*#?\s*(\d{1,4})\s*(?:[|–—\-\])}]|$)/,
  /#\s*(\d{1,4})\b/,
  // Trailing number at the very end of the title: "Show Name 07".
  /\s(\d{1,4})\s*$/,
];

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
