import {SUPABASE_ANON_KEY, SUPABASE_URL} from '@env';

/**
 * The single place where build-time configuration enters the app. Nothing else
 * imports from '@env' directly, so "where do my settings come from?" has exactly
 * one answer.
 *
 * Note what this file deliberately does NOT do: throw. A missing `.env` is a
 * normal thing to hit on a fresh clone, and crashing at module-import time gives
 * you a red box with a stack trace pointing at Babel internals. Instead we
 * surface `configError` and let the UI render it through the same error state
 * used for every other failure -- see src/components/StateViews.tsx.
 */

const url = SUPABASE_URL?.trim() ?? '';
const anonKey = SUPABASE_ANON_KEY?.trim() ?? '';

/** True while the value is still the untouched placeholder from .env.example. */
function isUnset(value: string): boolean {
  return value === '' || value.startsWith('your-') || value.includes('your-project-ref');
}

function validate(): string | null {
  const missing = [
    isUnset(url) ? 'SUPABASE_URL' : null,
    isUnset(anonKey) ? 'SUPABASE_ANON_KEY' : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    return (
      `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set.\n\n` +
      '1.  cp .env.example .env\n' +
      '2.  Paste your values from the Supabase dashboard\n' +
      '    (Project Settings → API)\n' +
      '3.  npm start -- --reset-cache\n\n' +
      'Step 3 is required: .env is read at build time, so a running Metro\n' +
      'server keeps serving the old values until its cache is cleared.'
    );
  }

  // Only check that it is an absolute HTTP(S) origin. Deliberately NOT checking
  // for a `.supabase.co` suffix -- a self-hosted Supabase lives on your own
  // domain, and rejecting that would be wrong.
  if (!/^https?:\/\/[^\s/]+/.test(url)) {
    return (
      `SUPABASE_URL is not a valid URL:\n${url}\n\n` +
      'Expected an absolute address, e.g. https://abcdefgh.supabase.co'
    );
  }

  return null;
}

/** A human-readable explanation of what is misconfigured, or null when all good. */
export const configError: string | null = validate();

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
} as const;
