/**
 * Turning what someone typed into a filter PostgREST will accept.
 *
 * This is a separate module from `contentService` for the same reason
 * `theme/grid.ts` is separate from the screen that renders the grid: it is
 * string surgery whose failure mode is a query that returns the wrong rows --
 * or none, with a 400 the UI reports as "something went wrong" -- and that is
 * checkable in a unit test rather than against a live database.
 *
 * ---------------------------------------------------------------------------
 * Why the value has to be quoted
 * ---------------------------------------------------------------------------
 * Searching several columns at once means `or=(name.ilike.X,description.ilike.X)`,
 * and PostgREST parses that list with `,` as the separator and `()` as grouping.
 * So a perfectly ordinary title -- "Crouching Tiger, Hidden Dragon", "Alien
 * (1979)" -- would be read as filter syntax and the request would fail or match
 * nonsense. PostgREST's answer is to wrap the value in double quotes, which is
 * what `ilikeFilter` does, escaping any quote already inside it.
 *
 * That is also what makes this safe. The value never reaches PostgreSQL as SQL:
 * supabase-js sends it as a query-string parameter and PostgREST binds it into a
 * prepared statement, so quoting here is about PostgREST's own grammar, not
 * about SQL injection.
 *
 * ---------------------------------------------------------------------------
 * What survives normalisation, and what does not
 * ---------------------------------------------------------------------------
 * `%`, `_` and `*` are left alone and reach `ILIKE` as wildcards (PostgREST
 * rewrites `*` to `%`). Someone typing them gets a broader match, which is a
 * harmless and occasionally useful outcome -- they cannot escape the value.
 *
 * Backslashes are stripped, and that one is not cosmetic: `\` is `LIKE`'s escape
 * character, so a term ending in one produces `'%foo\%'` and PostgreSQL raises
 * "LIKE pattern must not end with escape character" -- a 500 from a stray
 * keystroke. No channel or film title contains a backslash, so dropping them
 * costs nothing.
 */

/**
 * Shortest term worth querying.
 *
 * One character matches most of the library, which is slow to fetch and useless
 * to read -- and on a TV it is worse than useless: several hundred cards land in
 * a shelf the D-pad then has to be held down to cross. Two is where a substring
 * match starts to mean something.
 */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Cleans up a raw input value: no backslashes (see above), no leading or
 * trailing space, and runs of whitespace collapsed to one.
 *
 * The collapse matters because the term goes into a substring match: "star
 * wars" typed with two spaces would match nothing, since no title contains a
 * double space, and the user has no way to see why.
 */
export function normalizeSearchTerm(raw: string): string {
  return raw.replace(/\\/g, '').trim().replace(/\s+/g, ' ');
}

/** Whether a normalised term is worth sending to the database. */
export function isSearchable(term: string): boolean {
  return term.length >= MIN_SEARCH_LENGTH;
}

/**
 * Builds the argument for `.or()`: a case-insensitive substring match for
 * `term` across every column named.
 *
 *     ilikeFilter(['name', 'description'], 'news')
 *     // name.ilike."%news%",description.ilike."%news%"
 *
 * Pass a term that has already been through `normalizeSearchTerm`.
 */
export function ilikeFilter(columns: readonly string[], term: string): string {
  // Only the double quote needs escaping: normalisation has already removed the
  // backslashes that would otherwise need doubling here.
  const value = `"%${term.replace(/"/g, '\\"')}%"`;

  return columns.map(column => `${column}.ilike.${value}`).join(',');
}
