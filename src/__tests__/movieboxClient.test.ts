import {
  createMovieBoxClient,
  HOST_POOL,
  MovieBoxError,
} from '../services/sources/moviebox/client';

interface StubResponse {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
  throws?: boolean;
}

const identity = {
  userAgent: 'TestAgent/1.0',
  clientInfo: '{"package_name":"com.community.oneroom"}',
  spoofedIp: '103.241.1.1',
};

let calls: Array<{
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}>;
let queue: StubResponse[];

function respond(stub: StubResponse): Response {
  const status = stub.status ?? 200;
  const headers = stub.headers ?? {};

  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    text: async () => stub.text ?? JSON.stringify(stub.body ?? {}),
  } as unknown as Response;
}

beforeEach(() => {
  calls = [];
  queue = [];

  globalThis.fetch = jest.fn(async (url: unknown, init: unknown) => {
    const request = init as {
      method: string;
      headers: Record<string, string>;
      body?: string;
    };
    calls.push({
      url: String(url),
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const stub = queue.shift() ?? { status: 500 };
    if (stub.throws === true) {
      throw new Error('network down');
    }
    return respond(stub);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const loginOk = { body: { token: 'visitor-jwt' } };

describe('HOST_POOL', () => {
  it('lists the interchangeable api hosts', () => {
    expect(HOST_POOL).toContain('https://api6.aoneroom.com');
    expect(HOST_POOL).toContain('https://api.inmoviebox.com');
    expect(HOST_POOL).toHaveLength(7);
  });
});

describe('createMovieBoxClient', () => {
  it('logs in as a visitor before the first request, then reuses the token', async () => {
    queue = [
      loginOk,
      { body: { data: { streams: [] } } },
      { body: { data: { ok: true } } },
    ];

    const client = createMovieBoxClient(identity);
    await client.get('/wefeed-mobile-bff/subject-api/play-info/v2?subjectId=1');
    await client.get('/wefeed-mobile-bff/subject-api/get?subjectId=1');

    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain('/wefeed-mobile-bff/user-api/visitor-login');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toBe('{}');
    expect(calls[0].headers.Authorization).toBeUndefined();

    // Both later calls ride the same session.
    expect(calls[1].headers.Authorization).toBe('Bearer visitor-jwt');
    expect(calls[2].headers.Authorization).toBe('Bearer visitor-jwt');
  });

  it('signs every request', async () => {
    queue = [loginOk, { body: { data: {} } }];

    const client = createMovieBoxClient(identity);
    await client.get('/path?b=2&a=1');

    for (const call of calls) {
      expect(call.headers['x-tr-signature']).toMatch(/^\d+\|2\|.+/);
      expect(call.headers['x-client-token']).toMatch(/^\d+,[0-9a-f]{32}$/);
      expect(call.headers['x-client-info']).toBe(identity.clientInfo);
      expect(call.headers['x-client-status']).toBe('0');
      expect(call.headers['x-forwarded-for']).toBe(identity.spoofedIp);
      expect(call.headers['User-Agent']).toBe(identity.userAgent);
    }
  });

  it('unwraps the data envelope', async () => {
    queue = [loginOk, { body: { code: 0, data: { streams: [{ url: 'x' }] } } }];

    const client = createMovieBoxClient(identity);
    const result = await client.get('/play-info');

    expect(result).toEqual({ streams: [{ url: 'x' }] });
  });

  it('moves to the next host on a retryable status', async () => {
    queue = [
      loginOk,
      { status: 503 },
      { status: 429 },
      { body: { data: { ok: true } } },
    ];

    const client = createMovieBoxClient(identity);
    const result = await client.get('/play-info');

    expect(result).toEqual({ ok: true });

    const hosts = calls.slice(1).map(call => new URL(call.url).origin);
    expect(new Set(hosts).size).toBe(3);
  });

  it('moves to the next host when the transport fails', async () => {
    queue = [loginOk, { throws: true }, { body: { data: { ok: true } } }];

    const client = createMovieBoxClient(identity);
    await expect(client.get('/play-info')).resolves.toEqual({ ok: true });
  });

  it('moves on from a body that is not json', async () => {
    queue = [
      loginOk,
      { status: 200, text: '<html>blocked</html>' },
      { body: { data: { ok: true } } },
    ];

    const client = createMovieBoxClient(identity);
    const result = await client.get('/play-info');

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
  });

  it('re-authenticates once when the whole pool rejects the session', async () => {
    queue = [
      loginOk,
      ...Array(7).fill({ status: 401 }),
      { body: { token: 'fresh-jwt' } },
      { body: { data: { ok: true } } },
    ];

    const client = createMovieBoxClient(identity);
    const result = await client.get('/play-info');

    expect(result).toEqual({ ok: true });

    const logins = calls.filter(call => call.url.includes('visitor-login'));
    expect(logins).toHaveLength(2);
    expect(calls[calls.length - 1].headers.Authorization).toBe(
      'Bearer fresh-jwt',
    );
  });

  it('gives up with hostsExhausted when no host answers twice over', async () => {
    queue = [
      loginOk,
      ...Array(7).fill({ status: 500 }),
      loginOk,
      ...Array(7).fill({ status: 500 }),
    ];

    const client = createMovieBoxClient(identity);

    await expect(client.get('/play-info')).rejects.toThrow(MovieBoxError);
    await expect(client.get('/play-info')).rejects.toMatchObject({
      kind: 'hostsExhausted',
    });
  });

  it('fails with missingToken when login returns no token', async () => {
    queue = [{ body: { data: {} } }];

    const client = createMovieBoxClient(identity);
    await expect(client.get('/play-info')).rejects.toMatchObject({
      kind: 'missingToken',
    });
  });

  it('shares one login between concurrent callers', async () => {
    queue = [
      loginOk,
      { body: { data: { n: 1 } } },
      { body: { data: { n: 2 } } },
      { body: { data: { n: 3 } } },
    ];

    const client = createMovieBoxClient(identity);
    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);

    const logins = calls.filter(call => call.url.includes('visitor-login'));
    expect(logins).toHaveLength(1);
  });

  it('adopts a rotated token handed back in the x-user header', async () => {
    queue = [
      loginOk,
      {
        body: { data: { ok: true } },
        headers: { 'x-user': JSON.stringify({ token: 'rotated-jwt', uid: 7 }) },
      },
      { body: { data: { ok: true } } },
    ];

    const client = createMovieBoxClient(identity);
    await client.get('/first');
    await client.get('/second');

    expect(calls[2].headers.Authorization).toBe('Bearer rotated-jwt');
  });

  it('ignores a malformed x-user header', async () => {
    queue = [
      loginOk,
      { body: { data: { ok: true } }, headers: { 'x-user': 'not json' } },
      { body: { data: { ok: true } } },
    ];

    const client = createMovieBoxClient(identity);
    await client.get('/first');
    await client.get('/second');

    expect(calls[2].headers.Authorization).toBe('Bearer visitor-jwt');
  });

  it('serializes a post body and signs it', async () => {
    queue = [loginOk, { body: { data: { results: [] } } }];

    const client = createMovieBoxClient(identity);
    await client.post('/search', { keyword: 'Dune', page: 1 });

    const search = calls[1];
    expect(search.method).toBe('POST');
    expect(search.body).toBe('{"keyword":"Dune","page":1}');
    expect(search.headers['x-tr-signature']).toMatch(/^\d+\|2\|.+/);
  });

  it('starts a new session after invalidateSession', async () => {
    queue = [
      loginOk,
      { body: { data: {} } },
      { body: { token: 'second-jwt' } },
      { body: { data: {} } },
    ];

    const client = createMovieBoxClient(identity);
    await client.get('/a');
    client.invalidateSession();
    await client.get('/b');

    expect(
      calls.filter(call => call.url.includes('visitor-login')),
    ).toHaveLength(2);
    expect(calls[3].headers.Authorization).toBe('Bearer second-jwt');
  });
});
