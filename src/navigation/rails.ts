import type { CardVariant } from '../theme';
import type { Category, ContentItem } from '../types/content';
import type { CatalogTab, TabId } from './tabs';

/**
 * How a screen's horizontal sections are worked out from what is in the library.
 *
 * ---------------------------------------------------------------------------
 * Rails are derived, for the same reason the tab list is
 * ---------------------------------------------------------------------------
 * navigation/tabs.ts already refuses to let the home screen hard-code its rows,
 * because a hand-written list and the actual catalogue drift apart silently. The
 * same argument applies one level down: "Trending", "Popular", "In Cinemas",
 * "Kids & Cartoons" are not names this app should know. They are `categories`
 * rows, they are ordered by `sort_order` in the database, and an editor adding
 * "Documentaries" tomorrow should get a rail without anybody shipping a build.
 *
 * So nothing here names a genre. A rail is a category that has content in it.
 *
 * ---------------------------------------------------------------------------
 * Grouping happens in memory, not in SQL
 * ---------------------------------------------------------------------------
 * The obvious alternative is one query per category. That is ten round trips for
 * the Movies screen where there is currently one, and it scales with the number
 * of categories -- exactly the shape of thing that is fine with ten rows and
 * miserable with fifty.
 *
 * Every screen that wants rails is already loading the whole catalogue for its
 * kind (the grid needs it anyway, and `CatalogScreen` has always fetched it
 * unlimited), so the items are in hand. Grouping 119 of them by `categoryId` is
 * a single pass over an array. The database is asked once and asked the same
 * question it was asked before.
 */

/** One horizontal section on a screen. */
export interface Rail {
  /** Stable across reloads, so React keeps the row and its scroll position. */
  id: string;
  title: string;
  items: ContentItem[];
  cardVariant: CardVariant;
  /**
   * The tab "See all" jumps to, where one makes sense. Absent on a rail that
   * already IS the whole of something -- a genre rail on the Movies screen has
   * nowhere further to go.
   */
  seeAll?: TabId;
}

/** What `buildRails` needs to know about the kind it is splitting up. */
export interface RailSource {
  items: readonly ContentItem[];
  categories: readonly Category[];
  cardVariant: CardVariant;
  /** Heading for the fallback rail, when the kind will not split usefully. */
  fallbackTitle: string;
  /** Prefix for rail ids, so two kinds cannot collide on a category id. */
  idPrefix: string;
  seeAll?: TabId;
}

/**
 * A rail with fewer items than this is not shown as its own rail.
 *
 * Two reasons, and the second is the important one. A rail of one card looks
 * like a mistake next to a rail of twenty. And on a television a very short rail
 * is a focus hazard in the other direction from an empty one: the user presses
 * RIGHT expecting to travel and focus stops immediately, which reads as the
 * remote having missed the press. Items below the threshold are not discarded --
 * they fall through to the fallback rail, which is the whole kind.
 */
const MIN_RAIL_ITEMS = 3;

/**
 * Below this many rails, the split is not worth making: one rail called "Movies"
 * is better than two called "Action" and "Classics" when those are the only two
 * genres in the library, because the second form implies a catalogue that has
 * been organised and this one has not.
 */
const MIN_RAILS_TO_SPLIT = 2;

/** Cap per rail. A horizontal row nobody can reach the end of is not a feature. */
const MAX_RAIL_ITEMS = 20;

/**
 * Splits one kind into rails, one per category that has enough content.
 *
 * Falls back to a single rail of everything when the split would not be useful
 * -- which is the honest answer for a kind whose rows are all uncategorised, and
 * is what the Anime tab gets today.
 */
export function buildRails(source: RailSource): Rail[] {
  const { items, categories, cardVariant, idPrefix, seeAll } = source;

  if (items.length === 0) {
    return [];
  }

  // One pass. `categories` arrives already ordered by `sort_order` from
  // `fetchCategories`, so iterating it below preserves the editor's intended
  // order for free -- which is why this is a lookup rather than a sort.
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

/**
 * The rails a catalog tab contributes to the HOME screen, as opposed to its own.
 *
 * Home is a sampler, not a catalogue: every kind gets a couple of rails so the
 * first screen shows films AND channels AND cartoons, and the tab itself is
 * where you go to see all nine genres. `limit` is therefore applied to the
 * number of RAILS, not to the number of items -- cutting items would give you
 * nine rails of four cards each, which is the opposite of the intent.
 *
 * ---------------------------------------------------------------------------
 * Which two, and why not simply the first two
 * ---------------------------------------------------------------------------
 * `buildRails` returns categories in the editor's order, which is right on the
 * kind's own screen where all of them are shown. Taking the first two of those
 * for Home is not: the current library's first film category is "Action" with
 * four titles, which would sit on the home screen next to a twenty-card rail and
 * read as a row that failed to load. And it is arbitrary rather than editorial,
 * because `sort_order` ties are broken by whatever order the database returns.
 *
 * So Home takes the FULLEST rails -- the best available answer to "what is there
 * a lot of here" -- and then puts them back into the editor's order, so the two
 * it chose still read top to bottom the way the catalogue is organised. Choosing
 * by size and displaying by size would be a third, worse thing: it would sort
 * the home screen by inventory.
 *
 * Each rail keeps a `seeAll` pointing at its own tab, because on Home there is
 * always somewhere further to go.
 */
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
      // Descending by size, with the original position breaking ties -- so two
      // equally full categories still come out in the editor's order rather than
      // in whatever order the sort happened to be stable in.
      .sort(
        (a, b) =>
          b.rail.items.length - a.rail.items.length || a.order - b.order,
      )
      .slice(0, limit)
      .sort((a, b) => a.order - b.order)
      .map(({ rail }) => ({ ...rail, seeAll: tab.id }))
  );
}

/**
 * Interleaves each kind's rails so the first screenful mixes content types.
 *
 * Concatenating instead would put every film rail above every channel rail,
 * which makes Home a list of the tabs in order -- and on a television, where
 * about one and a half rails are visible under the hero, it would mean a viewer
 * never learns the app has Live TV in it without scrolling past nine genres.
 *
 * Round-robin rather than a shuffle because the result has to be stable: the
 * rails are re-derived on every reload, and an order that changed each time
 * would move the focused row out from under the D-pad.
 */
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

/**
 * Picks the title to put in the hero.
 *
 * ---------------------------------------------------------------------------
 * Ranked, not random, and never "the first row in the table"
 * ---------------------------------------------------------------------------
 * A hero is a full-screen photograph with a paragraph next to it, so an item
 * with neither is a hero-shaped hole. Ranking by what the item actually has --
 * backdrop, then description, then any artwork at all -- means the hero is
 * always the best-furnished thing in the library rather than whichever row
 * sorted first, and it degrades in a defined order as the library gets thinner.
 *
 * `seed` rotates the choice among equally good candidates so the app does not
 * open on the same film forever. It is a parameter rather than a `Math.random()`
 * inside for two reasons: a value that changed on every render would swap the
 * hero mid-scroll, and a pure function is one a test can pin.
 */
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

  // A negative or non-integer seed would index out of the array; the modulo is
  // taken on the absolute value and floored so any number the caller has works.
  const index = Math.abs(Math.floor(seed)) % best.length;
  return best[index];
}

/**
 * How well furnished an item is for a hero. Higher is better.
 *
 * The weights are ordered, not additive-by-accident: a backdrop outranks
 * everything because it is the only thing that fills the frame as intended, and
 * a description outranks a poster because a hero without copy is a picture with
 * a title on it.
 */
function featureScore(item: ContentItem): number {
  return (
    (item.backdropUrl ? 4 : 0) +
    (item.description ? 2 : 0) +
    (item.imageUrl ? 1 : 0)
  );
}

/**
 * Copies each item with its category's name in `meta.genre`.
 *
 * Done here rather than in the mapper because a mapper sees one row and a row
 * carries a `category_id`, not a category NAME -- resolving it there would mean
 * either a join on every query or a second round trip per item. The categories
 * are already loaded beside the items on every screen that shows a hero, so the
 * lookup is free at this point and nowhere else.
 */
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

    // Returning the same object when there is nothing to add keeps the common
    // case allocation-free and, more usefully, keeps card identity stable so a
    // re-render does not look like new data to a FlatList.
    if (genre === undefined) {
      return item;
    }

    return { ...item, meta: { ...item.meta, genre } };
  });
}
