import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { ChromeProvider } from '../components/ChromeInset';
import { ExitHint } from '../components/ExitHint';
import { Gradient } from '../components/Gradient';
import { ScreenContainer } from '../components/ScreenContainer';
import { SearchIcon } from '../components/SearchIcon';
import { TabBar } from '../components/TabBar';
import { TextButton } from '../components/TextButton';
import { useDoubleBackExit } from '../hooks/useDoubleBackExit';
import {
  isCatalogTab,
  TABS,
  type TabDef,
  type TabId,
} from '../navigation/tabs';
import {
  backgroundAlpha,
  colors,
  duration,
  makeStyles,
  spacing,
  useMetrics,
} from '../theme';
import { CatalogScreen } from './CatalogScreen';
import { HomeScreen } from './HomeScreen';
import { SearchScreen } from './SearchScreen';

const INITIAL_TAB: TabId = 'home';

export function BrowseScreen() {
  const { navPlacement, isTouch, typography } = useMetrics();
  const styles = useStyles();

  const searchIconSize = Math.round(typography.body.fontSize * 1.2);

  const [activeId, setActiveId] = useState<TabId>(INITIAL_TAB);

  const [visited, setVisited] = useState<readonly TabId[]>([INITIAL_TAB]);

  const [searching, setSearching] = useState(false);

  const [chromeHeight, setChromeHeight] = useState(0);

  const { armed: exitArmed, requestExit, cancelExit } = useDoubleBackExit();

  const measureChrome = useCallback((event: LayoutChangeEvent) => {
    setChromeHeight(event.nativeEvent.layout.height);
  }, []);

  const opaque = useRef(new Animated.Value(0)).current;
  const scrolled = useRef(false);

  const reportScroll = useCallback(
    (offsetY: number) => {
      const next = offsetY > 8;
      if (next === scrolled.current) {
        return;
      }
      scrolled.current = next;

      Animated.timing(opaque, {
        toValue: next ? 1 : 0,
        duration: duration.quick,
        useNativeDriver: true,
      }).start();
    },
    [opaque],
  );

  const selectTab = useCallback(
    (id: TabId) => {
      setActiveId(id);
      setVisited(seen => (seen.includes(id) ? seen : [...seen, id]));

      setSearching(false);
      cancelExit();
    },
    [cancelExit],
  );

  const toggleSearch = useCallback(() => {
    setSearching(open => !open);
    cancelExit();
  }, [cancelExit]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (searching) {
            setSearching(false);
            return true;
          }

          if (activeId !== INITIAL_TAB) {
            setActiveId(INITIAL_TAB);
            return true;
          }

          requestExit();
          return true;
        },
      );

      return () => {
        subscription.remove();
        cancelExit();
      };
    }, [activeId, cancelExit, requestExit, searching]),
  );

  const topNav = navPlacement === 'top';

  const mounted = isTouch
    ? TABS.filter(tab => visited.includes(tab.id))
    : TABS.filter(tab => tab.id === activeId && !searching);

  return (
    <ScreenContainer>
      <ChromeProvider inset={chromeHeight} reportScroll={reportScroll}>
        <View style={styles.body}>
          {mounted.map(tab => (
            <View
              key={tab.id}
              style={[
                styles.page,
                (tab.id !== activeId || searching) && styles.pageHidden,
              ]}
            >
              <TabPage tab={tab} onSeeAll={selectTab} />
            </View>
          ))}

          {searching ? (
            <View style={styles.page}>
              <SearchScreen />
            </View>
          ) : null}

          <ExitHint visible={exitArmed} />
        </View>
      </ChromeProvider>

      {}
      <View style={styles.topBar} onLayout={measureChrome}>
        {}
        <Gradient
          colors={[backgroundAlpha(0.98), backgroundAlpha(0)]}
          direction="down"
          style={styles.topBarFade}
        />

        {}
        <Animated.View
          style={[styles.topBarSolid, { opacity: opaque }]}
          pointerEvents="none"
        />

        {}
        <Text style={styles.brand} numberOfLines={1}>
          VISTORA<Text style={styles.brandAccent}>.</Text>
        </Text>

        {topNav ? (
          <TabBar tabs={TABS} activeId={activeId} onSelect={selectTab} />
        ) : null}

        {}
        <View style={styles.searchSlot}>
          {}
          <TextButton
            accessibilityLabel="Search"
            onPress={toggleSearch}
            selected={searching}
          >
            {color => <SearchIcon size={searchIconSize} color={color} />}
          </TextButton>
        </View>
      </View>

      {topNav ? null : (
        <TabBar tabs={TABS} activeId={activeId} onSelect={selectTab} />
      )}
    </ScreenContainer>
  );
}

function TabPage({
  tab,
  onSeeAll,
}: {
  tab: TabDef;
  onSeeAll: (id: TabId) => void;
}) {
  return isCatalogTab(tab) ? (
    <CatalogScreen tab={tab} />
  ) : (
    <HomeScreen onSeeAll={onSeeAll} />
  );
}

const useStyles = makeStyles(m => ({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: m.gutter.horizontal,
    paddingTop: m.gutter.vertical,
    paddingBottom: spacing.sm,
  },
  topBarFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,

    bottom: '-50%',
  },
  topBarSolid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
  brand: {
    ...m.typography.display,
    color: colors.textPrimary,
    flexShrink: 0,
  },
  brandAccent: {
    color: colors.accent,
  },
  searchSlot: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
  body: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  pageHidden: {
    display: 'none',
  },
}));
