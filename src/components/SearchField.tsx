import React, { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { Focusable } from './Focusable';
import { SearchIcon } from './SearchIcon';

/**
 * The text field at the top of the search screen.
 *
 * ---------------------------------------------------------------------------
 * Why this is not wrapped in `Focusable`
 * ---------------------------------------------------------------------------
 * Every other interactive element in the app is a `Focusable`, which is a
 * `Pressable` underneath. A text field cannot be: the `Pressable` would be the
 * focusable view, so the D-pad would land on the wrapper and the `TextInput`
 * inside it would never receive the keystrokes.
 *
 * So this component reimplements the one thing `Focusable` gives it -- the
 * active treatment -- driven by the field's own focus events. It deliberately
 * matches `Focusable`'s ring exactly (2dp accent border, lighter surface) rather
 * than inventing a second idiom, because on a TV the ring is the only thing that
 * says where the remote is, and a field that highlighted differently from a card
 * would read as a different kind of thing.
 *
 * It also keeps `Focusable`'s trick of a transparent border at rest, so becoming
 * focused does not change the field's height and shove the results down.
 *
 * ---------------------------------------------------------------------------
 * Claiming focus: the field, not the keyboard
 * ---------------------------------------------------------------------------
 * On a TV the field takes `hasTVPreferredFocus`, which gives it native D-pad
 * focus WITHOUT opening the on-screen keyboard -- the leanback IME appears when
 * the user presses OK, which is what they expect and, importantly, leaves the
 * results visible while they browse them.
 *
 * `autoFocus` would be wrong there for exactly that reason (it calls `.focus()`,
 * which opens the IME over the whole screen), and is right on a phone, where
 * opening a search screen and then having to tap the field is a wasted tap.
 * Hence the two props rather than one.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search channels, films, anime…',
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}) {
  const { isTV, isTouch, typography } = useMetrics();
  const styles = useStyles();

  const [focused, setFocused] = useState(false);

  // Sized against the text it sits beside, so the icon and the value the user
  // is typing read as one line rather than as a badge and a field.
  const hintSize = Math.round(typography.body.fontSize * 1.1);

  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const clear = useCallback(() => onChangeText(''), [onChangeText]);

  /**
   * Clear is touch-only, the same trade `ContentRow` makes for "See all".
   *
   * On a phone it saves holding backspace down. On a TV it would be a permanent
   * focus stop between the field and the results -- press DOWN from the field
   * and you would land on a button rather than on the first result -- and it
   * would buy nothing, because the remote's own IME has a delete key.
   */
  const showClear = isTouch && value.length > 0;

  return (
    <View style={styles.row}>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        {/* Tinted with the focus state rather than a fixed muted grey, so the
            icon is a fourth cue that the remote is in the field -- alongside the
            ring, the lighter surface and the caret. It is hidden from TalkBack
            because the TextInput beside it already announces "Search". */}
        <SearchIcon
          size={hintSize}
          color={focused ? colors.accent : colors.textMuted}
        />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          // Nothing being searched for here is a proper noun the platform can
          // help with, and autocorrect on a partial title actively fights the
          // user -- "kubo" becomes "kudos" and the results empty out.
          autoCorrect={false}
          autoCapitalize="none"
          // The IME's action key closes the keyboard rather than submitting:
          // results are already live by the time it is pressed, since the query
          // runs on a debounce rather than on submit.
          returnKeyType="search"
          // Single line, so the field cannot grow and push the results around.
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
    // Matches Focusable: a transparent border at rest, so focus does not resize
    // the field.
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
    // A TextInput's intrinsic height is the font's, which is a 20dp target. The
    // metric is 0 on TV, where the field is sized by its padding instead, so the
    // larger of the two is what each device actually wants.
    minHeight: Math.max(m.minTouchTarget, 44),
    // Android centres single-line text vertically only if the padding it adds by
    // default is removed first.
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
