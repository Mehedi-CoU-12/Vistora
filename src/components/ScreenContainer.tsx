import React from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';

import {colors} from '../theme';

/**
 * Root wrapper for every screen: the dark background plus a hidden status bar.
 *
 * Note there is no SafeAreaView. On Android TV the system reports zero insets,
 * because a TV has no status bar, notch or navigation bar. The margin that
 * actually matters is overscan, which the platform never reports and which we
 * therefore apply ourselves as padding from `overscan` in the theme.
 */
export function ScreenContainer({children}: {children: React.ReactNode}) {
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
