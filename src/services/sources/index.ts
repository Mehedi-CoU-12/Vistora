import { registerSource } from '../streamResolver';
import { storedStreamSource } from './storedStream';

/**
 * Where stream sources are turned on. This is the file you edit to add one.
 *
 * ---------------------------------------------------------------------------
 * Adding a source
 * ---------------------------------------------------------------------------
 *   1. Write `sources/<name>.ts` exporting a `StreamSource` -- an `id`, a cheap
 *      synchronous `canResolve`, and a `resolve` that returns candidates best
 *      first. It imports nothing from screens, navigation, or the player.
 *   2. Import it here and add one `registerSource(...)` line ABOVE the stored
 *      source, in the priority you want it tried.
 *   3. That is the whole change. No screen, hook or player code is touched,
 *      because none of them names a source.
 *
 * Order is priority, and priority only breaks ties: candidates are ranked by
 * reported quality first, and registration order decides between equals. See
 * `rankCandidates`.
 *
 * ---------------------------------------------------------------------------
 * Why registration is a function call rather than a file scan
 * ---------------------------------------------------------------------------
 * Metro has no dynamic `require` over a directory, so "every file in sources/"
 * is not something the bundler can be asked for. An explicit list is the only
 * option that works, and it is the better one anyway: the set of sources a
 * build ships is visible in one place, in the order they are tried, instead of
 * being an emergent property of what happens to be on disk.
 *
 * ---------------------------------------------------------------------------
 * Called once, from the app root
 * ---------------------------------------------------------------------------
 * `installStreamSources()` is idempotent -- `registerSource` replaces by id --
 * so a hot reload that re-runs it does not accumulate duplicates. It is called
 * from `App.tsx` rather than at module scope so that a test can register its
 * own sources against a clean registry without this module's import order
 * deciding what is in it.
 */
export function installStreamSources(): void {
  // Live sources go here, most-preferred first.
  //
  // registerSource(archiveOrgSource);
  // registerSource(iptvPlaylistSource);

  // Always last: the URL already in the library, which is the fallback for
  // everything above. See the note in storedStream.ts on why it sits here.
  registerSource(storedStreamSource);
}
