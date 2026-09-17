import {Platform} from 'react-native';

import {cardAspect, cardChrome, type CardVariant} from './layout';
import {scaleTypography, type Typography} from './typography';






















export type DeviceClass = 'tv' | 'tablet' | 'phone';
export type Orientation = 'landscape' | 'portrait';


export type NavPlacement = 'top' | 'bottom';





type LayoutKey =
  | 'tv'
  | 'tablet-landscape'
  | 'tablet-portrait'
  | 'phone-landscape'
  | 'phone-portrait';


const TABLET_MIN_SHORTEST_SIDE = 600;










const SIDEBAR_MIN_CONTENT_WIDTH = 700;


const MIN_CARD_WIDTH = 72;









export interface HeroMetrics {
  
  height: number;
  
  textMaxWidth: number;
  










  align: 'start' | 'center';
  







  descriptionLines: number;
}

export interface CardSize {
  width: number;
  height: number;
}

export interface Metrics {
  device: DeviceClass;
  orientation: Orientation;
  
  isTV: boolean;
  
  isTouch: boolean;
  width: number;
  height: number;
  












  gutter: {horizontal: number; vertical: number};
  
  contentWidth: number;
  typography: Typography;
  cardSize: Record<CardVariant, CardSize>;
  
  hero: HeroMetrics;
  
  focusScale: number;
  
  pressScale: number;
  







  gridColumns: Record<CardVariant, number>;
  


  navPlacement: NavPlacement;
  
  usesSidebar: boolean;
  sidebarWidth: number;
  






  minTouchTarget: number;
}

const GUTTER: Record<LayoutKey, {horizontal: number; vertical: number}> = {
  
  tv: {horizontal: 48, vertical: 27},
  'tablet-landscape': {horizontal: 32, vertical: 24},
  'tablet-portrait': {horizontal: 32, vertical: 24},
  'phone-landscape': {horizontal: 24, vertical: 12},
  'phone-portrait': {horizontal: 16, vertical: 12},
};










const TV_CARD_WIDTH: Record<CardVariant, number> = {
  poster: 124,
  landscape: 168,
  square: 116,
};










const CARDS_ACROSS: Record<Exclude<LayoutKey, 'tv'>, Record<CardVariant, number>> = {
  'tablet-landscape': {poster: 6.2, landscape: 4.4, square: 6.8},
  'tablet-portrait': {poster: 4.6, landscape: 3.2, square: 5},
  
  
  
  'phone-landscape': {poster: 7, landscape: 4.2, square: 7.5},
  'phone-portrait': {poster: 2.8, landscape: 1.9, square: 3.4},
};










const GRID_COLUMNS: Record<LayoutKey, Record<CardVariant, number>> = {
  tv: {poster: 5, landscape: 4, square: 6},
  'tablet-landscape': {poster: 5, landscape: 4, square: 6},
  'tablet-portrait': {poster: 4, landscape: 3, square: 5},
  
  
  
  'phone-landscape': {poster: 6, landscape: 4, square: 7},
  'phone-portrait': {poster: 3, landscape: 2, square: 4},
};


const HEADLINE_SCALE: Record<DeviceClass, number> = {
  tv: 1,
  tablet: 0.92,
  phone: 0.78,
};


const SIDEBAR_WIDTH: Record<DeviceClass, number> = {
  tv: 216,
  tablet: 184,
  phone: 176,
};





















const HERO: Record<
  LayoutKey,
  {
    heightFraction: number;
    textFraction: number;
    textCap: number;
    align: HeroMetrics['align'];
    descriptionLines: number;
  }
> = {
  tv: {
    heightFraction: 0.6,
    textFraction: 0.52,
    textCap: 620,
    align: 'start',
    descriptionLines: 3,
  },
  'tablet-landscape': {
    heightFraction: 0.56,
    textFraction: 0.56,
    textCap: 560,
    align: 'start',
    descriptionLines: 3,
  },
  'tablet-portrait': {
    heightFraction: 0.42,
    textFraction: 0.78,
    textCap: 560,
    align: 'start',
    descriptionLines: 3,
  },
  'phone-landscape': {
    heightFraction: 0.82,
    textFraction: 0.6,
    textCap: 420,
    align: 'start',
    descriptionLines: 0,
  },
  'phone-portrait': {
    heightFraction: 0.54,
    textFraction: 1,
    textCap: 560,
    align: 'center',
    descriptionLines: 2,
  },
};


const HERO_MIN_HEIGHT = 200;
const HERO_MAX_HEIGHT = 560;

function resolveHero(
  key: LayoutKey,
  height: number,
  contentWidth: number,
): HeroMetrics {
  const spec = HERO[key];

  return {
    height: clamp(
      Math.round(height * spec.heightFraction),
      HERO_MIN_HEIGHT,
      HERO_MAX_HEIGHT,
    ),
    textMaxWidth: Math.round(
      Math.min(contentWidth * spec.textFraction, spec.textCap),
    ),
    align: spec.align,
    descriptionLines: spec.descriptionLines,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function layoutKey(device: DeviceClass, orientation: Orientation): LayoutKey {
  return device === 'tv' ? 'tv' : `${device}-${orientation}`;
}









function fluidCardWidth(across: number, contentWidth: number): number {
  return Math.max(MIN_CARD_WIDTH, Math.floor(contentWidth / across) - cardChrome);
}

function resolveCardSizes(
  key: LayoutKey,
  contentWidth: number,
): Record<CardVariant, CardSize> {
  const sizes = {} as Record<CardVariant, CardSize>;

  for (const variant of Object.keys(cardAspect) as CardVariant[]) {
    const width =
      key === 'tv'
        ? TV_CARD_WIDTH[variant]
        : fluidCardWidth(CARDS_ACROSS[key][variant], contentWidth);

    
    
    sizes[variant] = {width, height: Math.floor(width * cardAspect[variant])};
  }

  return sizes;
}











function resolveNavPlacement(isTV: boolean, orientation: Orientation): NavPlacement {
  return !isTV && orientation === 'portrait' ? 'bottom' : 'top';
}







export function resolveMetrics(width: number, height: number): Metrics {
  const isTV = Platform.isTV;
  const orientation: Orientation = width >= height ? 'landscape' : 'portrait';

  
  
  const shortestSide = Math.min(width, height);
  const device: DeviceClass = isTV
    ? 'tv'
    : shortestSide >= TABLET_MIN_SHORTEST_SIDE
    ? 'tablet'
    : 'phone';

  const key = layoutKey(device, orientation);
  const gutter = GUTTER[key];
  const contentWidth = Math.max(0, width - gutter.horizontal * 2);

  return {
    device,
    orientation,
    isTV,
    isTouch: !isTV,
    width,
    height,
    gutter,
    contentWidth,
    typography: scaleTypography(HEADLINE_SCALE[device]),
    cardSize: resolveCardSizes(key, contentWidth),
    hero: resolveHero(key, height, contentWidth),
    
    
    focusScale: isTV ? 1.07 : 1,
    pressScale: isTV ? 1 : 0.96,
    gridColumns: GRID_COLUMNS[key],
    navPlacement: resolveNavPlacement(isTV, orientation),
    usesSidebar: isTV || contentWidth >= SIDEBAR_MIN_CONTENT_WIDTH,
    sidebarWidth: SIDEBAR_WIDTH[device],
    minTouchTarget: isTV ? 0 : 48,
  };
}
