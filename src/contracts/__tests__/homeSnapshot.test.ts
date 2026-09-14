import { httpsCallable } from '@firebase/functions';

import { createFirebaseRepositories, type SnapshotPayload } from '@/data/firebaseRepositories';
import type {
  AccountKind,
  AccountStatus,
  BillFrequency,
  Paycheck,
  TransactionKind,
  UpcomingPaymentKind,
} from '@/types';

import sample from '../homeSnapshot.json';

/**
 * The wire contract with cashflow-forecast's `homeSnapshot`.
 *
 * `../homeSnapshot.json` is recorded by the SERVER's own test
 * (`functions/src/__tests__/contract-homeSnapshot.test.ts`), not written by
 * hand. CI replaces it with the copy on cashflow-forecast's main before this
 * runs, and the server's CI runs this file against its own branch before it
 * deploys — so a server change the phone cannot read fails on both sides.
 *
 * Two halves: `npm run typecheck` proves the shape, this suite proves the
 * values the types cannot see (closed string sets, integer cents).
 */

/** JSON imports widen string literals to `string`; compare everything else. */
type Wire<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

// Fails `tsc` when the server renames, drops or retypes a field the phone reads.
const wire: Wire<SnapshotPayload> = sample;

// `Record<Union, true>` fails `tsc` if the phone's union gains or loses a member
// without this list following, so the runtime checks below stay complete.
const ACCOUNT_KINDS: Record<AccountKind, true> = {
  checking: true, savings: true, 'credit-card': true, investment: true, loan: true, cash: true,
};
const ACCOUNT_STATUSES: Record<AccountStatus, true> = { ok: true, stale: true, error: true };
const TRANSACTION_KINDS: Record<TransactionKind, true> = {
  purchase: true, income: true, transfer: true, refund: true, fee: true,
};
const UPCOMING_KINDS: Record<UpcomingPaymentKind, true> = {
  bill: true, subscription: true, loan: true, 'card-payment': true,
};
const BILL_FREQUENCIES: Record<BillFrequency, true> = {
  weekly: true, biweekly: true, monthly: true, quarterly: true, semiannual: true, annual: true,
};
const CONFIDENCES: Record<Paycheck['confidence'], true> = { confirmed: true, estimated: true };

const member = (set: Record<string, true>, value: string) => [value, set[value] === true];

/** Every `...Cents` key anywhere in the payload, with its path. */
const centsFields = (value: unknown, path = ''): [string, unknown][] => {
  if (Array.isArray(value)) return value.flatMap((v, i) => centsFields(v, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, v]) => [
    ...(key.endsWith('Cents') ? [[`${path}.${key}`, v] as [string, unknown]] : []),
    ...centsFields(v, `${path}.${key}`),
  ]);
};

jest.mock('@firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('@/services/firebase', () => ({
  firebaseFunctions: jest.fn(() => ({})),
  isFirebaseConfigured: jest.fn(() => true),
}));

beforeEach(() => {
  (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockResolvedValue({ data: wire }));
});

describe('homeSnapshot contract (recorded by cashflow-forecast)', () => {
  it('uses only values the phone knows how to render', () => {
    for (const a of wire.accounts) {
      expect(member(ACCOUNT_KINDS, a.kind)).toEqual([a.kind, true]);
      expect(member(ACCOUNT_STATUSES, a.status)).toEqual([a.status, true]);
    }
    for (const t of wire.activity) expect(member(TRANSACTION_KINDS, t.kind)).toEqual([t.kind, true]);
    for (const u of wire.upcoming) expect(member(UPCOMING_KINDS, u.kind)).toEqual([u.kind, true]);
    for (const b of wire.bills) expect(member(BILL_FREQUENCIES, b.frequency)).toEqual([b.frequency, true]);
    const { nextPaycheck } = wire.snapshot;
    if (nextPaycheck) {
      expect(member(CONFIDENCES, nextPaycheck.confidence)).toEqual([nextPaycheck.confidence, true]);
    }
  });

  it('sends money as integer cents or null, never a float', () => {
    const fields = centsFields(wire);
    expect(fields.length).toBeGreaterThan(0);
    const bad = fields.filter(([, v]) => !(v === null || Number.isInteger(v)));
    expect(bad).toEqual([]);
  });

  it('maps through the real repositories without losing a figure', async () => {
    const repos = createFirebaseRepositories();
    const { snapshot } = await repos.snapshot.current();

    expect(snapshot.generatedAt).toBe(wire.generatedAt);
    expect(snapshot.cashCents).toBe(wire.snapshot.cashCents);
    expect(snapshot.runway.label).toBe(wire.snapshot.runway.label);
    expect(snapshot.assumedMonthlySpendCents).toBe(
      wire.snapshot.assumedMonthlySpend === null
        ? null
        : Math.round(wire.snapshot.assumedMonthlySpend * 100),
    );
    expect(await repos.accounts.list()).toHaveLength(wire.accounts.length);
    expect(await repos.activity.list()).toHaveLength(wire.activity.length);
    expect(await repos.plan.bills()).toHaveLength(wire.bills.length);
    expect(await repos.plan.goals()).toHaveLength(wire.goals.length);
    expect((await repos.plan.categories()).map((c) => c.value)).toEqual(
      wire.categories.map((c) => c.value),
    );
  });
});
