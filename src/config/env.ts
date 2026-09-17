import {
  REACT_APP_EXTERNAL_STREAM_API,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from '@env';

const url = SUPABASE_URL?.trim() ?? '';
const anonKey = SUPABASE_ANON_KEY?.trim() ?? '';

function isUnset(value: string): boolean {
  return (
    value === '' ||
    value.startsWith('your-') ||
    value.includes('your-project-ref')
  );
}

function optional(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return isUnset(trimmed) ? '' : trimmed;
}

function validate(): string | null {
  const missing = [
    isUnset(url) ? 'SUPABASE_URL' : null,
    isUnset(anonKey) ? 'SUPABASE_ANON_KEY' : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    return (
      `${missing.join(' and ')} ${
        missing.length === 1 ? 'is' : 'are'
      } not set.\n\n` +
      '1.  cp .env.example .env\n' +
      '2.  Paste your values from the Supabase dashboard\n' +
      '    (Project Settings → API)\n' +
      '3.  npm start -- --reset-cache\n\n' +
      'Step 3 is required: .env is read at build time, so a running Metro\n' +
      'server keeps serving the old values until its cache is cleared.'
    );
  }

  if (!/^https?:\/\/[^\s/]+/.test(url)) {
    return (
      `SUPABASE_URL is not a valid URL:\n${url}\n\n` +
      'Expected an absolute address, e.g. https://abcdefgh.supabase.co'
    );
  }

  return null;
}

export const configError: string | null = validate();

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  externalStreamApi: optional(REACT_APP_EXTERNAL_STREAM_API),
} as const;
