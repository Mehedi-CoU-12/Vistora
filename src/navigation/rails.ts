import type { CardVariant } from '../theme';
import type { Category, ContentItem } from '../types/content';
import type { CatalogTab, TabId } from './tabs';
































export interface Rail {
  
  id: string;
  title: string;
  items: ContentItem[];
  cardVariant: CardVariant;
  




  seeAll?: TabId;
}


export interface RailSource {
  items: readonly ContentItem[];
  categories: readonly Category[];
  cardVariant: CardVariant;
  
  fallbackTitle: string;
  
  idPrefix: string;
  seeAll?: TabId;
}











const MIN_RAIL_ITEMS = 3;







const MIN_RAILS_TO_SPLIT = 2;


const MAX_RAIL_ITEMS = 20;








export function buildRails(source: RailSource): Rail[] {
  const { items, categories, cardVariant, idPrefix, seeAll } = source;

  if (items.length === 0) {
    return [];
  }

  
  
  
  const byCategory = new Map<string, ContentItem[]>();
  for (const item of items) {
    if (item.categoryId === null) {
      continue;
    }
    const bucket = byCategory.get(item.categoryId);
    if (bucket) {
      bucket.push(item);
    } else {
      byCategory.set(item.categoryId, [item]);
    }
  }

  const rails: Rail[] = [];
  for (const category of categories) {
    const bucket = byCategory.get(category.id);
    if (!bucket || bucket.length < MIN_RAIL_ITEMS) {
      continue;
    }
    rails.push({
      id: `${idPrefix}:${category.id}`,
      title: category.name,
      items: bucket.slice(0, MAX_RAIL_ITEMS),
      cardVariant,
    });
  }

  if (rails.length < MIN_RAILS_TO_SPLIT) {
    return [
      {
        id: `${idPrefix}:all`,
        title: source.fallbackTitle,
        items: items.slice(0, MAX_RAIL_ITEMS),
        cardVariant,
        seeAll,
      },
    ];
  }

  return rails;
}





























export function homeRails(
  tab: CatalogTab,
  items: readonly ContentItem[],
  categories: readonly Category[],
  limit: number,
): Rail[] {
  const rails = buildRails({
    items,
    categories,
    cardVariant: tab.catalog.cardVariant,
    fallbackTitle: tab.title,
    idPrefix: tab.id,
    seeAll: tab.id,
  });

  return (
    rails
      .map((rail, order) => ({ rail, order }))
      
      
      
      .sort(
        (a, b) =>
          b.rail.items.length - a.rail.items.length || a.order - b.order,
      )
      .slice(0, limit)
      .sort((a, b) => a.order - b.order)
      .map(({ rail }) => ({ ...rail, seeAll: tab.id }))
  );
}













export function interleave(groups: readonly Rail[][]): Rail[] {
  const longest = groups.reduce((max, group) => Math.max(max, group.length), 0);
  const merged: Rail[] = [];

  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const rail = group[index];
      if (rail) {
        merged.push(rail);
      }
    }
  }

  return merged;
}


















export function pickFeatured(
  items: readonly ContentItem[],
  seed: number,
): ContentItem | null {
  if (items.length === 0) {
    return null;
  }

  let best: ContentItem[] = [];
  let bestScore = -1;

  for (const item of items) {
    const score = featureScore(item);
    if (score > bestScore) {
      bestScore = score;
      best = [item];
    } else if (score === bestScore) {
      best.push(item);
    }
  }

  
  
  const index = Math.abs(Math.floor(seed)) % best.length;
  return best[index];
}









function featureScore(item: ContentItem): number {
  return (
    (item.backdropUrl ? 4 : 0) +
    (item.description ? 2 : 0) +
    (item.imageUrl ? 1 : 0)
  );
}










export function withGenre(
  items: readonly ContentItem[],
  categories: readonly Category[],
): ContentItem[] {
  const names = new Map(
    categories.map(category => [category.id, category.name]),
  );

  return items.map(item => {
    const genre =
      item.categoryId === null ? undefined : names.get(item.categoryId);

    
    
    
    if (genre === undefined) {
      return item;
    }

    return { ...item, meta: { ...item.meta, genre } };
  });
}
