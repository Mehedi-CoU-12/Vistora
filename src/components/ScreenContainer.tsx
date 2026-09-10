import React, { useMemo } from 'react';
import { StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, makeStyles, useMetrics } from '../theme';

/**
 * Root wrapper for every screen: the dark background, the status bar, and the
 * system insets.
 *
 * ---------------------------------------------------------------------------
 * Insets and overscan are different problems, and each device has only one
 * ---------------------------------------------------------------------------
 * On Android TV the system reports zero insets -- there is no status bar, notch
 * or navigation bar to avoid. The margin that actually matters there is
 * overscan, which the platform never reports and which the theme supplies as
 * `gutter`. So TV takes the gutter and ignores insets.
 *
 * On a phone it is the reverse. Nothing crops the panel, so the 5% overscan
 * allowance would be 48dp of wasted width on a 390dp screen; but the status bar,
 * the navigation bar and the cutout are all real, and the app targets SDK 36,
 * where the platform draws edge-to-edge whether or not you ask. So phones take
 * the real insets here, plus a much smaller gutter from the theme.
 *
 * The gutter is applied by the screens themselves (each one needs it in a
 * different place -- a header pads, a row's scroll content pads, a grid divides
 * it), which is why this component only owns the insets.
 */
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
      {/* Hidden on TV, where it would be a black bar over nothing. Visible on a
          phone: hiding the clock and battery to show a channel grid is not a
          trade a phone user asked for. */}
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
