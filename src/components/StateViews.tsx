import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { AppError } from '../services/errors';
import { colors, makeStyles, radius, spacing } from '../theme';
import { Focusable } from './Focusable';
import { TextButton } from './TextButton';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const styles = useStyles();

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
  action,
}: {
  title?: string;
  message?: string;
  /**
   * Optional thing to do about it -- usually "Reload", for the case where the
   * message just told you to go and add some content.
   *
   * It earns its place on a TV for a second reason: an empty screen with no
   * focusable element on it leaves the D-pad with nothing to move to, so the
   * remote appears to stop working until the user thinks to press UP into the
   * tab bar. A button is somewhere for focus to be.
   */
  action?: { label: string; onPress: () => void };
}) {
  const styles = useStyles();

  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? (
        <View style={styles.action}>
          {/* Claims focus for the same reason ErrorState's Retry does: it is
              the only focusable thing on the screen, so if it does not take
              focus the remote appears dead until the user guesses to press UP
              into the tab bar. Exactly one empty state with an action is ever
              mounted at a time -- a catalog shows either this or its
              per-category message, never both. */}
          <TextButton
            label={action.label}
            onPress={action.onPress}
            hasTVPreferredFocus
          />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: AppError;
  onRetry?: () => void;
}) {
  const styles = useStyles();

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
          accessibilityLabel="Try again"
        >
          {active => (
            <Text
              style={[styles.buttonLabel, active && styles.buttonLabelActive]}
            >
              Try again
            </Text>
          )}
        </Focusable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(m => ({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // The screen gutter plus a little, rather than a fixed inset: 48dp a side is
    // a comfortable margin on a TV and leaves a phone about 290dp for a
    // paragraph of setup instructions.
    paddingHorizontal: m.gutter.horizontal + spacing.sm,
    gap: spacing.md,
  },
  title: {
    ...m.typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...m.typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 620,
  },
  action: {
    marginTop: spacing.sm,
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
    minHeight: m.minTouchTarget,
    justifyContent: 'center',
  },
  buttonLabel: {
    ...m.typography.body,
    color: colors.textPrimary,
  },
  buttonLabelActive: {
    color: colors.accent,
  },
}));
