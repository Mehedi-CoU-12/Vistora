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
  








  action?: { label: string; onPress: () => void };
}) {
  const styles = useStyles();

  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? (
        <View style={styles.action}>
          {




}
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
