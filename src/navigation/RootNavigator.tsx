import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { BrowseScreen } from '../screens/BrowseScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { SeriesScreen } from '../screens/SeriesScreen';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Navigation for the app.
 *
 * Why a native stack rather than the JS stack: it gives us the Android hardware
 * BACK button for free. On a TV remote, Back is the primary way out of any
 * screen, and the native stack wires it to `goBack()` without a single
 * BackHandler listener. It is also the reason no screen here needs its own back
 * button in a header.
 *
 * Headers are off everywhere. A TV app has no room for a navigation bar and no
 * way to tap one; the browse screen presents its own chrome instead.
 *
 * The stack is deliberately shallow: everything browsable lives behind tabs
 * inside `Browse`, so Back is unambiguous on a remote that has exactly one of
 * it. `Series` is the only screen between browsing and playing, and it earns
 * the depth -- an episode list cannot be a tab (there is one per series) and
 * cannot be a modal over the grid (it is where you spend time, not a glance).
 * Back from an episode returns you to the list you chose it from, which is the
 * behaviour that would be impossible if the list were part of the grid screen.
 */
const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    primary: colors.accent,
    border: colors.border,
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Browse"
        screenOptions={{
          headerShown: false,
          // Slide/fade transitions on a TV read as sluggish, and a mid-transition
          // screen is a screen where focus is briefly nowhere.
          animation: 'fade',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Browse" component={BrowseScreen} />
        <Stack.Screen name="Series" component={SeriesScreen} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{
            // The player is its own world: no background peeking through while
            // the surface initialises.
            contentStyle: { backgroundColor: '#000' },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
