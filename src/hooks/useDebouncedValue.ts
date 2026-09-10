import { useEffect, useState } from 'react';

/**
 * Returns `value` as it was once it stopped changing for `delayMs`.
 *
 * Used to keep a keystroke from becoming a database query. Without it, typing
 * "cartoon" fires seven searches, six of which are already obsolete when they
 * land -- and `useAsyncData` would then be racing seven responses whose order is
 * not guaranteed.
 *
 * On a television the reason is stronger than saving requests. Results render as
 * shelves, so a query per keystroke means the layout under the user reflows
 * seven times: shelves appear, change length, and disappear as the term
 * narrows, moving whatever the D-pad had focused. Waiting for the typing to
 * settle means the results move once.
 *
 * Kept generic and separate from the search screen because it has no idea what
 * it is delaying -- it is the `useEffect` cleanup that does the work, cancelling
 * the pending timer every time the value changes so only the last one fires.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
