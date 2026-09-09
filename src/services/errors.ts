/**
 * One error type for the whole data layer, so screens have a single, small
 * thing to render. `kind` decides whether the UI offers a Retry button (there is
 * no point retrying a missing `.env`).
 */
export type AppErrorKind = 'config' | 'network' | 'notFound' | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** What the user sees. Complete sentences, no error codes. */
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(kind: AppErrorKind, userMessage: string, cause?: unknown) {
    super(userMessage, cause === undefined ? undefined : {cause});
    this.name = 'AppError';
    this.kind = kind;
    this.userMessage = userMessage;
    this.retryable = kind === 'network' || kind === 'unknown';
  }
}

/** Narrows anything thrown into something renderable. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  // supabase-js surfaces a failed fetch as a bare TypeError. On a TV this is
  // nearly always Wi-Fi or a wrong SUPABASE_URL, so say that rather than
  // showing "Network request failed".
  if (/network request failed|fetch failed|failed to fetch/i.test(message)) {
    return new AppError(
      'network',
      "Can't reach the server. Check this device's internet connection, then try again.",
      error,
    );
  }

  return new AppError('unknown', 'Something went wrong loading this content.', error);
}
