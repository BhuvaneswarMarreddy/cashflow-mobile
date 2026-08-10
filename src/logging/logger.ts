import { isEnabled } from '@/config/featureFlags';
import { systemClock, type Clock } from '@/utils/clock';
import { createId } from '@/utils/id';

import { redact, redactMetadata } from './redact';
import { consoleTransport, memoryTransport } from './transports';
import {
  LOG_LEVEL_WEIGHT,
  type LogCategory,
  type LogDetails,
  type LogEntry,
  type Logger,
  type LoggerContext,
  type LogLevel,
  type LogTransport,
} from './types';

export interface LoggerOptions {
  transports: LogTransport[];
  clock?: Clock;
  /** Entries below this level are dropped before reaching any transport. */
  minLevel?: LogLevel;
  /**
   * Extra gate evaluated per entry. The app logger uses it so the
   * ENABLE_DEBUG_LOGGING flag can be toggled at runtime from Settings without
   * rebuilding the logger.
   */
  isLevelEnabled?: (level: LogLevel) => boolean;
}

export const createLogger = (options: LoggerOptions, context: LoggerContext = {}): Logger => {
  const clock = options.clock ?? systemClock;
  const minWeight = LOG_LEVEL_WEIGHT[options.minLevel ?? 'debug'];

  const emit = (level: LogLevel, event: string, details: LogDetails = {}): void => {
    if (LOG_LEVEL_WEIGHT[level] < minWeight) return;
    if (options.isLevelEnabled && !options.isLevelEnabled(level)) return;

    const metadata = { ...details.metadata };
    if (details.error !== undefined) metadata.error = redact(details.error);

    const entry: LogEntry = {
      id: createId('log'),
      timestamp: clock.iso(),
      level,
      category: context.category ?? 'app',
      event,
      ...(details.message !== undefined ? { message: details.message } : {}),
      ...((details.screen ?? context.screen) ? { screen: details.screen ?? context.screen } : {}),
      ...((details.correlationId ?? context.correlationId)
        ? { correlationId: details.correlationId ?? context.correlationId }
        : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata: redactMetadata(metadata) } : {}),
    };

    for (const transport of options.transports) {
      try {
        transport.write(entry);
      } catch {
        // A failing transport must never take down the caller. Nothing to log
        // it to, by definition.
      }
    }
  };

  return {
    debug: (event, details) => emit('debug', event, details),
    info: (event, details) => emit('info', event, details),
    warn: (event, details) => emit('warn', event, details),
    error: (event, details) => emit('error', event, details),
    critical: (event, details) => emit('critical', event, details),
    child: (childContext) => createLogger(options, { ...context, ...childContext }),
  };
};

/**
 * The app logger.
 *
 * `debug` is gated on the runtime flag; warn and above always pass, because a
 * user who turned verbose logging off still deserves a diagnosable crash.
 */
export const logger = createLogger({
  transports: [memoryTransport, consoleTransport],
  isLevelEnabled: (level) =>
    LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT.warn || isEnabled('ENABLE_DEBUG_LOGGING'),
});

/** Convenience: `loggerFor('api')` instead of repeating the category. */
export const loggerFor = (category: LogCategory, context: LoggerContext = {}): Logger =>
  logger.child({ category, ...context });
