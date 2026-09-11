export const meta = {
  /** One line. Shown by `node scripts/scrape.mjs --list`. */
  description: 'What this scrapes, in one line',
  homepage: 'https://example.com',
  license: 'e.g. CC-BY, or "publisher-hosted embeds"',

  options: {
    // genre: 'restrict to one genre slug',
  },
  categories: [{ slug: 'example', name: 'Example', kind: 'movie', sort: 100 }],
};

/**
 * @param {object} ctx
 * @returns {Promise<object[]>} items -- see the header for the shape
 */
export async function scrape(ctx) {
  const base = meta.homepage;

  const index = await ctx.fetchText(`${base}/films`);
  const urls = [...new Set(ctx.html.all(index, /href="(\/film\/[^"]+)"/g))]
    .map(href => ctx.html.absolute(href, base))
    .slice(0, ctx.limit);

  ctx.log(`  ${urls.length} title page(s)`);

  const items = [];
  for (const url of urls) {
    const page = await ctx.fetchText(url);

    items.push({
      title: ctx.html.text(ctx.html.first(page, /<h1[^>]*>([\s\S]*?)<\/h1>/i)),
      streamUrl: ctx.html.absolute(
        ctx.html.first(page, /<source[^>]+src="([^"]+)"/i),
        url,
      ),
      description: ctx.html.metaTag(page, 'og:description'),
      posterUrl: ctx.html.metaTag(page, 'og:image'),
      releaseYear: Number(ctx.html.first(page, /\b(19\d{2}|20\d{2})\b/)),
      note: url,
    });
  }

  return items;
}
