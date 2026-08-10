import { createStreamStore } from '@/utils/streamStore';

import type { LogEntry, LogTransport } from './types';

/** Capacity chosen so a long session still fits on one Diagnostics screen. */
export const LOG_BUFFER_SIZE = 300;

/** On-device buffer that backs the Diagnostics screen. */
export const useLogStream = createStreamStore<LogEntry>(LOG_BUFFER_SIZE);

export const memoryTransport: LogTransport = {
  name: 'memory',
  write: (entry) => useLogStream.getState().push(entry),
};

const LEVEL_TAG: Record<LogEntry['level'], string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
  critical: 'CRT',
};

const timeOf = (iso: string) => iso.slice(11, 23);

/**
 * Readable console output for development.
 *
 * Entries reaching a transport are already redacted, so this can print metadata
 * verbatim.
 */
export const consoleTransport: LogTransport = {
  name: 'console',
  write: (entry) => {
    const head = `${timeOf(entry.timestamp)} ${LEVEL_TAG[entry.level]} ${entry.category} ▸ ${entry.event}`;
    const tail = [
      entry.screen ? `@${entry.screen}` : '',
      entry.correlationId ? `#${entry.correlationId}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const line = tail ? `${head}  ${tail}` : head;
    const payload = entry.message
      ? { message: entry.message, ...entry.metadata }
      : (entry.metadata ?? '');

    if (entry.level === 'error' || entry.level === 'critical') console.error(line, payload);
    else if (entry.level === 'warn') console.warn(line, payload);
    else console.log(line, payload);
  },
};
