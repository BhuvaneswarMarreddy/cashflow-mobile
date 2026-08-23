import { isDevelopment } from '@/config/env';

/**
 * One error model for the whole app.
 *
 * Screens render `error.userMessage` and never a raw message from an API, a
 * parser or a native module: those leak implementation detail, occasionally
 * leak data, and are never actionable for the person holding the phone. The
 * technical detail survives on `technicalMessage` for logs and Diagnostics.
 */
export type ErrorCategory =
  | 'network'
  | 'authentication'
  | 'validation'
  | 'data'
  | 'permission'
  | 'service-unavailable'
  | 'user-action'
  | 'unexpected';

/** Calm, specific, non-technical. Shown to the user verbatim. */
const USER_MESSAGE: Record<ErrorCategory, string> = {
  network: "Cashflow can't reach the network right now.",
  authentication: 'Your session has expired. Sign in again to continue.',
  validation: "Some of that information didn't look right.",
  data: "Cashflow received information it couldn't read.",
  permission: 'Cashflow needs permission from this device to do that.',
  'service-unavailable': 'Cashflow is temporarily unavailable. Nothing was changed.',
  'user-action': "That didn't go through. Check the details and try again.",
  unexpected: 'Something went wrong. Nothing was changed.',
};

/** What the user can usefully do next. Drives the button on ErrorState. */
const RETRYABLE: Record<ErrorCategory, boolean> = {
  network: true,
  authentication: false,
  validation: false,
  data: false,
  permission: false,
  'service-unavailable': true,
  'user-action': true,
  unexpected: true,
};

export interface AppErrorOptions {
  category: ErrorCategory;
  /** Machine-readable, e.g. `HTTP_503`, `TIMEOUT`, `SCHEMA_MISMATCH`. */
  code?: string;
  /** Overrides the category default when a screen can say something better. */
  userMessage?: string;
  technicalMessage?: string;
  retryable?: boolean;
  correlationId?: string;
  cause?: unknown;
  metadata?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly userMessage: string;
  readonly technicalMessage: string;
  readonly retryable: boolean;
  readonly correlationId: string | undefined;
  readonly metadata: Record<string, unknown> | undefined;

  constructor(options: AppErrorOptions) {
    const technical = options.technicalMessage ?? options.code ?? options.category;
    super(technical);
    this.name = 'AppError';
    this.category = options.category;
    this.code = options.code ?? options.category.toUpperCase().replace(/-/g, '_');
    this.userMessage = options.userMessage ?? USER_MESSAGE[options.category];
    this.technicalMessage = technical;
    this.retryable = options.retryable ?? RETRYABLE[options.category];
    this.correlationId = options.correlationId;
    this.metadata = options.metadata;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /** Safe to hand to the logger or render in Diagnostics. */
  toLogPayload(): Record<string, unknown> {
    return {
      category: this.category,
      code: this.code,
      retryable: this.retryable,
      ...(this.correlationId !== undefined ? { correlationId: this.correlationId } : {}),
      // The technical message can carry API text, so it is only surfaced in
      // development builds; the redaction layer still runs over it.
      ...(isDevelopment ? { technicalMessage: this.technicalMessage } : {}),
      ...(this.metadata !== undefined ? { metadata: this.metadata } : {}),
    };
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;

const categoryFromNativeError = (error: Error): ErrorCategory => {
  const message = error.message.toLowerCase();
  if (error.name === 'AbortError' || message.includes('aborted')) return 'network';
  if (message.includes('network request failed') || message.includes('timeout')) return 'network';
  if (error instanceof SyntaxError) return 'data';
  return 'unexpected';
};

/**
 * Turns anything thrown anywhere into an AppError. Every catch block in the app
 * routes through this, which is what makes "no raw errors reach the UI" a
 * property rather than a convention.
 */
export const normalizeError = (error: unknown, correlationId?: string): AppError => {
  if (isAppError(error)) {
    if (correlationId !== undefined && error.correlationId === undefined) {
      return new AppError({
        category: error.category,
        code: error.code,
        userMessage: error.userMessage,
        technicalMessage: error.technicalMessage,
        retryable: error.retryable,
        correlationId,
        cause: error.cause,
        ...(error.metadata !== undefined ? { metadata: error.metadata } : {}),
      });
    }
    return error;
  }

  if (error instanceof Error) {
    return new AppError({
      category: categoryFromNativeError(error),
      code: error.name.toUpperCase(),
      technicalMessage: error.message,
      cause: error,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }

  return new AppError({
    category: 'unexpected',
    technicalMessage: typeof error === 'string' ? error : 'Non-error value thrown',
    cause: error,
    ...(correlationId !== undefined ? { correlationId } : {}),
  });
};

/** HTTP status → category. Used by the API client's error normalization. */
export const categoryForStatus = (status: number): ErrorCategory => {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 404) return 'data';
  if (status === 408 || status === 429) return 'service-unavailable';
  if (status >= 400 && status < 500) return 'validation';
  if (status >= 500) return 'service-unavailable';
  return 'unexpected';
};

/**
 * Firebase Cloud Functions callables ALWAYS prefix their error code with
 * `functions/` (`@firebase/functions`: `super(\`${FUNCTIONS_TYPE}/${code}\`, ...)`)
 * — `error.code` on an `aiChat`/`applyDecision`/etc. rejection is
 * `'functions/resource-exhausted'`, never the bare `'resource-exhausted'`.
 * Firestore's own `FirestoreError` never carries a prefix. Stripping it once,
 * here, means every caller below compares the same bare, standard code
 * regardless of which transport produced it — a bare-string comparison
 * against a Callable code can never match and silently dead-code the branch.
 */
const stripFunctionsPrefix = (code: string): string => code.replace(/^functions\//, '');

export interface ErrorFacets {
  category: ErrorCategory;
  retryable: boolean;
}

/**
 * Maps a raw Firebase error code (Callable or Firestore, prefixed or not) to
 * the category/retryable pair every write site — and the chat mapper — should
 * agree on. The single place that answers "is retrying this exact request
 * worth offering": `invalid-argument` (a malformed request) and `not-found`
 * (the thing is already gone) never are, no matter how many times the
 * identical request is replayed. Anything unrecognised keeps today's generic
 * "might be transient" default.
 */
export const errorFacetsFor = (code: string | undefined): ErrorFacets => {
  switch (stripFunctionsPrefix(code ?? '')) {
    case 'invalid-argument':
      return { category: 'validation', retryable: false };
    case 'not-found':
      return { category: 'data', retryable: false };
    case 'unauthenticated':
      return { category: 'authentication', retryable: false };
    case 'resource-exhausted':
    case 'unavailable':
      return { category: 'service-unavailable', retryable: false };
    default:
      return { category: 'data', retryable: true };
  }
};

export { stripFunctionsPrefix };
