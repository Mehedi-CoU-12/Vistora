/* eslint-disable no-bitwise -- MD5, HMAC and base64 are defined in terms of bit operations. */
const SECRET_BYTES = new Uint8Array([
  0xef, 0xa8, 0x91, 0x97, 0x4e, 0xec, 0xd3, 0x14, 0x8d, 0xf6, 0x3a, 0xa6, 0x11,
  0x60, 0x2d, 0xef, 0xd1, 0x01, 0x25, 0x9b, 0xa5, 0x21, 0x02, 0x2c, 0x57, 0xae,
  0x05, 0x66, 0xbd, 0x8e,
]);

const SIGNATURE_BODY_MAX_BYTES = 102_400;

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// ---------------------------------------------------------------------------
// Text and base64
// ---------------------------------------------------------------------------

export function utf8Bytes(input: string): Uint8Array {
  const out: number[] = [];

  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);

    if (code < 0x80) {
      out.push(code);
      continue;
    }

    if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      continue;
    }

    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
        continue;
      }
    }

    out.push(
      0xe0 | (code >> 12),
      0x80 | ((code >> 6) & 0x3f),
      0x80 | (code & 0x3f),
    );
  }

  return new Uint8Array(out);
}

export function utf8String(bytes: Uint8Array): string {
  let out = '';
  let i = 0;

  while (i < bytes.length) {
    const b0 = bytes[i++];

    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if (b0 < 0xe0) {
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b0 < 0xf0) {
      const b1 = bytes[i++] & 0x3f;
      const b2 = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | (b1 << 6) | b2);
    } else {
      const b1 = bytes[i++] & 0x3f;
      const b2 = bytes[i++] & 0x3f;
      const b3 = bytes[i++] & 0x3f;
      const offset =
        (((b0 & 0x07) << 18) | (b1 << 12) | (b2 << 6) | b3) - 0x10000;
      out += String.fromCharCode(
        0xd800 + (offset >> 10),
        0xdc00 + (offset & 0x3ff),
      );
    }
  }

  return out;
}

export function base64Encode(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const b0 = bytes[i];
    const b1 = remaining > 1 ? bytes[i + 1] : 0;
    const b2 = remaining > 2 ? bytes[i + 2] : 0;

    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += remaining > 1 ? B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += remaining > 2 ? B64_ALPHABET[b2 & 0x3f] : '=';
  }

  return out;
}

/**
 * Decodes standard base64, tolerating missing padding and embedded whitespace.
 * Callers holding a non-standard alphabet (JWT's URL-safe form, CloudFront's
 * policy encoding) normalize to the standard alphabet first, because those two
 * disagree about what `_` means.
 */
export function base64Decode(input: string): Uint8Array | null {
  const body = input.replace(/[\s\r\n]/g, '').replace(/[=]+$/, '');

  if (body.length % 4 === 1) {
    return null;
  }

  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let outIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < body.length; i++) {
    const value = B64_ALPHABET.indexOf(body[i]);
    if (value === -1) {
      return null;
    }

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      out[outIndex++] = (buffer >> bits) & 0xff;
    }
  }

  return out.subarray(0, outIndex);
}

// ---------------------------------------------------------------------------
// MD5 and HMAC-MD5
// ---------------------------------------------------------------------------

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];

const MD5_SINES = (() => {
  const table = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    table[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  }
  return table;
})();

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

export function md5(input: Uint8Array): Uint8Array {
  const bitLength = input.length * 8;
  const padded = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  padded.set(input);
  padded[input.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const block = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      block[i] = view.getUint32(offset + i * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const rotated = (f + a + MD5_SINES[i] + block[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(rotated, MD5_SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, a0, true);
  digestView.setUint32(4, b0, true);
  digestView.setUint32(8, c0, true);
  digestView.setUint32(12, d0, true);
  return digest;
}

export function md5Hex(input: Uint8Array): string {
  let hex = '';
  const digest = md5(input);
  for (let i = 0; i < digest.length; i++) {
    hex += digest[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function hmacMd5(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  const normalizedKey = key.length > blockSize ? md5(key) : key;

  const innerKey = new Uint8Array(blockSize);
  const outerKey = new Uint8Array(blockSize);
  innerKey.set(normalizedKey);
  outerKey.set(normalizedKey);

  for (let i = 0; i < blockSize; i++) {
    innerKey[i] ^= 0x36;
    outerKey[i] ^= 0x5c;
  }

  const innerInput = new Uint8Array(blockSize + message.length);
  innerInput.set(innerKey);
  innerInput.set(message, blockSize);
  const innerDigest = md5(innerInput);

  const outerInput = new Uint8Array(blockSize + innerDigest.length);
  outerInput.set(outerKey);
  outerInput.set(innerDigest, blockSize);
  return md5(outerInput);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Percent-decoding as the API's own client does it: form encoding, so `+` is a
 * space. Matches `Url::query_pairs()` on the Rust side, which the canonical
 * string is built from -- signing the raw encoded text instead would produce a
 * signature the server disagrees with.
 */
function percentDecode(input: string): string {
  const spaced = input.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

function urlPath(url: string): string | null {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd === -1) {
    return null;
  }

  const pathStart = url.indexOf('/', schemeEnd + 3);
  if (pathStart === -1) {
    return '/';
  }

  const rest = url.slice(pathStart);
  let end = rest.length;
  const query = rest.indexOf('?');
  const fragment = rest.indexOf('#');
  if (query !== -1) {
    end = Math.min(end, query);
  }
  if (fragment !== -1) {
    end = Math.min(end, fragment);
  }
  return rest.slice(0, end);
}

/**
 * Query parameters sorted by key, values kept in their original order within a
 * key -- the shape of the `BTreeMap<String, Vec<String>>` the Rust client
 * builds. The server signs the same ordering, so this is not cosmetic.
 */
export function sortedQueryString(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) {
    return '';
  }

  let query = url.slice(queryStart + 1);
  const fragment = query.indexOf('#');
  if (fragment !== -1) {
    query = query.slice(0, fragment);
  }
  if (query === '') {
    return '';
  }

  const pairs: Array<{ key: string; value: string; index: number }> = [];

  for (const part of query.split('&')) {
    if (part === '') {
      continue;
    }
    const equals = part.indexOf('=');
    const key = equals === -1 ? part : part.slice(0, equals);
    const value = equals === -1 ? '' : part.slice(equals + 1);
    pairs.push({
      key: percentDecode(key),
      value: percentDecode(value),
      index: pairs.length,
    });
  }

  if (pairs.length === 0) {
    return '';
  }

  pairs.sort((a, b) => {
    if (a.key < b.key) {
      return -1;
    }
    if (a.key > b.key) {
      return 1;
    }
    return a.index - b.index;
  });

  return pairs.map(pair => `${pair.key}=${pair.value}`).join('&');
}

export function buildCanonicalString(
  method: string,
  accept: string | null,
  contentType: string | null,
  url: string,
  body: string | null,
  timestampMs: number,
): string {
  const path = urlPath(url);
  let canonicalUrl: string;

  if (path === null) {
    canonicalUrl = url;
  } else {
    const query = sortedQueryString(url);
    canonicalUrl = query === '' ? path : `${path}?${query}`;
  }

  let bodyLength = '';
  let bodyHash = '';

  if (body !== null) {
    const bytes = utf8Bytes(body);
    bodyLength = String(bytes.length);
    bodyHash = md5Hex(
      bytes.length > SIGNATURE_BODY_MAX_BYTES
        ? bytes.subarray(0, SIGNATURE_BODY_MAX_BYTES)
        : bytes,
    );
  }

  return [
    method.toUpperCase(),
    accept ?? '',
    contentType ?? '',
    bodyLength,
    String(timestampMs),
    bodyHash,
    canonicalUrl,
  ].join('\n');
}

export function generateClientToken(timestampMs: number): string {
  const timestamp = String(timestampMs);
  const reversed = timestamp.split('').reverse().join('');
  return `${timestamp},${md5Hex(utf8Bytes(reversed))}`;
}

export function generateSignature(
  method: string,
  accept: string | null,
  contentType: string | null,
  url: string,
  body: string | null,
  timestampMs: number,
): string {
  const canonical = buildCanonicalString(
    method,
    accept,
    contentType,
    url,
    body,
    timestampMs,
  );
  const digest = hmacMd5(SECRET_BYTES, utf8Bytes(canonical));
  return `${timestampMs}|2|${base64Encode(digest)}`;
}

export interface ClientIdentity {
  userAgent: string;
  clientInfo: string;
  spoofedIp: string;
}

export function buildSignedHeaders(
  method: string,
  url: string,
  body: string | null,
  authToken: string | null,
  identity: ClientIdentity,
  timestampMs: number = Date.now(),
): Record<string, string> {
  const accept = 'application/json';
  const contentType = 'application/json';

  const headers: Record<string, string> = {
    'User-Agent': identity.userAgent,
    Accept: accept,
    'Content-Type': contentType,
    'x-client-token': generateClientToken(timestampMs),
    'x-tr-signature': generateSignature(
      method,
      accept,
      contentType,
      url,
      body,
      timestampMs,
    ),
    'x-client-info': identity.clientInfo,
    'x-client-status': '0',
    'x-forwarded-for': identity.spoofedIp,
  };

  if (authToken !== null && authToken !== '') {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Client identity
// ---------------------------------------------------------------------------

const ANDROID_BUILDS: Array<[string, string]> = [
  ['9', 'PQ3A.190605.03081104'],
  ['10', 'QP1A.191005.007.A3'],
  ['11', 'RP1A.200720.011'],
  ['12', 'S1B.220414.015'],
  ['13', 'TQ2A.230405.003'],
];

const DEVICES: Array<[string, string]> = [
  ['23078RKD5C', 'Redmi'],
  ['2201117TY', 'Redmi'],
  ['2201117TG', 'Redmi'],
  ['22101316G', 'Redmi'],
  ['21121210G', 'Redmi'],
  ['M2012K11AG', 'Redmi'],
  ['M2007J20CG', 'Redmi'],
];

const VERSION_CODES = [50020117, 50020118, 50020119, 50020120, 50020121];
const NETWORK_TYPES = ['NETWORK_WIFI', 'NETWORK_MOBILE'];
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'America/New_York',
  'Europe/London',
];

const IP_PREFIXES = [
  '103.241',
  '49.36',
  '117.195',
  '106.198',
  '122.162',
  '157.32',
  '182.70',
  '103.58',
  '27.60',
  '59.90',
];

function pick<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function randomHex(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

function randomUuid(): string {
  return [
    randomHex(8),
    randomHex(4),
    randomHex(4),
    randomHex(4),
    randomHex(12),
  ].join('-');
}

export function randomSpoofedIp(): string {
  const prefix = pick(IP_PREFIXES);
  const third = 1 + Math.floor(Math.random() * 253);
  const fourth = 1 + Math.floor(Math.random() * 253);
  return `${prefix}.${third}.${fourth}`;
}

/**
 * A plausible MovieBox Android client, randomized per app launch.
 *
 * The API keys its rate limiting off this identity, so a fixed one would have
 * every Vistora install share a bucket.
 */
export function createIdentity(): ClientIdentity {
  const [androidVersion, build] = pick(ANDROID_BUILDS);
  const [model, brand] = pick(DEVICES);
  const versionCode = pick(VERSION_CODES);

  const userAgent =
    `com.community.oneroom/${versionCode} (Linux; U; Android ${androidVersion}; ` +
    `en_US; ${model}; Build/${build}; Cronet/135.0.7012.3)`;

  const clientInfo = JSON.stringify({
    package_name: 'com.community.oneroom',
    version_name: '4.0.01.0813.03',
    version_code: versionCode,
    os: 'android',
    os_version: androidVersion,
    install_ch: 'ps',
    device_id: randomHex(32),
    install_store: 'ps',
    gaid: randomUuid(),
    brand,
    model,
    system_language: 'en',
    net: pick(NETWORK_TYPES),
    region: 'US',
    timezone: pick(TIMEZONES),
    sp_code: '40401',
    'X-Play-Mode': '2',
  });

  return { userAgent, clientInfo, spoofedIp: randomSpoofedIp() };
}
