import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';
import type { ScrimEdge } from './playerLayout';

const RAMP: { alpha: number; at: number }[] = [
  { alpha: 0.78, at: 0 },
  { alpha: 0.44, at: 0.3 },
  { alpha: 0.16, at: 0.6 },
  { alpha: 0, at: 1 },
];

const HELD_ALPHA = 0.88;

const SCRIM_RGB = '4, 6, 12';

export function Scrim({
  edge,
  geometry,
}: {
  edge: 'top' | 'bottom';
  geometry: ScrimEdge;
}) {
  const styles = useStyles();
  const { height, hold } = geometry;

  if (height <= 0) {
    return null;
  }

  const tail = 1 - hold;

  const stops = [
    { alpha: HELD_ALPHA, at: 0 },
    { alpha: HELD_ALPHA, at: hold },
    ...RAMP.map(stop => ({ alpha: stop.alpha, at: hold + tail * stop.at })),
  ];

  return (
    <View
      pointerEvents="none"
      style={[
        styles.layer,
        edge === 'top' ? styles.top : styles.bottom,
        {
          height,
          backgroundImage: [
            {
              type: 'linear-gradient' as const,

              direction: edge === 'top' ? 'to bottom' : 'to top',
              colorStops: stops.map(stop => ({
                color: `rgba(${SCRIM_RGB}, ${stop.alpha})`,
                positions: [`${(stop.at * 100).toFixed(2)}%`],
              })),
            },
          ],
        },
      ]}
    />
  );
}

const useStyles = makeStyles(() => ({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
}));
