const randomPart = () => Math.random().toString(36).slice(2, 10);

/**
 * Identifiers.
 *
 * Deliberately not UUIDs: these never leave the device today, and a dependency
 * plus a crypto polyfill buys nothing over a time-ordered random string. Swap
 * `expo-crypto`'s randomUUID in here if the backend ever requires real UUIDs —
 * this is the only place that would change.
 */
export const createId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${randomPart()}`;

/**
 * Correlation ID: the thread that ties a user action to its API calls, its
 * processing steps and any error that results. Diagnostics groups on this.
 */
export const createCorrelationId = (): string => createId('cf');
