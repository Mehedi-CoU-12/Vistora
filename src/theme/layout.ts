export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export type CardVariant = 'poster' | 'landscape' | 'square';

export const cardAspect: Record<CardVariant, number> = {
  poster: 3 / 2,

  landscape: 9 / 16,

  square: 1,
};

export const cardChrome = spacing.xs * 2 + 2 * 2;

export const duration = {
  focus: 120,

  quick: 160,

  hero: 260,
} as const;

export const heroAspect = 9 / 16;
