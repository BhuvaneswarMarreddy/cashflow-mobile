export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'critical'];

export const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  critical: 50,
};

/**
 * Log categories are a closed set so Diagnostics can filter on them and so two
 * parts of the app never spell the same concern differently.
 */
export type LogCategory =
  | 'app'
  | 'navigation'
  | 'api'
  | 'auth'
  | 'data'
  | 'refresh'
  | 'notifications'
  | 'storage'
  | 'network'
  | 'ui';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  /** Dotted, stable, machine-groupable: `refresh.completed`. */
  event: string;
  /** Human sentence, optional — the event name is the primary key. */
  message?: string;
  screen?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface LogDetails {
  message?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  screen?: string;
  /** Attached as redacted `name`/`message`; stack stays out of the entry. */
  error?: unknown;
}

/**
 * Where entries go. Console and on-device memory today; a real transport
 * (Sentry, Datadog, a self-hosted collector) implements the same two members
 * and gets registered in `src/logging/logger.ts` — no call site changes.
 */
export interface LogTransport {
  name: string;
  write(entry: LogEntry): void;
}

export interface LoggerContext {
  category?: LogCategory;
  screen?: string;
  correlationId?: string;
}

export interface Logger {
  debug(event: string, details?: LogDetails): void;
  info(event: string, details?: LogDetails): void;
  warn(event: string, details?: LogDetails): void;
  error(event: string, details?: LogDetails): void;
  critical(event: string, details?: LogDetails): void;
  /** Returns a logger with context pre-bound (a screen, a correlation ID). */
  child(context: LoggerContext): Logger;
}
