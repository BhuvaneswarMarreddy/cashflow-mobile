import { loggerFor } from '@/logging';

import { normalizeError } from './AppError';

interface ReactNativeErrorUtils {
  getGlobalHandler(): ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

const errorUtils = (globalThis as { ErrorUtils?: ReactNativeErrorUtils }).ErrorUtils;

let installed = false;

/**
 * Last-resort handler for JS errors that escape every boundary.
 *
 * It records and then delegates to React Native's own handler, so LogBox in
 * development and the native crash reporter in a release build both still see
 * the error — swallowing it here would make a crash silent.
 *
 * Not covered: unhandled promise rejections. React Native installs its own
 * rejection tracking in development (LogBox shows them); in a release build the
 * app's async paths all funnel through `normalizeError`, so an unhandled
 * rejection means a missing catch, which is a bug to fix rather than to report.
 */
export const installGlobalErrorHandler = (): void => {
  if (installed || !errorUtils) return;
  installed = true;

  const log = loggerFor('app');
  const previous = errorUtils.getGlobalHandler();

  errorUtils.setGlobalHandler((error, isFatal) => {
    const appError = normalizeError(error);
    log.critical('app.uncaught_error', {
      message: appError.userMessage,
      metadata: { ...appError.toLogPayload(), isFatal: Boolean(isFatal) },
    });
    previous?.(error, isFatal);
  });
};
