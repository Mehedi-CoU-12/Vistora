import React from 'react';
import { ScrollView, Text, TVFocusGuideView, View } from 'react-native';

import type { TabDef, TabId } from '../navigation/tabs';
import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { Focusable } from './Focusable';

interface TabBarProps {
  tabs: readonly TabDef[];
  activeId: TabId;
  onSelect: (id: TabId) => void;
}

/**
 * The app's top-level navigation, in the one shape each device wants.
 *
 * ---------------------------------------------------------------------------
 * Two placements, and why it is not a preference
 * ---------------------------------------------------------------------------
 * RAIL -- a scrolling row of pills at the top. This is the shape for a TV and
 * for any landscape window. On a TV it is the only shape that works: the bar
 * has to be somewhere the D-pad reaches by pressing UP out of the content,
 * which is the top of the screen by definition, and a television has no thumb
 * for a bottom bar to be near. In landscape it wins for a different reason --
 * height is the scarce resource there, and a rail shares a row with the
 * wordmark instead of claiming one of its own.
 *
 * BAR -- a full-width row along the bottom, for a touch device held upright.
 * The bottom of a tall phone is the part of the screen a thumb reaches without
 * regripping, and moving between content kinds is the most frequent thing
 * anyone does in an app like this.
 *
 * `navPlacement` decides, so no caller passes a variant and no screen contains
 * a `Platform` check. See `resolveNavPlacement` in theme/metrics.ts.
 *
 * ---------------------------------------------------------------------------
 * Labels rather than icons
 * ---------------------------------------------------------------------------
 * There is no icon font in this project (see player/glyphs.ts on why one is not
 * worth adding), but that is not the reason. The reason is that these tabs are
 * content KINDS, and the distinctions that matter here -- cartoons against
 * anime, films against fixtures -- have no pictogram anyone would read
 * correctly. A word is unambiguous at three metres and at thirty centimetres.
 *
 * ---------------------------------------------------------------------------
 * Selection and focus are drawn differently, on purpose
 * ---------------------------------------------------------------------------
 * Selection is which tab you are looking at; focus is where the D-pad is. On a
 * TV both are visible at once and constantly disagree -- you walk focus along
 * the rail while the content below stays on the selected tab -- so selection is
 * a filled pill and focus is the ring `Focusable` draws. Collapsing them would
 * make it impossible to see which tab pressing OK would leave you on.
 */
export function TabBar({ tabs, activeId, onSelect }: TabBarProps) {
  const { navPlacement } = useMetrics();

  return navPlacement === 'bottom' ? (
    <BottomBar tabs={tabs} activeId={activeId} onSelect={onSelect} />
  ) : (
    <Rail tabs={tabs} activeId={activeId} onSelect={onSelect} />
  );
}

function Rail({ tabs, activeId, onSelect }: TabBarProps) {
  const styles = useStyles();

  return (
    // The focus guide gives the rail focus memory: walk right to Sports, press
    // DOWN into the grid, press UP again, and you land back on Sports rather
    // than at Home. Without it the platform picks by raw geometry, which from
    // the middle of a grid is whichever pill happens to be overhead.
    <TVFocusGuideView autoFocus style={styles.rail}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
      >
        {tabs.map(tab => (
          <TabPill
            key={tab.id}
            tab={tab}
            selected={tab.id === activeId}
            onSelect={onSelect}
          />
        ))}
      </ScrollView>
    </TVFocusGuideView>
  );
}

function BottomBar({ tabs, activeId, onSelect }: TabBarProps) {
  const styles = useStyles();

  return (
    // Not absolutely positioned: the bar is a flex sibling of the content, so
    // the content's own height stops above it and no screen has to know the
    // bar's height to keep its last row clear of it.
    <View style={styles.bar} accessibilityRole="tablist">
      {tabs.map(tab => (
        <TabPill
          key={tab.id}
          tab={tab}
          selected={tab.id === activeId}
          onSelect={onSelect}
          stretch
        />
      ))}
    </View>
  );
}

interface TabPillProps {
  tab: TabDef;
  selected: boolean;
  onSelect: (id: TabId) => void;
  /** Share the row equally with its siblings, for the bottom bar. */
  stretch?: boolean;
}

/**
 * One tab, in both placements.
 *
 * Shared rather than written twice because the treatment is the thing that has
 * to agree: a pill that fills with `accentMuted` when selected and turns its
 * label accent, whether it is sitting in a rail on a television or in a bar
 * under a thumb. Only the sizing differs, which is the `stretch` flag.
 */
function TabPill({ tab, selected, onSelect, stretch = false }: TabPillProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={() => onSelect(tab.id)}
      // A pill that grew on focus would push its neighbours along the row, and
      // in a bottom bar it would collide with them. The ring and the fill are
      // enough.
      scaleOnFocus={false}
      accessibilityRole="tab"
      selected={selected}
      accessibilityLabel={tab.label}
      style={[
        styles.pill,
        selected && styles.pillSelected,
        stretch && styles.pillStretch,
      ]}
    >
      {active => (
        <Text
          style={[
            styles.label,
            selected && styles.labelSelected,
            active && styles.labelActive,
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      )}
    </Focusable>
  );
}

const useStyles = makeStyles(m => ({
  rail: {
    // Takes the width the wordmark beside it does not, and no more: without
    // flexShrink a long tab list would push the wordmark off the left edge
    // instead of scrolling.
    flex: 1,
  },
  railContent: {
    alignItems: 'center',
    gap: spacing.xs,
    // Right-aligned while the pills fit, which puts them opposite the wordmark
    // rather than crowding it. Once they no longer fit, `flexGrow` stops
    // mattering and the row simply scrolls.
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    // A hairline rather than a shadow: the bar sits over a dark background where
    // an elevation shadow is invisible, and a card scrolling under a line reads
    // as "there is more above" correctly.
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: m.minTouchTarget,
  },
  pillStretch: {
    flex: 1,
    // Six tabs across a narrow phone leaves each one about 60dp. Without this,
    // the horizontal padding above would refuse to shrink and the row would
    // overflow the screen rather than dividing it.
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  pillSelected: {
    backgroundColor: colors.accentMuted,
  },
  label: {
    ...m.typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  labelSelected: {
    color: colors.accent,
  },
  labelActive: {
    color: colors.textPrimary,
  },
}));
