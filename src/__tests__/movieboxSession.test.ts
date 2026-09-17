import { base64Encode, utf8Bytes } from '../services/sources/moviebox/crypto';
import {
  createSession,
  isSessionValid,
  parseJwtClaims,
  sessionFromToken,
} from '../services/sources/moviebox/session';

const jwt = (payload: object): string => {
  const encoded = base64Encode(utf8Bytes(JSON.stringify(payload)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[=]+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`;
};

describe('parseJwtClaims', () => {
  it('reads userId and exp from the payload', () => {
    const claims = parseJwtClaims(
      jwt({ userId: '123456789', exp: 1893456000, role: 'visitor' }),
    );

    expect(claims.userId).toBe('123456789');
    expect(claims.expiresAt).toBe(1893456000);
  });

  it('accepts uid and sub as aliases for userId', () => {
    expect(parseJwtClaims(jwt({ uid: 42 })).userId).toBe('42');
    expect(parseJwtClaims(jwt({ sub: 'abc' })).userId).toBe('abc');
  });

  it('reads a string exp', () => {
    expect(parseJwtClaims(jwt({ exp: '1893456000' })).expiresAt).toBe(
      1893456000,
    );
  });

  it('returns empty claims for anything that is not a jwt', () => {
    for (const bad of ['', 'not-a-jwt', 'a.!!!!.c', 'header.only']) {
      expect(parseJwtClaims(bad)).toEqual({ userId: null, expiresAt: null });
    }
  });

  it('survives a payload that decodes but is not an object', () => {
    const encoded = base64Encode(utf8Bytes('"just a string"'));
    expect(parseJwtClaims(`h.${encoded}.s`)).toEqual({
      userId: null,
      expiresAt: null,
    });
  });
});

describe('sessionFromToken', () => {
  it('prefers an explicit user id over the jwt claim', () => {
    const session = sessionFromToken(jwt({ userId: 'from-jwt' }), 'explicit');
    expect(session.userId).toBe('explicit');
  });

  it('falls back to the jwt claim', () => {
    expect(sessionFromToken(jwt({ userId: 'from-jwt' }), null).userId).toBe(
      'from-jwt',
    );
  });
});

describe('isSessionValid', () => {
  const nowSeconds = (): number => Math.floor(Date.now() / 1000);

  it('accepts a session well inside its expiry', () => {
    expect(
      isSessionValid(createSession('token', null, nowSeconds() + 3600)),
    ).toBe(true);
  });

  it('rejects an expired session', () => {
    expect(isSessionValid(createSession('token', null, 100))).toBe(false);
  });

  it('rejects a session inside the expiry skew', () => {
    expect(
      isSessionValid(createSession('token', null, nowSeconds() + 30)),
    ).toBe(false);
  });

  it('rejects an empty token whatever the expiry says', () => {
    expect(isSessionValid(createSession('', null, nowSeconds() + 3600))).toBe(
      false,
    );
    expect(isSessionValid(createSession('   ', null, null))).toBe(false);
  });

  it('gives a session with no expiry a week', () => {
    const session = createSession('token', null, null);
    expect(isSessionValid(session)).toBe(true);

    const stale = { ...session, createdAt: nowSeconds() - 8 * 24 * 3600 };
    expect(isSessionValid(stale)).toBe(false);
  });
});
