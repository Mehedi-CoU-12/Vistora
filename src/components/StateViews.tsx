import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {AppError} from '../services/errors';
import {colors, radius, spacing, typography} from '../theme';
import {Focusable} from './Focusable';

/**
 * The loading / error / empty states, in one file so they stay visually
 * consistent. On a TV these matter more than on a phone: a stalled screen with
 * no explanation gives the viewer nothing to do, since they cannot pull to
 * refresh or tap around to investigate. Every error state here ends in either a
 * focusable Retry button or a concrete instruction.
 */

export function LoadingState({label = 'Loading…'}: {label?: string}) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.message}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  message,
}: {
  title?: string;
  message?: string;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

export function ErrorState({error, onRetry}: {error: AppError; onRetry?: () => void}) {
  // A missing or wrong .env cannot be fixed by pressing a button, so we show
  // the setup steps instead of a Retry that would fail identically.
  const isSetupProblem = error.kind === 'config';

  return (
    <View style={styles.center}>
      <Text style={styles.title}>
        {isSetupProblem ? 'Finish setting up Vistora' : 'Something went wrong'}
      </Text>

      <Text style={[styles.message, isSetupProblem && styles.mono]}>
        {error.userMessage}
      </Text>

      {error.retryable && onRetry ? (
        <Focusable
          onPress={onRetry}
          hasTVPreferredFocus
          style={styles.button}
          accessibilityLabel="Try again">
          {focused => (
            <Text style={[styles.buttonLabel, focused && styles.buttonLabelFocused]}>
              Try again
            </Text>
          )}
        </Focusable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 620,
  },
  mono: {
    // Setup instructions contain shell commands, which are unreadable when
    // proportionally spaced.
    fontFamily: 'monospace',
    textAlign: 'left',
    color: colors.textPrimary,
  },
  button: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  buttonLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  buttonLabelFocused: {
    color: colors.accent,
  },
});
