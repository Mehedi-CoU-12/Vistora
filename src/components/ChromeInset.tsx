import React, { createContext, useContext, useMemo } from 'react';

/**
 * What the screens underneath the app's floating top bar need to know about it,
 * and what they need to tell it.
 *
 * ---------------------------------------------------------------------------
 * Why the top bar floats at all
 * ---------------------------------------------------------------------------
 * The single largest difference between "a dark app" and "a streaming app" is
 * whether the hero artwork reaches the top of the screen. A wordmark and a tab
 * rail sitting in an opaque band ABOVE the picture frames it as a banner placed
 * on a page; the same chrome floating OVER the picture, with a gradient behind
 * it, makes the picture the page.
 *
 * So `BrowseScreen` positions its top bar absolutely and draws it last. That is
 * a two-line change there and creates the two problems this module exists to
 * solve.
 *
 * ---------------------------------------------------------------------------
 * 1. `inset` -- a screen that does not open with a hero starts underneath it
 * ---------------------------------------------------------------------------
 * The bar's height depends on the type scale, the tab rail and the device's
 * safe-area inset, so it is measured rather than assumed. Screens whose first
 * element is a heading pad by it; screens whose first element is a hero
 * deliberately do not, because passing under the bar is the whole point.
 *
 * ---------------------------------------------------------------------------
 * 2. `reportScroll` -- a gradient is not enough once content moves under it
 * ---------------------------------------------------------------------------
 * At rest, a gradient behind the chrome is exactly right: the artwork shows
 * through, dimmed enough to read a wordmark against.
 *
 * Once the page scrolls it stops being enough, and this was visible in the
 * running app rather than predicted: scrolling the home screen brought the
 * hero's own My List button up behind the wordmark, and at the ~75% opacity the
 * gradient has that far down, both were legible at once and overlapped. No
 * gradient fixes that, because the problem is not contrast -- it is two
 * different things occupying the same pixels.
 *
 * What fixes it is what every streaming app does: the bar becomes opaque as soon
 * as anything is behind it, and goes back to a gradient at the top of the page.
 * That needs the scroll offset, which only the scrolling screen has, so screens
 * whose content passes under the chrome report it here.
 *
 * ---------------------------------------------------------------------------
 * A context rather than props
 * ---------------------------------------------------------------------------
 * Both values would otherwise be threaded through `BrowseScreen` -> `TabPage` ->
 * `CatalogScreen` -> its header, and through `SearchScreen` and `HomeScreen`
 * separately, so every intermediate component would carry two things it does not
 * use. The screens that need them are leaves.
 *
 * The defaults are what make this safe: a screen rendered outside `BrowseScreen`
 * -- `DetailsScreen`, `SeriesScreen`, the player -- has no floating bar above
 * it, reads an inset of 0 and a `reportScroll` that does nothing, and lays out
 * exactly as it did before.
 */

interface ChromeValue {
  inset: number;
  reportScroll: (offsetY: number) => void;
}

const noop = () => {};

const ChromeContext = createContext<ChromeValue>({
  inset: 0,
  reportScroll: noop,
});

export function ChromeProvider({
  inset,
  reportScroll,
  children,
}: {
  inset: number;
  reportScroll: (offsetY: number) => void;
  children: React.ReactNode;
}) {
  // Memoised on its parts. A fresh object per render would re-render every
  // consumer on every keystroke in the search field.
  const value = useMemo(() => ({ inset, reportScroll }), [inset, reportScroll]);

  return (
    <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
  );
}

/**
 * Padding a screen needs at the top to clear the floating chrome.
 *
 * Returns 0 where there is no floating chrome, so it is always safe to add.
 * Screens whose first element is a hero deliberately do NOT pad by this; they
 * pass it to `RailList` as `chromeOverlap` instead.
 */
export function useChromeInset(): number {
  return useContext(ChromeContext).inset;
}

/**
 * Tells the chrome how far the screen underneath it has scrolled, so it can go
 * opaque once something is behind it.
 *
 * Only screens whose content actually passes under the bar should call this. A
 * screen that has already padded itself clear of the chrome has nothing behind
 * it at any scroll offset, and reporting would make the bar go solid for no
 * reason.
 */
export function useReportScroll(): (offsetY: number) => void {
  return useContext(ChromeContext).reportScroll;
}
