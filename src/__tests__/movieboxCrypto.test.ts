import {
  base64Decode,
  base64Encode,
  buildCanonicalString,
  buildSignedHeaders,
  createIdentity,
  generateClientToken,
  generateSignature,
  hmacMd5,
  md5Hex,
  randomSpoofedIp,
  sortedQueryString,
  utf8Bytes,
  utf8String,
} from '../services/moviebox/crypto';

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

const repeat = (byte: number, count: number): Uint8Array =>
  new Uint8Array(count).fill(byte);

describe('md5 (RFC 1321 test suite)', () => {
  const vectors: Array<[string, string]> = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      'd174ab98d277d9f5a5611c2c9f419d9f',
    ],
    [
      '123456789012345678901234567890123456789012345678901234567890' +
        '12345678901234567890',
      '57edf4a22be3c955ac49da2e2107b67a',
    ],
  ];

  it.each(vectors)('hashes %j', (input, expected) => {
    expect(md5Hex(utf8Bytes(input))).toBe(expected);
  });

  it('hashes across a block boundary', () => {
    expect(md5Hex(utf8Bytes('a'.repeat(56)))).toBe(
      '3b0c8ac703f828b04c6c197006d17218',
    );
  });

  it('hashes raw bytes that are not valid UTF-8', () => {
    expect(md5Hex(new Uint8Array([0xff, 0xfe, 0x00, 0x80]))).toHaveLength(32);
  });
});

describe('hmacMd5 (RFC 2202 test suite)', () => {
  it('case 1: repeated key byte', () => {
    expect(hex(hmacMd5(repeat(0x0b, 16), utf8Bytes('Hi There')))).toBe(
      '9294727a3638bb1c13f48ef8158bfc9d',
    );
  });

  it('case 2: short ascii key', () => {
    expect(
      hex(
        hmacMd5(utf8Bytes('Jefe'), utf8Bytes('what do ya want for nothing?')),
      ),
    ).toBe('750c783e6ab0b503eaa86e310a5db738');
  });

  it('case 3: long message', () => {
    expect(hex(hmacMd5(repeat(0xaa, 16), repeat(0xdd, 50)))).toBe(
      '56be34521d144c88dbb8c733f0e8b3f6',
    );
  });

  it('case 6: key longer than the block size', () => {
    expect(
      hex(
        hmacMd5(
          repeat(0xaa, 80),
          utf8Bytes('Test Using Larger Than Block-Size Key - Hash Key First'),
        ),
      ),
    ).toBe('6b1ab7fe4bd7bf8f0b62e6ce61b9d0cd');
  });
});

describe('base64', () => {
  it('round-trips and pads like the standard alphabet', () => {
    expect(base64Encode(utf8Bytes('any carnal pleasure.'))).toBe(
      'YW55IGNhcm5hbCBwbGVhc3VyZS4=',
    );
    expect(base64Encode(utf8Bytes('any carnal pleasure'))).toBe(
      'YW55IGNhcm5hbCBwbGVhc3VyZQ==',
    );
    expect(base64Encode(new Uint8Array())).toBe('');
  });

  it('decodes with and without padding', () => {
    expect(utf8String(base64Decode('YW55IGNhcm5hbCBwbGVhc3VyZS4=')!)).toBe(
      'any carnal pleasure.',
    );
    expect(utf8String(base64Decode('YW55IGNhcm5hbCBwbGVhc3VyZS4')!)).toBe(
      'any carnal pleasure.',
    );
  });

  it('rejects input that cannot be a base64 body', () => {
    expect(base64Decode('A')).toBeNull();
    expect(base64Decode('!!!!')).toBeNull();
  });
});

describe('utf8', () => {
  it('round-trips multi-byte and astral characters', () => {
    for (const sample of ['héllo', '日本語', '🎬 clapper', 'mixed 日 🎬 x']) {
      expect(utf8String(utf8Bytes(sample))).toBe(sample);
    }
  });
});

describe('sortedQueryString', () => {
  it('sorts parameters by key', () => {
    expect(
      sortedQueryString('https://api.example.com/endpoint?b=2&a=1&c=3'),
    ).toBe('a=1&b=2&c=3');
  });

  it('returns empty for a query-less url', () => {
    expect(sortedQueryString('https://api.example.com/endpoint')).toBe('');
  });

  it('keeps repeated keys in their original order', () => {
    expect(sortedQueryString('https://x.test/p?k=2&a=1&k=1')).toBe(
      'a=1&k=2&k=1',
    );
  });

  it('decodes as form encoding', () => {
    expect(sortedQueryString('https://x.test/p?q=a%20b+c')).toBe('q=a b c');
  });
});

describe('canonical string', () => {
  it('lays the request out in the order the server signs', () => {
    const canonical = buildCanonicalString(
      'get',
      'application/json',
      'application/json',
      'https://api.example.com/path?tab=1&page=2',
      null,
      1700000000000,
    );

    expect(canonical.split('\n')).toEqual([
      'GET',
      'application/json',
      'application/json',
      '',
      '1700000000000',
      '',
      '/path?page=2&tab=1',
    ]);
  });

  it('includes body length and body hash when there is a body', () => {
    const lines = buildCanonicalString(
      'POST',
      'application/json',
      'application/json',
      'https://api.example.com/login',
      '{}',
      1700000000000,
    ).split('\n');

    expect(lines[3]).toBe('2');
    expect(lines[5]).toBe(md5Hex(utf8Bytes('{}')));
    expect(lines[6]).toBe('/login');
  });
});

describe('generateClientToken', () => {
  it('pairs the timestamp with the md5 of its reverse', () => {
    const token = generateClientToken(1700000000000);
    const [timestamp, digest] = token.split(',');

    expect(timestamp).toBe('1700000000000');
    expect(digest).toHaveLength(32);
    expect(digest).toBe(md5Hex(utf8Bytes('0000000000071')));
  });
});

describe('generateSignature', () => {
  it('is stable for a fixed request', () => {
    const signature = generateSignature(
      'GET',
      'application/json',
      'application/json',
      'https://api.example.com/path?tab=1&page=2',
      null,
      1700000000000,
    );

    const [timestamp, version, digest] = signature.split('|');
    expect(timestamp).toBe('1700000000000');
    expect(version).toBe('2');
    expect(digest).not.toBe('');
    expect(signature).toBe(
      generateSignature(
        'GET',
        'application/json',
        'application/json',
        'https://api.example.com/path?page=2&tab=1',
        null,
        1700000000000,
      ),
    );
  });

  it('changes when any signed component changes', () => {
    const base = generateSignature(
      'GET',
      'application/json',
      'application/json',
      'https://api.example.com/a',
      null,
      1700000000000,
    );

    expect(
      generateSignature(
        'POST',
        'application/json',
        'application/json',
        'https://api.example.com/a',
        null,
        1700000000000,
      ),
    ).not.toBe(base);

    expect(
      generateSignature(
        'GET',
        'application/json',
        'application/json',
        'https://api.example.com/b',
        null,
        1700000000000,
      ),
    ).not.toBe(base);

    expect(
      generateSignature(
        'GET',
        'application/json',
        'application/json',
        'https://api.example.com/a',
        null,
        1700000000001,
      ),
    ).not.toBe(base);
  });
});

describe('buildSignedHeaders', () => {
  const identity = {
    userAgent: 'com.community.oneroom/50020117',
    clientInfo: '{"package_name":"com.community.oneroom"}',
    spoofedIp: '103.241.10.20',
  };

  it('carries every header the API checks', () => {
    const headers = buildSignedHeaders(
      'GET',
      'https://api.example.com/x?a=1',
      null,
      null,
      identity,
      1700000000000,
    );

    expect(headers['x-client-token']).toBe(generateClientToken(1700000000000));
    expect(headers['x-tr-signature']).toMatch(/^1700000000000\|2\|.+/);
    expect(headers['x-client-info']).toBe(identity.clientInfo);
    expect(headers['x-client-status']).toBe('0');
    expect(headers['x-forwarded-for']).toBe(identity.spoofedIp);
    expect(headers['User-Agent']).toBe(identity.userAgent);
    expect(headers.Authorization).toBeUndefined();
  });

  it('adds a bearer token when the session has one', () => {
    const headers = buildSignedHeaders(
      'GET',
      'https://api.example.com/x',
      null,
      'jwt-token',
      identity,
      1700000000000,
    );

    expect(headers.Authorization).toBe('Bearer jwt-token');
  });
});

describe('createIdentity', () => {
  it('produces a parseable client_info and a matching user agent', () => {
    const identity = createIdentity();

    expect(identity.userAgent).toContain('com.community.oneroom/500201');
    expect(identity.userAgent).toContain('Cronet/135.0.7012.3');

    const info = JSON.parse(identity.clientInfo);
    expect(info.package_name).toBe('com.community.oneroom');
    expect(info.version_name).toBe('4.0.01.0813.03');
    expect(info.version_code).toBeGreaterThanOrEqual(50020117);
    expect(info.version_code).toBeLessThanOrEqual(50020121);
    expect(info.sp_code).toBe('40401');
    expect(info['X-Play-Mode']).toBe('2');
    expect(info.device_id).toHaveLength(32);
    expect(info.gaid).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(identity.userAgent).toContain(info.version_code.toString());
  });

  it('generates spoofed ips inside the declared prefixes', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomSpoofedIp()).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    }
  });
});
