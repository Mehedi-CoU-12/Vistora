/**
 * Opt-in checks against the real MovieBox API. Skipped unless you ask for
 * them, so the normal suite stays offline and deterministic:
 *
 *   VISTORA_LIVE=1 npx jest catalogueLive
 *
 * They exist because the paging depth of this source cannot be asserted
 * offline: the home tab is a fixed payload and keyword search matches titles,
 * so how much a keyword returns is a property of the live index. Run these
 * after changing the keyword seeds, or if the grids look thin.
 */
import {
  clearHomeCache,
  deriveKeywords,
  loadCataloguePage,
  searchCataloguePage,
  trendingCached,
  type CatalogueCursor,
} from '../services/moviebox/catalogue';
import type { ContentItem } from '../types/content';

// This project has no @types/node, and jest is the only runner for this file.
declare const process: { env: Record<string, string | undefined> };

const enabled = process.env.VISTORA_LIVE === '1';

const suite = enabled ? describe : describe.skip;

// Real network, real retries across the host pool.
jest.setTimeout(180_000);

suite('live MovieBox catalogue', () => {
  beforeAll(() => {
    clearHomeCache();
  });

  it('reports what the fixed home payload carries', async () => {
    const items = await trendingCached();

    const movies = items.filter(item => item.kind === 'movie').length;
    const series = items.filter(item => item.kind === 'series').length;

    console.log(
      `home payload: ${items.length} unique titles ` +
        `(${movies} movies, ${series} series)`,
    );

    expect(items.length).toBeGreaterThan(0);
  });

  it('derives keywords from titles that are really in the index', async () => {
    const keywords = deriveKeywords(await trendingCached());

    console.log(`derived ${keywords.length} keywords: ${keywords.join(', ')}`);

    expect(keywords.length).toBeGreaterThan(0);
  });

  it('shows the per-keyword yield, so a dud seed list is visible', async () => {
    const keywords = deriveKeywords(await trendingCached()).slice(0, 8);

    const report: string[] = [];
    let productive = 0;

    for (const keyword of keywords) {
      const page = await searchCataloguePage(keyword, 1);

      if (page.items.length > 0) {
        productive += 1;
      }

      report.push(
        `  ${keyword.padEnd(14)} ${String(page.items.length).padStart(3)} ` +
          `items, hasMore=${page.hasMore}`,
      );
    }

    console.log(`keyword yield:\n${report.join('\n')}`);

    // A seed list where most words match nothing would leave the grids thin.
    expect(productive).toBeGreaterThan(keywords.length / 2);
  });

  it('pages past the home payload and keeps finding new films', async () => {
    const seen = new Set<string>();
    const collected: ContentItem[] = [];

    let cursor: CatalogueCursor | null = null;
    let pages = 0;

    const keywords = deriveKeywords(await trendingCached());

    // Six pages is the depth a user reaches by scrolling a few screens.
    while (pages < 6) {
      const page = await loadCataloguePage(keywords, cursor, {
        kind: 'movie',
        seen,
      });

      for (const item of page.items) {
        seen.add(item.id);
        collected.push(item);
      }

      pages += 1;
      console.log(
        `page ${pages}: +${page.items.length} films ` +
          `(total ${collected.length}), done=${page.done}`,
      );

      if (page.done || page.cursor === null) {
        break;
      }
      cursor = page.cursor;
    }

    console.log(`reached ${collected.length} films over ${pages} pages`);

    // The whole point of the change: comfortably past the old 40-item ceiling.
    expect(collected.length).toBeGreaterThan(40);

    // And no repeats, which is what the cursor and `seen` set are for.
    expect(new Set(collected.map(item => item.id)).size).toBe(
      collected.length,
    );
  });
});
