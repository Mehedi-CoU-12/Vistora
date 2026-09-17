import React, { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { catalogTitleList } from '../navigation/tabs';
import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { Focusable } from './Focusable';
import { SearchIcon } from './SearchIcon';



































export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (next: string) => void;
  
  placeholder?: string;
}) {
  const { isTV, isTouch, typography } = useMetrics();
  const styles = useStyles();

  const [focused, setFocused] = useState(false);

  
  
  const hintSize = Math.round(typography.body.fontSize * 1.1);

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const clear = useCallback(() => onChangeText(''), [onChangeText]);

  







  const showClear = isTouch && value.length > 0;

  return (
    <View style={styles.row}>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        {


}
        <SearchIcon
          size={hintSize}
          color={focused ? colors.accent : colors.textMuted}
        />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder ?? `Search ${catalogTitleList()}…`}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          
          
          
          autoCorrect={false}
          autoCapitalize="none"
          
          
          
          returnKeyType="search"
          
          multiline={false}
          hasTVPreferredFocus={isTV}
          autoFocus={isTouch}
          accessibilityLabel="Search"
        />
      </View>

      {showClear ? (
        <Focusable
          onPress={clear}
          scaleOnFocus={false}
          style={styles.clear}
          accessibilityLabel="Clear search"
        >
          {active => (
            <Text
              style={[styles.clearLabel, active && styles.clearLabelActive]}
            >
              Clear
            </Text>
          )}
        </Focusable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(m => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: m.gutter.horizontal,
    paddingBottom: spacing.md,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    
    
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fieldFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceFocused,
  },
  input: {
    ...m.typography.body,
    color: colors.textPrimary,
    flex: 1,
    
    
    
    
    
    
    
    minHeight: m.isTV ? 56 : Math.max(m.minTouchTarget, 44),
    
    
    paddingVertical: 0,
  },
  clear: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    flexShrink: 0,
    minHeight: m.minTouchTarget,
    justifyContent: 'center',
  },
  clearLabel: {
    ...m.typography.caption,
    color: colors.accent,
  },
  clearLabelActive: {
    color: colors.textPrimary,
  },
}));
