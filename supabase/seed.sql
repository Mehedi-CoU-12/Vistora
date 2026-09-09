-- =============================================================================
-- Vistora -- development seed data
-- =============================================================================
-- Apply after 0001_initial_schema.sql:
--   supabase db reset            (CLI: runs migrations, then this file)
--   psql "$DATABASE_URL" -f supabase/seed.sql
--   or paste into the Supabase SQL Editor
--
-- Safe to run repeatedly: every insert is `on conflict (slug) do update`.
--
-- ABOUT THESE STREAM URLS
-- Every URL below is a public test/demo asset published by its owner for exactly
-- this purpose -- Apple's HLS reference streams, Mux's test-streams collection,
-- Unified Streaming's demo endpoint, Akamai's public test channels, and Blender
-- Foundation open-movie content. All were HTTP 200 when this file was written.
-- Third-party demo endpoints do get retired, so if one stops playing it is the
-- sample that died, not your player. Replace it with your own source.
--
-- Posters and logos come from picsum.photos, a placeholder image service. Swap
-- these for Supabase Storage public URLs when you have real artwork.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
insert into public.categories (slug, name, kind, sort_order) values
  ('news',          'News',           'live_tv', 10),
  ('entertainment', 'Entertainment',  'live_tv', 20),
  ('sports-tv',     'Sports Channels','live_tv', 30),
  ('football',      'Football',       'sports',  10),
  ('cricket',       'Cricket',        'sports',  20),
  ('action',        'Action',         'movie',   10),
  ('animation',     'Animation',      'movie',   20),
  ('kids-cartoons', 'Cartoons',       'cartoon', 10)
on conflict (slug) do update
  set name = excluded.name,
      kind = excluded.kind,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- sports
-- ---------------------------------------------------------------------------
insert into public.sports (slug, name, sort_order) values
  ('football',   'Football',   10),
  ('cricket',    'Cricket',    20),
  ('basketball', 'Basketball', 30),
  ('tennis',     'Tennis',     40)
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- channels  (Live TV)
-- ---------------------------------------------------------------------------
insert into public.channels
  (slug, name, description, logo_url, stream_url, stream_protocol, category_id, channel_number, sort_order)
values
  ('vistora-one',
   'Vistora One',
   'Apple''s reference HLS stream -- multiple bitrates, so you can watch adaptive switching work.',
   'https://picsum.photos/seed/vistora-one/240/240',
   'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
   'hls',
   (select id from public.categories where slug = 'entertainment'),
   101, 10),

  ('vistora-news',
   'Vistora News 24',
   'A genuinely live Akamai test channel -- useful for checking live-edge behaviour and rebuffering.',
   'https://picsum.photos/seed/vistora-news/240/240',
   'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
   'hls',
   (select id from public.categories where slug = 'news'),
   102, 20),

  ('vistora-cinema',
   'Vistora Cinema',
   'Big Buck Bunny, multi-variant. Blender Foundation open movie.',
   'https://picsum.photos/seed/vistora-cinema/240/240',
   'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
   'hls',
   (select id from public.categories where slug = 'entertainment'),
   103, 30),

  ('vistora-sport',
   'Vistora Sport HD',
   'Second live Akamai test channel.',
   'https://picsum.photos/seed/vistora-sport/240/240',
   'https://moctobpltc-i.akamaihd.net/hls/live/571329/eight/playlist.m3u8',
   'hls',
   (select id from public.categories where slug = 'sports-tv'),
   104, 40),

  ('vistora-classics',
   'Vistora Classics',
   'Tears of Steel via Unified Streaming''s demo endpoint.',
   'https://picsum.photos/seed/vistora-classics/240/240',
   'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
   'hls',
   (select id from public.categories where slug = 'entertainment'),
   105, 50),

  ('vistora-discovery',
   'Vistora Discovery',
   'Apple BipBop 16:9 variant playlist.',
   'https://picsum.photos/seed/vistora-discovery/240/240',
   'https://d2zihajmogu5jn.cloudfront.net/bipbop-advanced/bipbop_16x9_variant.m3u8',
   'hls',
   (select id from public.categories where slug = 'entertainment'),
   106, 60),

  ('vistora-4k',
   'Vistora 4K Showcase',
   'A 4K HLS sample. Good for confirming your TV device really decodes 2160p.',
   'https://picsum.photos/seed/vistora-4k/240/240',
   'https://sample.vodobox.net/skate_phantom_flex_4k/skate_phantom_flex_4k.m3u8',
   'hls',
   (select id from public.categories where slug = 'entertainment'),
   107, 70),

  ('vistora-extra',
   'Vistora Extra',
   'Stream containing timestamp discontinuities -- a good robustness test.',
   'https://picsum.photos/seed/vistora-extra/240/240',
   'https://test-streams.mux.dev/dai-discontinuity-deltatre/manifest.m3u8',
   'hls',
   (select id from public.categories where slug = 'news'),
   108, 80),

  -- Intentionally inactive. It must NOT appear in the app: proof that the
  -- `is_active` RLS filter works, not just the app's own query.
  ('vistora-draft',
   'Vistora Draft (should be hidden)',
   'If you can see this in the app, the RLS read policy is not doing its job.',
   'https://picsum.photos/seed/vistora-draft/240/240',
   'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
   'hls',
   (select id from public.categories where slug = 'news'),
   999, 999)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      logo_url = excluded.logo_url,
      stream_url = excluded.stream_url,
      stream_protocol = excluded.stream_protocol,
      category_id = excluded.category_id,
      channel_number = excluded.channel_number,
      sort_order = excluded.sort_order;

update public.channels set is_active = false where slug = 'vistora-draft';

-- ---------------------------------------------------------------------------
-- movies (and cartoons)
-- ---------------------------------------------------------------------------
insert into public.movies
  (slug, title, description, poster_url, backdrop_url, stream_url, stream_protocol,
   release_year, duration_seconds, content_rating, category_id, sort_order)
values
  ('big-buck-bunny',
   'Big Buck Bunny',
   'A large rabbit takes revenge on three rodents who have been tormenting the forest''s smaller creatures. Blender Foundation open movie.',
   'https://picsum.photos/seed/bbb-poster/400/600',
   'https://picsum.photos/seed/bbb-backdrop/1280/720',
   'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
   'hls', 2008, 596, 'G',
   (select id from public.categories where slug = 'animation'), 10),

  ('tears-of-steel',
   'Tears of Steel',
   'A group of warriors and scientists must return to Amsterdam to stop a robot invasion. Blender Foundation open movie.',
   'https://picsum.photos/seed/tos-poster/400/600',
   'https://picsum.photos/seed/tos-backdrop/1280/720',
   'https://test-streams.mux.dev/tos_ismc/main.m3u8',
   'hls', 2012, 734, 'PG-13',
   (select id from public.categories where slug = 'action'), 20),

  ('sintel',
   'Sintel',
   'A lone girl searches for the dragon she once befriended. Blender Foundation open movie.',
   'https://picsum.photos/seed/sintel-poster/400/600',
   'https://picsum.photos/seed/sintel-backdrop/1280/720',
   'https://media.w3.org/2010/05/sintel/trailer.mp4',
   -- Deliberately an MP4 rather than HLS, so the app exercises both protocol
   -- paths through Media3 from day one.
   'mp4', 2010, 888, 'PG',
   (select id from public.categories where slug = 'animation'), 30),

  ('skate-phantom-4k',
   'Phantom Flex 4K',
   'Slow-motion 4K showcase footage.',
   'https://picsum.photos/seed/skate-poster/400/600',
   'https://picsum.photos/seed/skate-backdrop/1280/720',
   'https://sample.vodobox.net/skate_phantom_flex_4k/skate_phantom_flex_4k.m3u8',
   'hls', 2015, 180, 'G',
   (select id from public.categories where slug = 'action'), 40),

  -- Cartoons: same table, different category kind.
  ('bunny-shorts',
   'Bunny Shorts',
   'Short animated clips for younger viewers.',
   'https://picsum.photos/seed/bunny-shorts/400/600',
   'https://picsum.photos/seed/bunny-shorts-bd/1280/720',
   'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
   'mp4', 2019, 10, 'G',
   (select id from public.categories where slug = 'kids-cartoons'), 10),

  ('bipbop-adventures',
   'BipBop Adventures',
   'Colourful animated test content.',
   'https://picsum.photos/seed/bipbop-poster/400/600',
   'https://picsum.photos/seed/bipbop-backdrop/1280/720',
   'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
   'hls', 2021, 1800, 'G',
   (select id from public.categories where slug = 'kids-cartoons'), 20)
on conflict (slug) do update
  set title = excluded.title,
      description = excluded.description,
      poster_url = excluded.poster_url,
      backdrop_url = excluded.backdrop_url,
      stream_url = excluded.stream_url,
      stream_protocol = excluded.stream_protocol,
      release_year = excluded.release_year,
      duration_seconds = excluded.duration_seconds,
      content_rating = excluded.content_rating,
      category_id = excluded.category_id,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- sports_events
-- ---------------------------------------------------------------------------
-- Times are relative to now() so the "Live now" / "Coming up" rows always have
-- something in them, however long after seeding you run the app.
insert into public.sports_events
  (slug, title, sport_slug, competition, home_team, away_team, description,
   poster_url, stream_url, stream_protocol, starts_at, ends_at, status, category_id)
values
  ('epl-live-now',
   'Northside United vs Harbour City',
   'football', 'Premier Division', 'Northside United', 'Harbour City',
   'Second half under way.',
   'https://picsum.photos/seed/epl-live/400/600',
   'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
   'hls', now() - interval '40 minutes', now() + interval '50 minutes', 'live',
   (select id from public.categories where slug = 'football')),

  ('t20-live-now',
   'Riverside Kings vs Coastal Warriors',
   'cricket', 'T20 Cup', 'Riverside Kings', 'Coastal Warriors',
   'Innings break approaching.',
   'https://picsum.photos/seed/t20-live/400/600',
   'https://moctobpltc-i.akamaihd.net/hls/live/571329/eight/playlist.m3u8',
   'hls', now() - interval '1 hour', now() + interval '2 hours', 'live',
   (select id from public.categories where slug = 'cricket')),

  -- No stream_url yet, which is normal for a fixture. The schema allows this for
  -- 'scheduled' but forbids it for 'live', and the app renders these as
  -- non-playable with a kickoff time.
  ('epl-upcoming',
   'Hillside Rovers vs Central Athletic',
   'football', 'Premier Division', 'Hillside Rovers', 'Central Athletic',
   'Kick-off later today.',
   'https://picsum.photos/seed/epl-next/400/600',
   null, 'hls', now() + interval '3 hours', now() + interval '5 hours', 'scheduled',
   (select id from public.categories where slug = 'football')),

  ('odi-upcoming',
   'Southern Lions vs Desert Falcons',
   'cricket', 'ODI Series', 'Southern Lions', 'Desert Falcons',
   'Day-night fixture.',
   'https://picsum.photos/seed/odi-next/400/600',
   null, 'hls', now() + interval '1 day', now() + interval '1 day 8 hours', 'scheduled',
   (select id from public.categories where slug = 'cricket')),

  ('nba-upcoming',
   'Metro Storm vs Lakeside Giants',
   'basketball', 'Pro League', 'Metro Storm', 'Lakeside Giants',
   'Regular season.',
   'https://picsum.photos/seed/nba-next/400/600',
   null, 'hls', now() + interval '2 days', now() + interval '2 days 3 hours', 'scheduled',
   null),

  ('epl-finished',
   'Old Town FC vs Valley Rangers',
   'football', 'Premier Division', 'Old Town FC', 'Valley Rangers',
   'Full time: 2-1.',
   'https://picsum.photos/seed/epl-done/400/600',
   null, 'hls', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 'finished',
   (select id from public.categories where slug = 'football'))
on conflict (slug) do update
  set title = excluded.title,
      sport_slug = excluded.sport_slug,
      competition = excluded.competition,
      home_team = excluded.home_team,
      away_team = excluded.away_team,
      description = excluded.description,
      poster_url = excluded.poster_url,
      stream_url = excluded.stream_url,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      status = excluded.status,
      category_id = excluded.category_id;
