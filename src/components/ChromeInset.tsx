import React, { createContext, useContext, useMemo } from 'react';

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
  const value = useMemo(() => ({ inset, reportScroll }), [inset, reportScroll]);

  return (
    <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
  );
}

export function useChromeInset(): number {
  return useContext(ChromeContext).inset;
}

export function useReportScroll(): (offsetY: number) => void {
  return useContext(ChromeContext).reportScroll;
}
