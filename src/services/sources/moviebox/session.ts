import { base64Decode, utf8String } from './crypto';

const FALLBACK_LIFETIME_SECONDS = 7 * 24 * 3600;
const EXPIRY_SKEW_SECONDS = 60;

export interface MovieBoxSession {
  token: string;
  userId: string | null;

  /** Epoch seconds from the JWT's `exp`, or null when it carries none. */
  expiresAt: number | null;
  createdAt: number;
}

export interface JwtClaims {
  userId: string | null;
  expiresAt: number | null;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function claimToString(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function claimToNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function parseJwtClaims(token: string): JwtClaims {
  const payload = token.split('.')[1];
  if (payload === undefined || payload === '') {
    return { userId: null, expiresAt: null };
  }

  // JWT uses the URL-safe alphabet, where `-` and `_` stand in for `+` and `/`.
  const bytes = base64Decode(payload.replace(/-/g, '+').replace(/_/g, '/'));
  if (bytes === null) {
    return { userId: null, expiresAt: null };
  }

  let claims: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(utf8String(bytes));
    if (parsed === null || typeof parsed !== 'object') {
      return { userId: null, expiresAt: null };
    }
    claims = parsed as Record<string, unknown>;
  } catch {
    return { userId: null, expiresAt: null };
  }

  return {
    userId:
      claimToString(claims.userId) ??
      claimToString(claims.uid) ??
      claimToString(claims.sub),
    expiresAt: claimToNumber(claims.exp),
  };
}

export function createSession(
  token: string,
  userId: string | null,
  expiresAt: number | null,
): MovieBoxSession {
  return { token, userId, expiresAt, createdAt: nowSeconds() };
}

export function sessionFromToken(
  token: string,
  explicitUserId: string | null,
): MovieBoxSession {
  const claims = parseJwtClaims(token);
  return createSession(
    token,
    explicitUserId ?? claims.userId,
    claims.expiresAt,
  );
}

/**
 * A session is spent a minute before its stated expiry, so a request that is
 * already in flight does not land on the far side of it.
 */
export function isSessionValid(session: MovieBoxSession): boolean {
  if (session.token.trim() === '') {
    return false;
  }

  const now = nowSeconds();

  if (session.expiresAt !== null) {
    return now + EXPIRY_SKEW_SECONDS < session.expiresAt;
  }

  return now < session.createdAt + FALLBACK_LIFETIME_SECONDS;
}
