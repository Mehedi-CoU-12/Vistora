import type { ContentItem, Stream } from '../types/content';
import { AppError, toAppError } from './errors';
import { createTtlCache } from './streamCache';
























































export interface StreamCandidate {
  stream: Stream;
  






  label: string;
  





  quality?: string;
}








export interface Playback {
  
  itemId: string;
  
  candidates: StreamCandidate[];
}

export interface StreamSource {
  
  id: string;
  








  canResolve: (item: ContentItem) => boolean;
  







  resolve: (item: ContentItem) => Promise<StreamCandidate[]>;
  






  ttlMs?: number;
}










export const DEFAULT_TTL_MS = 5 * 60 * 1000;









const sources: StreamSource[] = [];









export function registerSource(source: StreamSource): void {
  const existing = sources.findIndex(other => other.id === source.id);

  if (existing >= 0) {
    sources[existing] = source;
    return;
  }

  sources.push(source);
}


export function registeredSources(): readonly StreamSource[] {
  return sources;
}


export function resetSources(): void {
  sources.length = 0;
  cache.clear();
}

const cache = createTtlCache<Playback>();








function cacheKey(item: ContentItem): string {
  return `${item.kind}:${item.id}`;
}













export function canResolveAny(item: ContentItem): boolean {
  return sources.some(source => source.canResolve(item));
}









export function invalidateResolution(item: ContentItem): void {
  cache.delete(cacheKey(item));
}



































export async function resolveStream(item: ContentItem): Promise<Playback> {
  const key = cacheKey(item);

  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const applicable = sources.filter(source => source.canResolve(item));

  const settled = await Promise.allSettled(
    applicable.map(source => source.resolve(item)),
  );

  const produced: StreamCandidate[] = [];
  const contributing: StreamSource[] = [];

  settled.forEach((result, index) => {
    const source = applicable[index];

    if (result.status === 'rejected') {
      
      
      
      
      console.warn(
        `[streamResolver] source "${source.id}" failed for ${key}:`,
        toAppError(result.reason).message,
      );
      return;
    }

    if (result.value.length === 0) {
      return;
    }

    produced.push(...result.value);
    contributing.push(source);
  });

  const candidates = rankCandidates(dedupeByUrl(produced));

  if (candidates.length === 0) {
    throw new AppError(
      'notFound',
      'No playable source was found for this title.',
    );
  }

  const playback: Playback = { itemId: item.id, candidates };

  cache.set(key, playback, shortestTtl(contributing));

  return playback;
}










function shortestTtl(contributing: readonly StreamSource[]): number {
  const shortest = contributing.reduce(
    (best, source) => Math.min(best, source.ttlMs ?? DEFAULT_TTL_MS),
    Infinity,
  );

  
  
  
  
  return Number.isFinite(shortest) ? shortest : DEFAULT_TTL_MS;
}













function dedupeByUrl(
  candidates: readonly StreamCandidate[],
): StreamCandidate[] {
  const seen = new Set<string>();

  return candidates.filter(candidate => {
    if (seen.has(candidate.stream.url)) {
      return false;
    }
    seen.add(candidate.stream.url);
    return true;
  });
}















export function rankCandidates(
  candidates: readonly StreamCandidate[],
): StreamCandidate[] {
  return [...candidates].sort(
    (a, b) => qualityRank(b.quality) - qualityRank(a.quality),
  );
}









export function qualityRank(quality: string | undefined): number {
  if (quality === undefined) {
    return 0;
  }

  const text = quality.trim().toLowerCase();

  if (text === '4k' || text === 'uhd') {
    return 2160;
  }
  if (text === '2k' || text === 'qhd') {
    return 1440;
  }
  if (text === 'hd') {
    return 720;
  }
  if (text === 'sd') {
    return 480;
  }

  
  const digits = /^(\d{3,4})/.exec(text);

  return digits ? Number(digits[1]) : 0;
}
