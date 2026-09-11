const BASE = 'https://test-videos.co.uk';

export const meta = {
  description: 'Short open-licensed sample clips -- the wiring test',
  homepage: BASE,
  license: 'Blender open movies (CC-BY) and Jellyfish; free to redistribute',
  options: {
    quality: 'preferred height: 1080, 720 or 360 (default 720)',
  },
  categories: [
    { slug: 'sample-clips', name: 'Sample Clips', kind: 'movie', sort: 900 },
  ],
};

export async function scrape(ctx) {
  const quality = ctx.option('quality', '720');

  const index = await ctx.fetchText(`${BASE}/`);
  const slugs = [
    ...new Set(ctx.html.all(index, /href="\/([a-z0-9-]+)\/mp4-h264"/g)),
  ];
  ctx.log(`  index lists ${slugs.length} title(s): ${slugs.join(', ')}`);

  const items = [];

  for (const slug of slugs.slice(0, ctx.limit)) {
    const url = `${BASE}/${slug}/mp4-h264`;
    const page = await ctx.fetchText(url);

    const title = ctx.html.text(
      ctx.html.first(page, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    );
    if (!title) {
      ctx.log(`  ${slug}: no <h1>, skipping`);
      continue;
    }

    const file = pickFile(
      ctx.html.all(page, /href="(\/vids\/[^"]+\.mp4)"/g),
      quality,
    );
    if (!file) {
      ctx.log(`  ${slug}: no .mp4 links on the page, skipping`);
      continue;
    }

    const still = ctx.html.absolute(
      ctx.html.first(page, /<img[^>]+src=["'](\/user\/pages\/[^"']+)["']/i),
      BASE,
    );

    const details = ctx.html.text(
      ctx.html.first(
        page,
        /Video File Details<\/h\d>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
      ),
    );

    const origin = ctx.html
      .links(page, BASE)
      .map(link => link.href)
      .find(
        href =>
          !/test-videos\.co\.uk|getgrav\.org|flattr|fontawesome/i.test(href),
      );

    items.push({
      title,
      slug: ctx.toSlug('sample', title),
      streamUrl: `${BASE}${file.path}`,
      description: details,
      posterUrl: still,
      backdropUrl: still,
      durationSeconds: file.seconds,
      note: `${url}${origin ? ` -- ${origin}` : ''}`,
    });
  }

  return items;
}

function pickFile(paths, quality) {
  const files = paths
    .map(path => ({
      path,
      height: Number(path.match(/\/(\d{3,4})\//)?.[1] ?? 0),
      seconds: Number(path.match(/_(\d+)s_/)?.[1]) || null,
      megabytes: Number(path.match(/_(\d+)MB/i)?.[1] ?? 0),
    }))
    .filter(file => file.height > 0);

  if (!files.length) return null;

  const wanted = files.filter(file => String(file.height) === String(quality));
  const tallest = Math.max(...files.map(file => file.height));
  const candidates = wanted.length
    ? wanted
    : files.filter(file => file.height === tallest);

  return candidates.reduce((best, file) =>
    file.megabytes > best.megabytes ? file : best,
  );
}
