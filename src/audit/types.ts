/**
 * System audit — "how did Cashflow arrive at this financial result?"
 *
 * A different question from interaction telemetry, and therefore a different
 * stream. This one exists so that when the app says *Safe to spend: $1,275* it
 * is possible to reconstruct which inputs, which stages and which decisions
 * produced that number.
 *
 * It stays on the device and is never sent to an analytics vendor. Once the
 * backend owns these calculations, most entries will arrive from the server and
 * this client stream will narrow to what the client itself computes.
 */

export type AuditStage =
  | 'refresh'
  | 'sync'
  | 'ingest'
  | 'normalize'
  | 'dedupe'
  | 'balance'
  | 'summary'
  | 'safe-to-spend'
  | 'change-detection'
  | 'notification'
  | 'validation';

export type AuditOutcome = 'started' | 'succeeded' | 'failed' | 'skipped';

export interface SystemAuditEntry {
  id: string;
  timestamp: string;
  stage: AuditStage;
  /** What was attempted: `accounts.fetch`, `balance.derive`, `duplicate.drop`. */
  action: string;
  outcome: AuditOutcome;
  /** Ties this step to the user action and API calls that caused it. */
  correlationId: string;
  durationMs?: number;
  /** Where the input came from: `mock`, `api`, `cache`, `manual`. */
  source?: string;
  /**
   * Safe metadata. Counts, durations, stage-level figures and reasons are all
   * appropriate here; raw account identifiers are not — the redaction layer
   * still runs over everything written.
   */
  metadata?: Record<string, unknown>;
  /** Present on `failed`. Category only, never a stack trace. */
  reason?: string;
}

export interface AuditSink {
  name: string;
  write(entry: SystemAuditEntry): void;
}
