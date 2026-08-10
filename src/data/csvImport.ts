import { httpsCallable } from '@firebase/functions';

import { AppError } from '@/errors';
import { loggerFor } from '@/logging';
import { firebaseFunctions, isFirebaseConfigured } from '@/services/firebase';

/**
 * Hands a statement file to the server's importer.
 *
 * The phone does not parse the CSV. `importCsv` runs the *same*
 * `src/lib/csv-import.ts` the web modal runs, so one file produces one ledger
 * whichever client uploaded it — the sign conventions alone (Amex and Discover
 * post charges positive, everyone else negative) are not worth implementing
 * twice.
 *
 * This is the only route to an Apple Card, which no aggregator reaches.
 */

const log = loggerFor('data');

export interface ImportResult {
  parsed: number;
  imported: number;
  enriched: number;
  unchanged: number;
  skipped: number;
  invalid: number;
  createdAccounts: string[];
}

/**
 * Callables send JSON, so the file travels as a string. 8MB is the server's
 * ceiling; checked here too so an oversized file fails before the upload
 * rather than after it.
 */
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export const importCsv = async (content: string, filename: string): Promise<ImportResult> => {
  if (!isFirebaseConfigured()) {
    throw new AppError({
      category: 'service-unavailable',
      code: 'FIREBASE_NOT_CONFIGURED',
      userMessage: 'Cashflow is not connected yet.',
      technicalMessage: 'EXPO_PUBLIC_FIREBASE_* missing',
      retryable: false,
    });
  }

  const callable = httpsCallable<{ content: string; filename: string }, ImportResult>(
    firebaseFunctions(),
    'importCsv',
  );

  const started = Date.now();
  try {
    const { data } = await callable({ content, filename });
    // Counts only. The file's contents are the owner's entire spending history
    // and must never reach a log line.
    log.info('csv.imported', {
      metadata: {
        durationMs: Date.now() - started,
        parsed: data.parsed,
        imported: data.imported,
        enriched: data.enriched,
      },
    });
    return data;
  } catch (error) {
    const code = (error as { code?: string })?.code ?? 'unknown';
    log.warn('csv.import_failed', { metadata: { code } });
    throw new AppError({
      // `invalid-argument` is the server telling us the FILE is wrong, which is
      // something the user can act on; anything else is ours to fix.
      category: code.includes('invalid-argument') ? 'validation' : 'data',
      code: String(code).toUpperCase(),
      // The server's own words ONLY when it is telling us the FILE is wrong —
      // those are actionable. Anything else is an internal code like "INTERNAL",
      // which is not a sentence and not something the owner can act on.
      userMessage: String(code).includes('invalid-argument')
        ? ((error as { message?: string })?.message ?? "Cashflow couldn't read that file.")
        : "Cashflow couldn't import that file. Nothing was changed.",
      technicalMessage: (error as { message?: string })?.message ?? String(code),
      retryable: false,
      cause: error,
    });
  }
};
