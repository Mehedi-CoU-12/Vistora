import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
import { installStreamSources } from './src/services/sources';
import { MetricsProvider } from './src/theme';

installStreamSources();

export default function App() {
  return (
    <SafeAreaProvider>
      <MetricsProvider>
        <RootNavigator />
      </MetricsProvider>
    </SafeAreaProvider>
  );
}
