import type { PlayableProtocol } from '../../../types/content';
import type { StreamCandidate } from '../../streamResolver';
import { base64Decode, utf8String } from './crypto';

export const STREAM_REFERER = 'https://sportslive.wine';

const DEFAULT_RESOLUTIONS = '1080,720,480';

export interface MovieBoxSubject {
  subjectId: string;
  title: string;

  subjectType: number;
  releaseYear: number | null;
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(source: Json | null, ...keys: string[]): string | null {
  if (source === null) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function readNumber(source: Json | null, ...keys: string[]): number | null {
  if (source === null) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

const LANGUAGE_TAGS = [
  'hindi',
  'tamil',
  'telugu',
  'kannada',
  'malayalam',
  'bengali',
  'marathi',
  'punjabi',
  'gujarati',
  'urdu',
  'english',
  'spanish',
  'french',
  'german',
  'italian',
  'japanese',
  'korean',
  'chinese',
  'russian',
  'portuguese',
  'turkish',
  'arabic',
  'dub',
  'audio',
  'multi',
  'season',
];

function isYear(text: string): boolean {
  if (!/^\d{4}$/.test(text)) {
    return false;
  }
  const year = Number.parseInt(text, 10);
  return year >= 1900 && year <= 2099;
}

export function cleanTitle(rawTitle: string): string {
  let title = rawTitle.trim();
  if (title === '') {
    return '';
  }

  while (title.startsWith('[')) {
    const close = title.indexOf(']');
    if (close === -1) {
      break;
    }
    const remainder = title.slice(close + 1).trim();
    if (remainder === '') {
      break;
    }
    title = remainder;
  }

  const bracket = title.indexOf('[');
  if (bracket > 0) {
    title = title.slice(0, bracket).trim();
  }

  const paren = title.indexOf('(');
  if (paren > 0) {
    const inside = title
      .slice(paren + 1)
      .split(')')[0]
      .trim();
    if (!isYear(inside)) {
      title = title.slice(0, paren).trim();
    }
  }

  const dash = title.lastIndexOf(' - ');
  if (dash !== -1) {
    const suffix = title.slice(dash + 3).toLowerCase();
    const isTag =
      LANGUAGE_TAGS.some(tag => suffix.includes(tag)) ||
      /^s[\d-]*$/.test(suffix);
    if (isTag) {
      title = title.slice(0, dash).trim();
    }
  }

  const seasonMarker = title.lastIndexOf(' S');
  if (seasonMarker !== -1) {
    const suffix = title.slice(seasonMarker + 2);
    if (/^\d[\dS-]*$/.test(suffix)) {
      title = title.slice(0, seasonMarker).trim();
    }
  }

  const seasonWord = title.toLowerCase().lastIndexOf(' season ');
  if (seasonWord !== -1) {
    title = title.slice(0, seasonWord).trim();
  }

  for (const separator of ['_', ' ', '.', '-']) {
    const position = title.lastIndexOf(separator);
    if (position === -1) {
      continue;
    }
    const suffix = title.slice(position + 1);
    const match = /^(\d+)[pP]$/.exec(suffix);
    if (match !== null) {
      const resolution = Number.parseInt(match[1], 10);
      if (resolution >= 144 && resolution <= 8640) {
        title = title.slice(0, position).trim();
      }
    }
  }

  const cleaned = title.replace(/[-:_. ]+$/, '').trim();
  return cleaned === '' ? rawTitle.trim() : cleaned;
}

export function matchKey(title: string): string {
  return cleanTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NOTICE_MARKERS = [
  '1c7de0bd3393702d9191801f15f88f8d',
  '9a0461bc39da389663bf3dbb17091d3f',
  '/notice.mp4',
  'notice',
];

export function isDeprecationNoticeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    NOTICE_MARKERS.some(marker => lower.includes(marker)) ||
    (lower.includes('macdn.aoneroom.com') && lower.includes('/other/'))
  );
}

export function resolveDashManifestFromPolicy(
  signCookie: string,
): string | null {
  for (const part of signCookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith('CloudFront-Policy=')) {
      continue;
    }

    const normalized = trimmed
      .slice('CloudFront-Policy='.length)
      .trim()
      .replace(/-/g, '+')
      .replace(/_/g, '=')
      .replace(/~/g, '/');

    const decoded = base64Decode(normalized);
    if (decoded === null) {
      continue;
    }

    let resource: string | null;
    try {
      const policy = asObject(JSON.parse(utf8String(decoded)));
      const statement = asObject(asArray(policy?.Statement)[0]);
      resource = readString(statement, 'Resource');
    } catch {
      continue;
    }

    if (resource === null) {
      continue;
    }

    const base = resource.replace(/\*+$/, '').replace(/\/+$/, '');
    if (base.startsWith('http://') || base.startsWith('https://')) {
      return `${base}/index.mpd`;
    }
  }

  return null;
}

function protocolFor(url: string, isDash: boolean): PlayableProtocol {
  if (isDash || url.endsWith('.mpd')) {
    return 'dash';
  }
  if (url.includes('.m3u8')) {
    return 'hls';
  }
  return 'mp4';
}

function cleanCookie(signCookie: string): string {
  return signCookie
    .split(';')
    .map(part => part.trim())
    .filter(part => part !== '')
    .join('; ');
}

function parseResolutions(raw: string): number[] {
  return raw
    .split(',')
    .map(part => Number.parseInt(part.trim(), 10))
    .filter(value => !Number.isNaN(value));
}

export function playInfoToCandidates(
  payload: unknown,
  userAgent: string,
): StreamCandidate[] {
  const data = asObject(payload);
  const streams = asArray(data?.streams);
  const fallbackResolutions = readString(data, 'displayResolutions');

  const candidates: StreamCandidate[] = [];

  for (const entry of streams) {
    const stream = asObject(entry);
    if (stream === null) {
      continue;
    }

    const signCookie = readString(stream, 'signCookie') ?? '';
    const rawUrl = readString(stream, 'url') ?? '';

    const playableUrl =
      resolveDashManifestFromPolicy(signCookie) ??
      (rawUrl.startsWith('http') && !isDeprecationNoticeUrl(rawUrl)
        ? rawUrl
        : null);

    if (playableUrl === null) {
      continue;
    }

    const format = readString(stream, 'format') ?? 'MP4';
    const codec = readString(stream, 'codecName', 'codec');
    const resolutionsRaw =
      readString(stream, 'resolutions') ??
      fallbackResolutions ??
      DEFAULT_RESOLUTIONS;

    const resolutions = parseResolutions(resolutionsRaw);
    const isDash =
      playableUrl.endsWith('.mpd') || format.toUpperCase() === 'DASH';
    const isMultiRes = isDash || resolutions.length > 1;
    const maxResolution =
      resolutions.length > 0 ? Math.max(...resolutions) : 1080;

    const headers: Record<string, string> = {
      Referer: STREAM_REFERER,
      'User-Agent': userAgent,
    };

    if (signCookie !== '') {
      headers.Cookie = cleanCookie(signCookie);
    }

    const resolutionLabel = isMultiRes ? 'Multi-Res' : `${maxResolution}p`;

    candidates.push({
      stream: {
        url: playableUrl,
        protocol: protocolFor(playableUrl, isDash),
        headers,
        isLive: false,
      },
      label: `${resolutionLabel} ${codec ?? format}`.trim(),
      quality: isMultiRes ? 'multi' : `${maxResolution}p`,
    });
  }

  return candidates;
}

export function searchToSubjects(payload: unknown): MovieBoxSubject[] {
  const data = asObject(payload);

  const grouped = asArray(asObject(asArray(data?.results)[0])?.subjects);
  const entries = grouped.length > 0 ? grouped : asArray(data?.list);

  const subjects: MovieBoxSubject[] = [];

  for (const entry of entries) {
    const subject = asObject(entry);
    const subjectId = readString(subject, 'subjectId', 'id');
    const title = readString(subject, 'title', 'name');

    if (subjectId === null || title === null) {
      continue;
    }

    const releaseDate = readString(subject, 'releaseDate', 'releaseTime');
    const yearFromDate =
      releaseDate === null
        ? null
        : Number.parseInt(releaseDate.slice(0, 4), 10);

    subjects.push({
      subjectId,
      title,
      subjectType: readNumber(subject, 'subjectType', 'stype') ?? 1,
      releaseYear:
        readNumber(subject, 'year') ??
        (yearFromDate !== null && !Number.isNaN(yearFromDate)
          ? yearFromDate
          : null),
    });
  }

  return subjects;
}
