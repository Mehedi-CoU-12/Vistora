import type { Category, ContentItem } from '../types/content';
import type { CategoryKind } from '../types/database';

/**
 * Marks a category that was derived from item metadata rather than loaded from
 * the `categories` table. `matchesCategory` keys off this prefix, so derived
 * and stored categories can share one picker with no mode flag.
 */
export const GENRE_PREFIX = 'genre:';

/** Genres below this many items are folded away rather than shown as a chip. */
const MIN_GENRE_ITEMS = 3;

const SEPARATOR = /[,/|&]|\s+and\s+/i;

export function genreId(name: string): string {
  return `${GENRE_PREFIX}${name.trim().toLowerCase()}`;
}

/**
 * MovieBox reports genres as one loose string — "Action, Drama" or
 * "Comedy / Romance" — so split it into the individual names.
 */
export function itemGenres(item: ContentItem): string[] {
  const raw = item.meta?.genre;

  if (raw === undefined || raw.trim() === '') {
    return [];
  }

  const names: string[] = [];

  for (const part of raw.split(SEPARATOR)) {
    const name = part.trim();
    if (
      name !== '' &&
      !names.some(seen => seen.toLowerCase() === name.toLowerCase())
    ) {
      names.push(name);
    }
  }

  return names;
}

export function matchesCategory(
  item: ContentItem,
  categoryId: string,
): boolean {
  if (!categoryId.startsWith(GENRE_PREFIX)) {
    return item.categoryId === categoryId;
  }

  return itemGenres(item).some(name => genreId(name) === categoryId);
}

export function filterByCategory(
  items: readonly ContentItem[],
  categoryId: string | null,
): ContentItem[] {
  if (categoryId === null) {
    return [...items];
  }

  return items.filter(item => matchesCategory(item, categoryId));
}

/**
 * Builds picker chips out of the genres the loaded items actually carry.
 * Ordered by how many items each covers, so the useful chips come first.
 */
export function deriveGenres(
  items: readonly ContentItem[],
  kind: CategoryKind,
  minItems: number = MIN_GENRE_ITEMS,
): Category[] {
  const counts = new Map<string, { name: string; count: number }>();

  for (const item of items) {
    for (const name of itemGenres(item)) {
      const id = genreId(name);
      const entry = counts.get(id);

      if (entry) {
        entry.count += 1;
      } else {
        counts.set(id, { name, count: 1 });
      }
    }
  }

  return [...counts.entries()]
    .filter(([, entry]) => entry.count >= minItems)
    .sort(([, a], [, b]) => b.count - a.count || a.name.localeCompare(b.name))
    .map(([id, entry]) => ({
      id,
      slug: id.slice(GENRE_PREFIX.length).replace(/\s+/g, '-'),
      name: entry.name,
      kind,
    }));
}
