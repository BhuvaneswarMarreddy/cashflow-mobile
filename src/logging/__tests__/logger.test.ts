import { createFixedClock } from '@/utils/clock';

import { createLogger } from '../logger';
import { REDACTED } from '../redact';
import type { LogEntry, LogTransport } from '../types';

const collector = (): LogTransport & { entries: LogEntry[] } => {
  const entries: LogEntry[] = [];
  return { name: 'test', write: (entry) => entries.push(entry), entries };
};

describe('createLogger', () => {
  it('drops entries below the minimum level', () => {
    const sink = collector();
    const log = createLogger({ transports: [sink], minLevel: 'warn' });

    log.debug('ignored');
    log.info('ignored');
    log.warn('kept');
    log.error('kept');

    expect(sink.entries.map((entry) => entry.level)).toEqual(['warn', 'error']);
  });

  it('honours a runtime gate but never suppresses warnings and above', () => {
    const sink = collector();
    const log = createLogger({
      transports: [sink],
      // Mirrors the app logger: debug/info gated, warn and above always pass.
      isLevelEnabled: (level) => level === 'warn' || level === 'error' || level === 'critical',
    });

    log.debug('dropped');
    log.critical('kept');

    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]?.event).toBe('kept');
  });

  it('redacts metadata before it reaches a transport', () => {
    const sink = collector();
    const log = createLogger({ transports: [sink] });

    log.info('api.call', { metadata: { accessToken: 'abc', accountNumber: '000123456789' } });

    expect(sink.entries[0]?.metadata).toEqual({
      accessToken: REDACTED,
      accountNumber: REDACTED,
    });
  });

  it('carries child context onto every entry', () => {
    const sink = collector();
    const log = createLogger({ transports: [sink] }).child({
      category: 'api',
      screen: 'Home',
      correlationId: 'cf_1',
    });

    log.info('request');

    expect(sink.entries[0]).toMatchObject({
      category: 'api',
      screen: 'Home',
      correlationId: 'cf_1',
    });
  });

  it('uses the injected clock so timestamps are deterministic', () => {
    const sink = collector();
    const clock = createFixedClock(Date.parse('2026-08-09T10:00:00.000Z'));
    createLogger({ transports: [sink], clock }).info('tick');

    expect(sink.entries[0]?.timestamp).toBe('2026-08-09T10:00:00.000Z');
  });

  it('does not let a broken transport take down the caller', () => {
    const broken: LogTransport = {
      name: 'broken',
      write: () => {
        throw new Error('transport exploded');
      },
    };
    const good = collector();
    const log = createLogger({ transports: [broken, good] });

    expect(() => log.info('still works')).not.toThrow();
    expect(good.entries).toHaveLength(1);
  });

  it('records an error without keeping its stack', () => {
    const sink = collector();
    createLogger({ transports: [sink] }).error('failed', { error: new Error('kaboom') });

    expect(sink.entries[0]?.metadata?.error).toEqual({ name: 'Error', message: 'kaboom' });
  });
});
