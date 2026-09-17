import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export type GradientDirection = 'down' | 'up' | 'left' | 'right';

interface GradientProps {
  colors: readonly string[];

  direction?: GradientDirection;

  easing?: 'ease' | 'linear';

  style?: StyleProp<ViewStyle>;

  children?: React.ReactNode;
  pointerEvents?: ViewStyle['pointerEvents'];
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

function parseColor(input: string): Rgba {
  const value = input.trim();

  if (value.startsWith('#')) {
    const hex = value.slice(1);

    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }

    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }

    return TRANSPARENT;
  }

  const match = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );

  if (!match) {
    return TRANSPARENT;
  }

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function mix(from: Rgba, to: Rgba, t: number): string {
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  const a = from.a + (to.a - from.a) * t;

  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function sample(stops: Rgba[], t: number): string {
  if (stops.length === 1) {
    return mix(stops[0], stops[0], 0);
  }

  const scaled = t * (stops.length - 1);

  const index = Math.min(Math.floor(scaled), stops.length - 2);

  return mix(stops[index], stops[index + 1], scaled - index);
}

const EASE_STOPS = 8;

const CSS_DIRECTION: Record<GradientDirection, string> = {
  down: 'to bottom',
  up: 'to top',
  right: 'to right',
  left: 'to left',
};

export function linearGradient(
  colors: readonly string[],
  direction: GradientDirection,
  easing: 'ease' | 'linear',
): string {
  const parsed = colors.map(parseColor);

  const stops =
    easing === 'linear'
      ? parsed.map((_, index) =>
          stopAt(parsed, parsed.length === 1 ? 0 : index / (parsed.length - 1)),
        )
      : Array.from({ length: EASE_STOPS }, (_, index) => {
          const position = index / (EASE_STOPS - 1);

          return `${sample(parsed, position * position)} ${percent(position)}`;
        });

  return `linear-gradient(${CSS_DIRECTION[direction]}, ${stops.join(', ')})`;
}

function stopAt(parsed: Rgba[], position: number): string {
  return `${sample(parsed, position)} ${percent(position)}`;
}

function percent(position: number): string {
  return `${(position * 100).toFixed(2)}%`;
}

export function Gradient({
  colors,
  direction = 'down',
  easing = 'ease',
  style,
  children,
  pointerEvents,
}: GradientProps) {
  const backgroundImage = useMemo(
    () => linearGradient(colors, direction, easing),
    [colors, direction, easing],
  );

  return (
    <View
      style={[style, { backgroundImage }]}
      pointerEvents={pointerEvents ?? (children ? 'auto' : 'none')}
    >
      {children}
    </View>
  );
}
