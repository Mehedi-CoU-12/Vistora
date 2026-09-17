import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ResolvingOverlay } from '../components/ResolvingOverlay';
import { BrowseScreen } from '../screens/BrowseScreen';
import { DetailsScreen } from '../screens/DetailsScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { SeriesScreen } from '../screens/SeriesScreen';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
    <View style={styles.root}>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName="Browse"
          screenOptions={{
            headerShown: false,

            animation: 'fade',
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Browse" component={BrowseScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
          <Stack.Screen name="Series" component={SeriesScreen} />
          <Stack.Screen
            name="Player"
            component={PlayerScreen}
            options={{
              contentStyle: { backgroundColor: '#000' },
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>

      {}
      <ResolvingOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
