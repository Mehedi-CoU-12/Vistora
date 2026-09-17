import {Platform, type TextStyle} from 'react-native';





























const fontFamily = Platform.select({
  android: 'sans-serif',
  default: undefined,
});

const medium = Platform.select({
  android: 'sans-serif-medium',
  default: undefined,
});

export const baseTypography = {
  













  heroTitle: {
    fontFamily: medium,
    fontSize: 44,
    lineHeight: 49,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  
  display: {
    fontFamily: medium,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  
  title: {
    fontFamily: medium,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  
  sectionTitle: {
    fontFamily: medium,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  
  body: {
    fontFamily,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  
  caption: {
    fontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  
  label: {
    fontFamily: medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
} satisfies Record<string, TextStyle>;

export type TypographyRole = keyof typeof baseTypography;









export type TypeStyle = TextStyle & {fontSize: number; lineHeight: number};

export type Typography = Record<TypographyRole, TypeStyle>;


const HEADLINE_ROLES = [
  'heroTitle',
  'display',
  'title',
  'sectionTitle',
] as const;








export function scaleTypography(headlineScale: number): Typography {
  if (headlineScale === 1) {
    return baseTypography;
  }

  const scaled: Typography = {...baseTypography};

  for (const role of HEADLINE_ROLES) {
    const base = baseTypography[role];
    scaled[role] = {
      ...base,
      fontSize: Math.round(base.fontSize * headlineScale),
      lineHeight: Math.round(base.lineHeight * headlineScale),
    };
  }

  return scaled;
}
