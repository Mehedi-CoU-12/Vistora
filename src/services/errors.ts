export type AppErrorKind = 'config' | 'network' | 'notFound' | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;

  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(kind: AppErrorKind, userMessage: string, cause?: unknown) {
    super(userMessage, cause === undefined ? undefined : { cause });
    this.name = 'AppError';
    this.kind = kind;
    this.userMessage = userMessage;
    this.retryable = kind === 'network' || kind === 'unknown';
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/network request failed|fetch failed|failed to fetch/i.test(message)) {
    return new AppError(
      'network',
      "Can't reach the server. Check this device's internet connection, then try again.",
      error,
    );
  }

  return new AppError(
    'unknown',
    'Something went wrong loading this content.',
    error,
  );
}
