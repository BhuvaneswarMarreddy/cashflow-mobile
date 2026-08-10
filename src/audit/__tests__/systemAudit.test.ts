import { createFixedClock } from '@/utils/clock';

import { createSystemAudit } from '../systemAudit';
import type { AuditSink, SystemAuditEntry } from '../types';

const collector = (): AuditSink & { entries: SystemAuditEntry[] } => {
  const entries: SystemAuditEntry[] = [];
  return { name: 'test', write: (entry) => entries.push(entry), entries };
};

describe('systemAudit', () => {
  it('records a started/succeeded pair with a measured duration', () => {
    const sink = collector();
    const clock = createFixedClock(1_000);
    const audit = createSystemAudit({ sinks: [sink], clock, isAuditEnabled: () => true });

    const stage = audit.begin('balance', 'balance.derive', {
      correlationId: 'cf_1',
      source: 'mock',
    });
    clock.advance(42);
    stage.succeeded({ accounts: 4 });

    expect(sink.entries.map((entry) => entry.outcome)).toEqual(['started', 'succeeded']);
    expect(sink.entries[1]?.durationMs).toBe(42);
    expect(sink.entries[1]?.metadata).toEqual({ accounts: 4 });
  });

  it('keeps the correlation ID across both halves of a stage', () => {
    const sink = collector();
    const audit = createSystemAudit({ sinks: [sink], isAuditEnabled: () => true });

    audit.begin('refresh', 'financial.refresh', { correlationId: 'cf_trace' }).failed('TIMEOUT');

    expect(sink.entries.every((entry) => entry.correlationId === 'cf_trace')).toBe(true);
    expect(sink.entries[1]?.reason).toBe('TIMEOUT');
  });

  it('closes a stage exactly once', () => {
    const sink = collector();
    const audit = createSystemAudit({ sinks: [sink], isAuditEnabled: () => true });

    const stage = audit.begin('sync', 'accounts.fetch', { correlationId: 'cf_2' });
    stage.succeeded();
    stage.failed('too late');

    expect(sink.entries).toHaveLength(2);
    expect(sink.entries[1]?.outcome).toBe('succeeded');
  });

  it('writes nothing when auditing is disabled', () => {
    const sink = collector();
    const audit = createSystemAudit({ sinks: [sink], isAuditEnabled: () => false });

    audit.begin('summary', 'summary.build', { correlationId: 'cf_3' }).succeeded();

    expect(sink.entries).toHaveLength(0);
  });

  it('redacts metadata before storing it', () => {
    const sink = collector();
    const audit = createSystemAudit({ sinks: [sink], isAuditEnabled: () => true });

    audit.record('ingest', 'row.normalise', 'succeeded', {
      correlationId: 'cf_4',
      metadata: { accountNumber: '000123456789', rows: 12 },
    });

    expect(sink.entries[0]?.metadata).toEqual({ accountNumber: '[redacted]', rows: 12 });
  });

  it('never lets a failing sink break the calculation being audited', () => {
    const audit = createSystemAudit({
      sinks: [
        {
          name: 'broken',
          write: () => {
            throw new Error('sink down');
          },
        },
      ],
      isAuditEnabled: () => true,
    });

    expect(() => audit.begin('balance', 'x', { correlationId: 'cf_5' }).succeeded()).not.toThrow();
  });
});
