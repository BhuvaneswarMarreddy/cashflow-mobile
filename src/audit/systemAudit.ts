import { isEnabled } from '@/config/featureFlags';
import { redactMetadata } from '@/logging';
import { systemClock, type Clock } from '@/utils/clock';
import { createId } from '@/utils/id';
import { createStreamStore } from '@/utils/streamStore';

import type { AuditOutcome, AuditSink, AuditStage, SystemAuditEntry } from './types';

export const AUDIT_BUFFER_SIZE = 200;

/** On-device buffer that backs the Diagnostics screen. */
export const useAuditStream = createStreamStore<SystemAuditEntry>(AUDIT_BUFFER_SIZE);

const streamSink: AuditSink = {
  name: 'memory',
  write: (entry) => useAuditStream.getState().push(entry),
};

export interface StageOptions {
  correlationId: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

/**
 * A stage in flight. Created by `begin`, closed exactly once — the duration is
 * measured for you, which is the whole reason the handle exists rather than two
 * unrelated `record` calls that can silently drift apart.
 */
export interface StageHandle {
  succeeded(metadata?: Record<string, unknown>): void;
  failed(reason: string, metadata?: Record<string, unknown>): void;
  skipped(reason: string, metadata?: Record<string, unknown>): void;
}

export interface SystemAudit {
  record(
    stage: AuditStage,
    action: string,
    outcome: AuditOutcome,
    options: StageOptions & { durationMs?: number; reason?: string },
  ): void;
  begin(stage: AuditStage, action: string, options: StageOptions): StageHandle;
}

export interface SystemAuditOptions {
  sinks?: AuditSink[];
  clock?: Clock;
  isAuditEnabled?: () => boolean;
}

export const createSystemAudit = (options: SystemAuditOptions = {}): SystemAudit => {
  const clock = options.clock ?? systemClock;
  const sinks = options.sinks ?? [streamSink];
  const enabled = options.isAuditEnabled ?? (() => isEnabled('ENABLE_SYSTEM_AUDIT'));

  const write = (entry: SystemAuditEntry): void => {
    if (!enabled()) return;
    for (const sink of sinks) {
      try {
        sink.write(entry);
      } catch {
        // Never let the audit trail break the calculation it is describing.
      }
    }
  };

  const record: SystemAudit['record'] = (stage, action, outcome, opts) => {
    write({
      id: createId('aud'),
      timestamp: clock.iso(),
      stage,
      action,
      outcome,
      correlationId: opts.correlationId,
      ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
      ...(opts.source !== undefined ? { source: opts.source } : {}),
      ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
      ...(opts.metadata !== undefined
        ? { metadata: redactMetadata(opts.metadata) as Record<string, unknown> }
        : {}),
    });
  };

  return {
    record,
    begin: (stage, action, opts) => {
      const startedAt = clock.now();
      record(stage, action, 'started', opts);
      let closed = false;

      const close = (
        outcome: Exclude<AuditOutcome, 'started'>,
        reason: string | undefined,
        metadata: Record<string, unknown> | undefined,
      ): void => {
        if (closed) return;
        closed = true;
        record(stage, action, outcome, {
          ...opts,
          durationMs: clock.now() - startedAt,
          ...(reason !== undefined ? { reason } : {}),
          ...(metadata !== undefined ? { metadata: { ...opts.metadata, ...metadata } } : {}),
        });
      };

      return {
        succeeded: (metadata) => close('succeeded', undefined, metadata),
        failed: (reason, metadata) => close('failed', reason, metadata),
        skipped: (reason, metadata) => close('skipped', reason, metadata),
      };
    },
  };
};

export const systemAudit = createSystemAudit();
