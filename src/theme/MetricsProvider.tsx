import React, { createContext, useContext, useMemo } from 'react';
import { Dimensions, useWindowDimensions } from 'react-native';

import { resolveMetrics, type Metrics } from './metrics';

const initialWindow = Dimensions.get('window');

const MetricsContext = createContext<Metrics>(
  resolveMetrics(initialWindow.width, initialWindow.height),
);

export function MetricsProvider({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();

  const metrics = useMemo(() => resolveMetrics(width, height), [width, height]);

  return (
    <MetricsContext.Provider value={metrics}>
      {children}
    </MetricsContext.Provider>
  );
}

export function useMetrics(): Metrics {
  return useContext(MetricsContext);
}
