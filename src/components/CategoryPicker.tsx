import React from 'react';
import { ScrollView, Text, TVFocusGuideView, View } from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import type { Category } from '../types/content';
import { Focusable } from './Focusable';

export interface CategoryPickerProps {
  categories: Category[];
  
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}






























export function CategoryPicker(props: CategoryPickerProps) {
  const { usesSidebar } = useMetrics();

  return usesSidebar ? <Sidebar {...props} /> : <Rail {...props} />;
}


function Sidebar({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryPickerProps) {
  const styles = useStyles();

  return (
    
    
    
    
    <TVFocusGuideView autoFocus style={styles.sidebar}>
      <Text style={styles.sidebarHeading}>CATEGORIES</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sidebarContent}
      >
        <SidebarRow
          label="All"
          selected={selectedCategoryId === null}
          onPress={() => onSelect(null)}
        />

        {categories.map(category => (
          <SidebarRow
            key={category.id}
            label={category.name}
            selected={selectedCategoryId === category.id}
            onPress={() => onSelect(category.id)}
          />
        ))}
      </ScrollView>
    </TVFocusGuideView>
  );
}









function Rail({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryPickerProps) {
  const styles = useStyles();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
      style={styles.rail}
    >
      <Chip
        label="All"
        selected={selectedCategoryId === null}
        onPress={() => onSelect(null)}
      />

      {categories.map(category => (
        <Chip
          key={category.id}
          label={category.name}
          selected={selectedCategoryId === category.id}
          onPress={() => onSelect(category.id)}
        />
      ))}
    </ScrollView>
  );
}

interface CategoryItemProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function SidebarRow({ label, selected, onPress }: CategoryItemProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      style={styles.sidebarRow}
      scaleOnFocus={false}
      
      
      accessibilityRole="radio"
      selected={selected}
      accessibilityLabel={label}
    >
      {active => (
        <View style={styles.sidebarRowInner}>
          <View
            style={[
              styles.selectionMarker,
              selected && styles.selectionMarkerActive,
            ]}
          />
          <Text
            style={[
              styles.sidebarLabel,
              selected && styles.sidebarLabelSelected,
              active && styles.sidebarLabelActive,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

function Chip({ label, selected, onPress }: CategoryItemProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      scaleOnFocus={false}
      accessibilityRole="radio"
      selected={selected}
      accessibilityLabel={label}
    >
      {

}
      <Text
        style={[styles.chipLabel, selected && styles.chipLabelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Focusable>
  );
}

const useStyles = makeStyles(m => ({
  sidebar: {
    width: m.sidebarWidth,
    paddingLeft: m.gutter.horizontal,
    paddingRight: spacing.md,
  },
  sidebarHeading: {
    ...m.typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  sidebarContent: {
    gap: spacing.xs,
    
    
    
    paddingBottom: m.gutter.vertical,
  },
  sidebarRow: {
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: m.minTouchTarget,
  },
  sidebarRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  selectionMarker: {
    width: 3,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  selectionMarkerActive: {
    backgroundColor: colors.accent,
  },
  sidebarLabel: {
    ...m.typography.body,
    color: colors.textMuted,
    flexShrink: 1,
  },
  sidebarLabelSelected: {
    color: colors.textPrimary,
  },
  sidebarLabelActive: {
    color: colors.accent,
  },
  rail: {
    
    
    flexGrow: 0,
    marginBottom: spacing.sm,
  },
  railContent: {
    paddingHorizontal: m.gutter.horizontal,
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    minHeight: m.minTouchTarget,
  },
  chipSelected: {
    backgroundColor: colors.accentMuted,
  },
  chipLabel: {
    ...m.typography.body,
    color: colors.textSecondary,
  },
  chipLabelSelected: {
    color: colors.accent,
  },
}));
