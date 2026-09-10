import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { ScreenContainer } from '../components/ScreenContainer';
import { SearchIcon } from '../components/SearchIcon';
import { TabBar } from '../components/TabBar';
import { TextButton } from '../components/TextButton';
import {
  isCatalogTab,
  TABS,
  type TabDef,
  type TabId,
} from '../navigation/tabs';
import { colors, makeStyles, spacing, useMetrics } from '../theme';
import { CatalogScreen } from './CatalogScreen';
import { HomeScreen } from './HomeScreen';
import { SearchScreen } from './SearchScreen';

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
 * one tab at a time -- Anime, Movies, Live TV -- which is not what a tab bar
 * means anywhere. `@react-navigation/bottom-tabs` would solve that and
 * bring a bottom bar this app cannot use on a television, plus a dependency to
 * style around.
 *
 * So the tabs are one piece of state in one screen, the stack keeps exactly two
 * routes (Browse and Player), and Back does the one thing it should: return to
 * Home from anywhere, and leave the app from Home.
 *
 * ---------------------------------------------------------------------------
 * Search is a mode over the tabs, not one more tab
 * ---------------------------------------------------------------------------
 * The reflex is to add `search` to TABS and let the tab bar render it. Two
 * things are wrong with that.
 *
 * The first is that TABS means "the content kinds this app browses" -- that is
 * the property `HomeScreen` and `SearchScreen` both rely on when they derive
 * their shelves from it. Search is not a kind; it is a question asked of all of
 * them at once. An entry in that array would have to be filtered back out at
 * every point that maps over it, which is the "two lists kept in step by hand"
 * problem the array exists to prevent.
 *
 * The second is measurable. A phone in portrait puts the tab bar along the
 * bottom, where the pills divide a 390dp screen between them -- at six of them
 * that is about 60dp each, which a label like "Cartoons" only just fits. Every
 * entry in TABS takes width from every other, so search would arrive by making
 * navigation to everything else worse.
 *
 * As a mode it costs no navigation width at all: the pill lives in the top bar,
 * which is the wordmark and a great deal of nothing on the layout where the tab
 * bar is at the bottom. And the mode composes with the tabs rather than
 * competing with them -- closing search returns you to the tab you were on,
 * still scrolled where you left it.
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
 * The listener is only registered while there is somewhere to go back TO -- off
 * Home, or in search -- so the handler cannot swallow the press that is supposed
 * to exit the app.
 */
export function BrowseScreen() {
  const { navPlacement, isTouch, typography } = useMetrics();
  const styles = useStyles();

  /**
   * The magnifier stands in for a word, so it is sized against the type scale
   * rather than picked: 1.2x the body size puts it at about the cap height of
   * the label it replaced, so it sits in the pill the way the text did.
   *
   * `body` is one of the roles that deliberately does NOT scale per device (see
   * typography.ts on why dp is physical and the two viewing distances cancel
   * out), which is exactly the property wanted here -- a magnifier legible on a
   * phone at thirty centimetres is legible on a TV at three metres.
   */
  const searchIconSize = Math.round(typography.body.fontSize * 1.2);

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

  /**
   * Whether search has taken over the content area.
   *
   * Separate state rather than a value of `activeId`, so the tab underneath
   * stays selected and comes back untouched when search closes. The search term
   * itself lives in `SearchScreen`, which unmounts with the mode -- closing
   * search and reopening it should be a fresh question, not the last one still
   * sitting in the field.
   */
  const [searching, setSearching] = useState(false);

  const selectTab = useCallback((id: TabId) => {
    setActiveId(id);
    setVisited(seen => (seen.includes(id) ? seen : [...seen, id]));
    // Picking a tab is a request to browse it, so it closes search. Without
    // this the results would stay over the tab the user just chose.
    setSearching(false);
  }, []);

  const toggleSearch = useCallback(() => {
    setSearching(open => !open);
  }, []);

  useEffect(() => {
    if (!searching && activeId === INITIAL_TAB) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        // Search first, then the tab: Back unwinds the modes in the order they
        // were entered, so from a search over Anime it takes you to Anime and
        // then to Home rather than skipping a step the user can see.
        if (searching) {
          setSearching(false);
        } else {
          setActiveId(INITIAL_TAB);
        }
        return true;
      },
    );

    return () => subscription.remove();
  }, [activeId, searching]);

  const topNav = navPlacement === 'top';

  /**
   * Which tab pages to mount.
   *
   * On TV the active tab is unmounted while search is open, for the same reason
   * only one tab is ever mounted there: a hidden subtree's cards stay in the
   * platform's focus tree, so the D-pad could walk out of the results and into
   * the grid behind them, leaving nothing highlighted anywhere. On touch there
   * is no focus tree to corrupt, so the pages stay mounted and merely hidden --
   * which is what makes closing search return you to an unchanged tab.
   */
  const mounted = isTouch
    ? TABS.filter(tab => visited.includes(tab.id))
    : TABS.filter(tab => tab.id === activeId && !searching);

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

        {/* `marginLeft: 'auto'` rather than a `justifyContent` on the row: it
            pins the pill to the right edge on a phone in portrait, where the
            wordmark is the only other thing in this bar, and resolves to nothing
            on a layout where the tab rail beside it has already claimed the
            free space. One rule, both layouts. */}
        <View style={styles.searchSlot}>
          {/* Icon-only, so `accessibilityLabel` carries the name the pill no
              longer says out loud. It is also the one place the app spends a
              pictogram instead of a word -- see the note in SearchIcon on why
              the magnifier is the exception to `TabBar`'s labels-not-icons
              rule. */}
          <TextButton
            accessibilityLabel="Search"
            onPress={toggleSearch}
            selected={searching}
          >
            {color => <SearchIcon size={searchIconSize} color={color} />}
          </TextButton>
        </View>
      </View>

      <View style={styles.body}>
        {mounted.map(tab => (
          // `display: 'none'` rather than conditional rendering, so a hidden tab
          // keeps its state. It also drops out of flex layout entirely, which is
          // what lets every page carry `flex: 1` without dividing the height
          // between them.
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
