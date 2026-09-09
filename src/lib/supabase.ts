import 'react-native-url-polyfill/auto';

import {createClient} from '@supabase/supabase-js';

import {configError, env} from '../config/env';
import type {Database} from '../types/database';

/**
 * The Supabase client -- the app's ONLY connection to the backend.
 *
 * ------------------------------------------------------------------
 * What this client is and is not responsible for
 * ------------------------------------------------------------------
 * It fetches application DATA: categories, channel metadata, movie metadata,
 * fixtures, and the `stream_url` string that points at a video.
 *
 * It never touches video bytes. The player opens its own connection straight to
 * the CDN using that URL. Supabase is not in the media path, so a 4K stream costs
 * us zero backend bandwidth and adds zero backend latency. See
 * src/player/VideoPlayer.tsx, which knows nothing about this file.
 *
 * ------------------------------------------------------------------
 * Why the polyfill import is first
 * ------------------------------------------------------------------
 * supabase-js builds request URLs with the WHATWG `URL` API. React Native's
 * built-in `URL` is incomplete (no `searchParams`), which shows up as silently
 * malformed query strings. `react-native-url-polyfill/auto` replaces it, and must
 * run before `createClient`, hence the side-effect import at the top.
 */

// `createClient` validates its arguments eagerly, so when configuration is
// missing we hand it a syntactically valid placeholder. Nothing will ever be
// requested from it: the data layer checks `configError` first and surfaces a
// setup message instead. See src/services/contentService.ts.
const PLACEHOLDER_URL = 'https://unconfigured.supabase.co';
const PLACEHOLDER_KEY = 'unconfigured';

export const supabase = createClient<Database>(
  configError ? PLACEHOLDER_URL : env.supabaseUrl,
  configError ? PLACEHOLDER_KEY : env.supabaseAnonKey,
  {
    auth: {
      /**
       * No authentication yet, so there is no session to keep. Persisting one
       * would require AsyncStorage; we deliberately do not add that dependency
       * until sign-in actually lands.
       *
       * When you add Supabase Auth, install
       * @react-native-async-storage/async-storage and switch to:
       *   storage: AsyncStorage,
       *   persistSession: true,
       *   autoRefreshToken: true,
       */
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {'x-application-name': 'vistora-tv'},
    },
  },
);
