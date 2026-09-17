import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { configError, env } from '../config/env';
import type { Database } from '../types/database';

const PLACEHOLDER_URL = 'https://unconfigured.supabase.co';
const PLACEHOLDER_KEY = 'unconfigured';

export const supabase = createClient<Database>(
  configError ? PLACEHOLDER_URL : env.supabaseUrl,
  configError ? PLACEHOLDER_KEY : env.supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-application-name': 'vistora-tv' },
    },
  },
);
