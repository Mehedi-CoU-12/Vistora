import { buildSignedHeaders, createIdentity } from './crypto';
import type { ClientIdentity } from './crypto';
import { isSessionValid, sessionFromToken } from './session';
import type { MovieBoxSession } from './session';

export const HOST_POOL = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api4sg.aoneroom.com',
  'https://api3.aoneroom.com',
  'https://api6sg.aoneroom.com',
  'https://api.inmoviebox.com',
];

const RETRY_STATUS_CODES = new Set([403, 406, 407, 429, 500, 502, 503, 504]);

const VISITOR_LOGIN_PATH = '/wefeed-mobile-bff/user-api/visitor-login';
const REQUEST_TIMEOUT_MS = 12_000;
const BASE_BACKOFF_MS = 50;
const RATE_LIMIT_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 3_000;

export type MovieBoxErrorKind = 'hostsExhausted' | 'missingToken';

export class MovieBoxError extends Error {
  readonly kind: MovieBoxErrorKind;

  constructor(kind: MovieBoxErrorKind, message: string) {
    super(message);
    this.name = 'MovieBoxError';
    this.kind = kind;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The API wraps successful payloads in a `data` envelope, and callers only
 * ever want what is inside it.
 */
function unwrapEnvelope(payload: unknown): unknown {
  if (payload !== null && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

function readString(source: unknown, ...keys: string[]): string | null {
  if (source === null || typeof source !== 'object') {
    return null;
  }

  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

export interface MovieBoxClient {
  get(pathAndQuery: string): Promise<unknown>;
  post(pathAndQuery: string, body: unknown): Promise<unknown>;
  userAgent(): string;
  invalidateSession(): void;
}

export function createMovieBoxClient(
  identity: ClientIdentity = createIdentity(),
): MovieBoxClient {
  let session: MovieBoxSession | null = null;
  let pendingLogin: Promise<string> | null = null;
  let activeHostIndex = 0;

  async function requestHosts(
    method: string,
    pathAndQuery: string,
    body: string | null,
    authToken: string | null,
  ): Promise<unknown> {
    const hosts = HOST_POOL;
    let backoffMs = BASE_BACKOFF_MS;

    for (let attempt = 0; attempt < hosts.length; attempt++) {
      if (attempt > 0) {
        await sleep(backoffMs);
        backoffMs = BASE_BACKOFF_MS;
      }

      const index = (activeHostIndex + attempt) % hosts.length;
      const url = `${hosts[index]}${pathAndQuery}`;

      try {
        const response = await fetchWithTimeout(url, {
          method,
          headers: buildSignedHeaders(method, url, body, authToken, identity),
          body: body ?? undefined,
        });

        absorbSessionHeader(response);

        if (RETRY_STATUS_CODES.has(response.status)) {
          if (response.status === 429) {
            backoffMs = retryAfterMs(response);
          }
          continue;
        }

        if (!response.ok) {
          continue;
        }

        const payload: unknown = JSON.parse(await response.text());
        activeHostIndex = index;
        return unwrapEnvelope(payload);
      } catch {
        // Transport failure, timeout or unparseable body -- the next host in
        // the pool serves the same API, so there is nothing to report yet.
        continue;
      }
    }

    throw new MovieBoxError(
      'hostsExhausted',
      'No MovieBox host answered the request',
    );
  }

  function retryAfterMs(response: Response): number {
    const header = response.headers.get('retry-after');
    if (header === null) {
      return RATE_LIMIT_BACKOFF_MS;
    }

    const seconds = Number.parseInt(header, 10);
    if (Number.isNaN(seconds) || seconds < 0) {
      return RATE_LIMIT_BACKOFF_MS;
    }

    return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  }

  /**
   * The API can hand back a rotated token on any response, not just at login.
   * Ignoring it would keep sending a token the server has already moved on
   * from, which comes back as a pool-wide failure a request later.
   */
  function absorbSessionHeader(response: Response): void {
    const raw = response.headers.get('x-user');
    if (raw === null || raw === '') {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      const token = readString(parsed, 'token');
      if (token === null) {
        return;
      }
      session = sessionFromToken(token, readString(parsed, 'uid', 'userId'));
    } catch {
      // A malformed header is not worth failing a good response over.
    }
  }

  async function fetchFreshSession(): Promise<string> {
    const payload = await requestHosts('POST', VISITOR_LOGIN_PATH, '{}', null);
    const token = readString(payload, 'token');

    if (token === null) {
      throw new MovieBoxError(
        'missingToken',
        'MovieBox visitor login returned no token',
      );
    }

    session = sessionFromToken(token, readString(payload, 'uid', 'userId'));
    return token;
  }

  /**
   * Concurrent callers share one login. Without this, opening a screen that
   * resolves several items at once would fire a visitor-login per item.
   */
  async function ensureSession(): Promise<string> {
    if (session !== null && isSessionValid(session)) {
      return session.token;
    }

    if (pendingLogin !== null) {
      return pendingLogin;
    }

    pendingLogin = fetchFreshSession().finally(() => {
      pendingLogin = null;
    });

    return pendingLogin;
  }

  function invalidateSession(): void {
    session = null;
  }

  async function request(
    method: string,
    pathAndQuery: string,
    body: string | null,
  ): Promise<unknown> {
    const token = await ensureSession();

    try {
      return await requestHosts(method, pathAndQuery, body, token);
    } catch (error) {
      // A rejected token is not distinguishable from a dead host: the pool
      // swallows per-host status codes, so an expired session surfaces only as
      // every host failing. Re-authenticating once covers both.
      if (!(error instanceof MovieBoxError) || error.kind !== 'hostsExhausted') {
        throw error;
      }

      invalidateSession();
      const freshToken = await ensureSession();
      return requestHosts(method, pathAndQuery, body, freshToken);
    }
  }

  return {
    get: (pathAndQuery: string) => request('GET', pathAndQuery, null),
    post: (pathAndQuery: string, body: unknown) =>
      request('POST', pathAndQuery, JSON.stringify(body)),
    userAgent: () => identity.userAgent,
    invalidateSession,
  };
}
