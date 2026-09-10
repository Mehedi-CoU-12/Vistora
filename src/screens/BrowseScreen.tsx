import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { ScreenContainer } from '../components/ScreenContainer';
import { TabBar } from '../components/TabBar';
import {
  isCatalogTab,
  TABS,
  type TabDef,
  type TabId,
} from '../navigation/tabs';
import { colors, makeStyles, spacing, useMetrics } from '../theme';
import { CatalogScreen } from './CatalogScreen';
import { HomeScreen } from './HomeScreen';

/** The tab the app opens on, and the one Back returns to. */
const INITIAL_TAB: TabId = 'home';

/**
 * The app's browsing surface: the chrome, the tab bar, and whichever tab is
 * showing.
 *
 * ---------------------------------------------------------------------------
 * Tabs as state, not as navigator routes
 * ---------------------------------------------------------------------------
 * Live TV used to be a pushed stack route, which is why it had a heading and no
 * way back except the hardware key. Making the tabs routes instead would push a
 * screen per switch, so Back would walk you through your own browsing history
 * one tab at a time -- Sports, Anime, Cartoons, Movies -- which is not what a
 * tab bar means anywhere. `@react-navigation/bottom-tabs` would solve that and
 * bring a bottom bar this app cannot use on a television, plus a dependency to
 * style around.
 *
 * So the tabs are one piece of state in one screen, the stack keeps exactly two
 * routes (Browse and Player), and Back does the one thing it should: return to
 * Home from anywhere, and leave the app from Home.
 *
 * ---------------------------------------------------------------------------
 * Why the hardware key is handled with BackHandler here
 * ---------------------------------------------------------------------------
 * PlayerScreen documents that `BackHandler` does NOT work under this navigator,
 * because react-native-screens pops the route natively before JavaScript sees
 * the press. That is true of a screen with something beneath it -- and this
 * screen is the opposite case. Browse is the root: there is no route to pop, the
 * native stack declines the press, and it reaches the JS handler chain. Which
 * also means the failure mode if a future version changes that is mild -- Back
 * leaves the app from a non-Home tab, exactly as it did before there were tabs.
 *
 * The listener is only registered off Home, so the handler cannot swallow the
 * press that is supposed to exit the app.
 */
export function BrowseScreen() {
  const { navPlacement, isTouch } = useMetrics();
  const styles = useStyles();

  const [activeId, setActiveId] = useState<TabId>(INITIAL_TAB);

  /**
   * Which tabs have been opened at least once.
   *
   * On a touch device a visited tab stays mounted and is merely hidden, so
   * flicking back to it is instant and keeps its scroll position and its
   * selected category -- the behaviour a tab bar implies.
   *
   * On a TV it is unmounted instead, and that is not an optimisation but a
   * correctness requirement: a hidden subtree's cards stay in the platform's
   * focus tree, so the D-pad could walk out of the visible grid and into a tab
   * that is not on screen, leaving nothing highlighted anywhere. A remote user
   * pressing a tab deliberately can afford the refetch; focus vanishing is not
   * something they can recover from.
   */
  const [visited, setVisited] = useState<readonly TabId[]>([INITIAL_TAB]);

  const selectTab = useCallback((id: TabId) => {
    setActiveId(id);
    setVisited(seen => (seen.includes(id) ? seen : [...seen, id]));
  }, []);

  useEffect(() => {
    if (activeId === INITIAL_TAB) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setActiveId(INITIAL_TAB);
        return true;
      },
    );

    return () => subscription.remove();
  }, [activeId]);

  const topNav = navPlacement === 'top';
  const rendered = isTouch
    ? TABS.filter(tab => visited.includes(tab.id))
    : TABS.filter(tab => tab.id === activeId);

  return (
    <ScreenContainer>
      {/* The wordmark used to sit inside every screen's own header, three lines
          deep. It belongs here instead: it is the app, not the screen, and on a
          top-nav layout it shares this row with the tab rail rather than
          costing one of its own. */}
      <View style={styles.topBar}>
        <Text style={styles.brand} numberOfLines={1}>
          VISTORA<Text style={styles.brandAccent}>.</Text>
        </Text>

        {topNav ? (
          <TabBar tabs={TABS} activeId={activeId} onSelect={selectTab} />
        ) : null}
      </View>

      <View style={styles.body}>
        {rendered.map(tab => (
          // `display: 'none'` rather than conditional rendering, so a hidden tab
          // keeps its state. It also drops out of flex layout entirely, which is
          // what lets every page carry `flex: 1` without dividing the height
          // between them.
          <View
            key={tab.id}
            style={[styles.page, tab.id !== activeId && styles.pageHidden]}
          >
            <TabPage tab={tab} onSeeAll={selectTab} />
          </View>
        ))}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: m.gutter.horizontal,
    paddingTop: m.gutter.vertical,
    paddingBottom: spacing.sm,
  },
  brand: {
    ...m.typography.display,
    color: colors.textPrimary,
    flexShrink: 0,
  },
  brandAccent: {
    color: colors.accent,
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
