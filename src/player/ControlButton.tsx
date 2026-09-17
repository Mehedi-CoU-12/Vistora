import React, { useCallback, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { PlayerIcon, type IconName } from './PlayerIcon';
import { resolvePlayerChrome, type PlayerChrome } from './playerLayout';















































export type ControlVariant = 'pill' | 'icon' | 'skip' | 'play';

interface ControlButtonProps {
  
  icon?: IconName;
  






  reserveIcon?: boolean;
  
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: ControlVariant;
  





  selected?: boolean;
  disabled?: boolean;
  
  hasTVPreferredFocus?: boolean;
  onFocusChange?: (focused: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

export function ControlButton({
  icon,
  reserveIcon = false,
  label,
  accessibilityLabel,
  onPress,
  variant = 'pill',
  selected = false,
  disabled = false,
  hasTVPreferredFocus = false,
  onFocusChange,
  style,
}: ControlButtonProps) {
  const styles = useStyles();
  const metrics = useMetrics();
  const chrome = resolvePlayerChrome(metrics);
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onFocusChange?.(false);
  }, [onFocusChange]);

  const round = variant !== 'pill';
  const diameter = roundDiameter(variant, chrome);

  







  const tint =
    focused || selected
      ? colors.accent
      : disabled
      ? colors.textSecondary
      : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      
      
      hitSlop={metrics.isTouch ? spacing.sm : undefined}
      style={({ pressed }) => [
        styles.base,
        variant === 'pill' ? styles.pill : styles.round,
        round && { width: diameter, height: diameter },
        selected && styles.selected,
        focused && styles.focused,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? (
          <PlayerIcon
            name={icon}
            size={iconSize(variant, chrome)}
            color={tint}
          />
        ) : reserveIcon ? (
          <View style={{ width: iconSize(variant, chrome) }} />
        ) : null}

        {label ? (
          <Text
            style={[styles.label, (focused || selected) && styles.textActive]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}







function roundDiameter(variant: ControlVariant, chrome: PlayerChrome): number {
  switch (variant) {
    case 'play':
      return chrome.playButton;
    case 'skip':
      return chrome.skipButton;
    default:
      return chrome.iconButton;
  }
}

function iconSize(variant: ControlVariant, chrome: PlayerChrome): number {
  switch (variant) {
    case 'play':
      return chrome.playGlyph;
    case 'skip':
      return chrome.skipGlyph;
    case 'icon':
      return chrome.iconGlyph;
    default:
      
      
      return chrome.glyphSize;
  }
}

const useStyles = makeStyles(metrics => {
  const chrome = resolvePlayerChrome(metrics);

  return {
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      
      
      
      
      borderWidth: 2,
      borderColor: colors.controlBorder,
      backgroundColor: colors.controlSurface,
    },
    pill: {
      minHeight: chrome.buttonHeight,
      paddingHorizontal: chrome.buttonPaddingH,
      borderRadius: radius.pill,
    },
    round: {
      borderRadius: radius.pill,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    label: {
      ...metrics.typography.body,
      color: colors.textPrimary,
    },
    textActive: {
      color: colors.accent,
    },
    selected: {
      backgroundColor: colors.controlSurfaceOn,
      borderColor: colors.accentMuted,
    },
    focused: {
      borderColor: colors.accent,
      backgroundColor: colors.controlSurfaceActive,
    },
    pressed: {
      
      
      backgroundColor: colors.controlSurfaceActive,
      transform: [{ scale: metrics.pressScale }],
    },
    disabled: {
      opacity: 0.45,
    },
  };
});
