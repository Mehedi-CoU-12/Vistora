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
  
  stretch?: boolean;
}









function TabPill({ tab, selected, onSelect, stretch = false }: TabPillProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={() => onSelect(tab.id)}
      
      
      
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
        <>
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

          {selected ? <View style={styles.indicator} /> : null}
        </>
      )}
    </Focusable>
  );
}

const useStyles = makeStyles(m => ({
  rail: {
    
    
    
    flex: 1,
  },
  railContent: {
    alignItems: 'center',
    gap: spacing.xs,
    
    
    
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
    
    
    
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  pillSelected: {
    backgroundColor: colors.accentMuted,
  },
  indicator: {
    position: 'absolute',
    
    
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xs,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  label: {
    ...m.typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  labelSelected: {
    
    
    
    
    color: colors.textPrimary,
  },
  labelActive: {
    color: colors.textPrimary,
  },
}));
