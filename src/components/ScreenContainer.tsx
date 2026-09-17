import React, { useMemo } from 'react';
import { StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, makeStyles, useMetrics } from '../theme';

export function ScreenContainer({ children }: { children: React.ReactNode }) {
  const { isTV } = useMetrics();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const inset = useMemo(
    () =>
      isTV
        ? null
        : {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
    [insets.bottom, insets.left, insets.right, insets.top, isTV],
  );

  return (
    <View style={[styles.root, inset]}>
      {}
      <StatusBar hidden={isTV} barStyle="light-content" />
      {children}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
}));
