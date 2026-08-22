import { httpsCallable } from '@firebase/functions';

import { isFirebaseConfigured } from '@/services/firebase';
import { useFinanceStore } from '@/store/financeStore';
import type { Account, Transaction } from '@/types';

import { CATEGORIES } from '../../features/activity/categories';
import { parseChatAction, resolveBillAnchor, sendChatTurn } from '../chat';

/**
 * Mocks the wire, not the model — same posture as `decisions.test.ts`. The
 * parser tests below assert what THIS client accepts from an untrusted server
 * payload; `sendChatTurn` tests assert what it sends and how it reacts.
 */
jest.mock('@firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@/services/firebase', () => ({
  firebaseFunctions: jest.fn(() => ({})),
  isFirebaseConfigured: jest.fn(() => true),
}));

const mockHttpsCallable = httpsCallable as jest.Mock;
const mockIsFirebaseConfigured = isFirebaseConfigured as jest.Mock;

const account = (partial: Partial<Account> & { id: string; name: string }): Account => ({
  institution: 'Meridian Bank',
  kind: 'checking',
  mask: '1234',
  balanceCents: 0,
  availableCents: 0,
  creditLimitCents: null,
  currency: 'USD',
  lastSyncedAt: null,
  status: 'ok',
  ...partial,
});

const txn = (partial: Partial<Transaction> & { id: string }): Transaction => ({
  accountId: 'acc_checking',
  date: '2026-08-10',
  description: 'STARBUCKS STORE #4821',
  merchant: 'Starbucks',
  amountCents: -650,
  category: 'food',
  pending: false,
  kind: 'purchase',
  ...partial,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
  useFinanceStore.setState({ accounts: [], transactions: [], bills: [], upcoming: [] });
});

describe('parseChatAction', () => {
  it('accepts a valid answer action', () => {
    expect(parseChatAction({ action: 'answer', explanation: 'You spent $42 on coffee.' })).toEqual(
      { action: 'answer', explanation: 'You spent $42 on coffee.' },
    );
  });

  it('accepts a valid create_rule action', () => {
    const raw = {
      action: 'create_rule',
      rule: {
        match: { field: 'merchant', op: 'contains', value: 'Starbucks' },
        set: { category: 'food' },
      },
      explanation: 'Always mark Starbucks as Food & Dining.',
    };
    expect(parseChatAction(raw)).toEqual({
      action: 'create_rule',
      rule: {
        match: { field: 'merchant', op: 'contains', value: 'Starbucks' },
        set: { category: 'food' },
      },
      explanation: 'Always mark Starbucks as Food & Dining.',
    });
  });

  it('rejects a __proto__ key at the top level and falls back to text', () => {
    const raw = JSON.parse(
      '{"action":"create_rule","__proto__":{"polluted":true},"rule":{"match":{"field":"merchant","op":"equals","value":"X"},"set":{"category":"food"}},"explanation":"safe text"}',
    ) as unknown;
    expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'safe text' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects a constructor/prototype key nested inside rule.set', () => {
    const raw = JSON.parse(
      '{"action":"create_rule","rule":{"match":{"field":"merchant","op":"equals","value":"X"},"set":{"category":"food","constructor":{"prototype":{"polluted":true}}}},"explanation":"hi"}',
    ) as unknown;
    expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'hi' });
  });

  it('falls back to a friendly message for an unknown action, when no explanation is given', () => {
    expect(parseChatAction({ action: 'delete_account' })).toEqual({
      action: 'answer',
      explanation: "I can't do that from the phone yet.",
    });
  });

  it('renders the explanation for an unknown action when one is provided', () => {
    expect(parseChatAction({ action: 'delete_account', explanation: 'I can only answer or propose a rule.' })).toEqual(
      { action: 'answer', explanation: 'I can only answer or propose a rule.' },
    );
  });

  it('rejects a bad category and falls back', () => {
    const raw = {
      action: 'create_rule',
      rule: {
        match: { field: 'merchant', op: 'equals', value: 'Starbucks' },
        set: { category: 'not-a-real-category' },
      },
      explanation: 'nope',
    };
    expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
  });

  it('rejects an empty match value and falls back', () => {
    const raw = {
      action: 'create_rule',
      rule: { match: { field: 'merchant', op: 'equals', value: '' }, set: { category: 'food' } },
      explanation: 'nope',
    };
    expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
  });

  it('rejects an empty set and falls back', () => {
    const raw = {
      action: 'create_rule',
      rule: { match: { field: 'merchant', op: 'equals', value: 'Starbucks' }, set: {} },
      explanation: 'nope',
    };
    expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
  });

  it('rejects extra top-level keys on an otherwise valid create_rule', () => {
    const raw = {
      action: 'create_rule',
      rule: {
        match: { field: 'merchant', op: 'equals', value: 'Starbucks' },
        set: { category: 'food' },
      },
      explanation: 'nope',
      extra: 'should not be here',
    };
    expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
  });

  it('rejects extra keys nested inside match', () => {
    const raw = {
      action: 'create_rule',
      rule: {
        match: { field: 'merchant', op: 'equals', value: 'Starbucks', accountId: 'acc_1' },
        set: { category: 'food' },
      },
      explanation: 'nope',
    };
    expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
  });

  it('rejects a bad match.field and a bad match.op', () => {
    const badField = {
      action: 'create_rule',
      rule: { match: { field: 'amount', op: 'equals', value: 'x' }, set: { category: 'food' } },
      explanation: 'nope',
    };
    const badOp = {
      action: 'create_rule',
      rule: { match: { field: 'merchant', op: 'startsWith', value: 'x' }, set: { category: 'food' } },
      explanation: 'nope',
    };
    expect(parseChatAction(badField)).toEqual({ action: 'answer', explanation: 'nope' });
    expect(parseChatAction(badOp)).toEqual({ action: 'answer', explanation: 'nope' });
  });

  it('falls back for a non-object payload', () => {
    expect(parseChatAction('just a string')).toEqual({
      action: 'answer',
      explanation: "I can't do that from the phone yet.",
    });
    expect(parseChatAction(null)).toEqual({
      action: 'answer',
      explanation: "I can't do that from the phone yet.",
    });
  });

  /**
   * Adversarial shapes a real model completion (or a hostile one) could send.
   * The parser already handles every one of these correctly — these pin that
   * behaviour so a future change can't regress it silently.
   */
  describe('record_bill server parity', () => {
    const base = {
      action: 'record_bill',
      vendor: 'Apple Card',
      amount: 45.79,
      frequency: 'monthly',
      reason: 'r',
    };

    it('rejects a vendor longer than the 200-char rules bound', () => {
      expect(parseChatAction({ ...base, vendor: 'A'.repeat(201) })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ ...base, vendor: 'A'.repeat(200) })).toMatchObject({
        action: 'record_bill',
      });
    });

    it('rejects a nextDueDate outside the server sanity window', () => {
      const far = new Date(Date.now() + 500 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const longPast = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const soon = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(parseChatAction({ ...base, nextDueDate: far })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ ...base, nextDueDate: longPast })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ ...base, nextDueDate: soon })).toMatchObject({
        action: 'record_bill',
      });
    });
  });

  describe('adversarial payloads (regression pins, not new behaviour)', () => {
    it('rejects a numeric action', () => {
      expect(parseChatAction({ action: 1, explanation: 'nope' })).toEqual({
        action: 'answer',
        explanation: 'nope',
      });
    });

    it('rejects a numeric match.value', () => {
      const raw = {
        action: 'create_rule',
        rule: { match: { field: 'merchant', op: 'equals', value: 42 }, set: { category: 'food' } },
        explanation: 'nope',
      };
      expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
    });

    it('rejects a numeric set.category', () => {
      const raw = {
        action: 'create_rule',
        rule: { match: { field: 'merchant', op: 'equals', value: 'Starbucks' }, set: { category: 42 } },
        explanation: 'nope',
      };
      expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
    });

    it('rejects rule as a string', () => {
      const raw = { action: 'create_rule', rule: 'not an object', explanation: 'nope' };
      expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
    });

    it('rejects match as an array', () => {
      const raw = {
        action: 'create_rule',
        rule: { match: [{ field: 'merchant', op: 'equals', value: 'Starbucks' }], set: { category: 'food' } },
        explanation: 'nope',
      };
      expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
    });

    it('rejects a whitespace-only match.value', () => {
      const raw = {
        action: 'create_rule',
        rule: { match: { field: 'merchant', op: 'equals', value: '   ' }, set: { category: 'food' } },
        explanation: 'nope',
      };
      expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
    });

    it('falls back for a top-level array payload', () => {
      expect(parseChatAction([{ action: 'answer', explanation: 'hi' }])).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a set with only undefined-valued keys', () => {
      const raw = {
        action: 'create_rule',
        rule: {
          match: { field: 'merchant', op: 'equals', value: 'Starbucks' },
          set: { category: undefined },
        },
        explanation: 'nope',
      };
      expect(parseChatAction(raw)).toEqual({ action: 'answer', explanation: 'nope' });
    });
  });

  describe('set_monthly_spend', () => {
    it('accepts a valid set_monthly_spend action', () => {
      const raw = { action: 'set_monthly_spend', amount: 9000, reason: 'You asked to plan around $9,000/mo.' };
      expect(parseChatAction(raw)).toEqual({
        action: 'set_monthly_spend',
        amount: 9000,
        reason: 'You asked to plan around $9,000/mo.',
      });
    });

    it('accepts the upper bound of 1,000,000', () => {
      const raw = { action: 'set_monthly_spend', amount: 1_000_000, reason: 'r' };
      expect(parseChatAction(raw)).toEqual({ action: 'set_monthly_spend', amount: 1_000_000, reason: 'r' });
    });

    it('rejects zero and negative amounts', () => {
      expect(parseChatAction({ action: 'set_monthly_spend', amount: 0, reason: 'r' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ action: 'set_monthly_spend', amount: -1, reason: 'r' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      // Sub-cent: survives `> 0` but rounds to a $0.00 write the server
      // ignores — must be rejected at the parser, the only gate.
      expect(parseChatAction({ action: 'set_monthly_spend', amount: 0.001, reason: 'r' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects an amount over the 1,000,000 cap', () => {
      const raw = { action: 'set_monthly_spend', amount: 1_000_001, reason: 'r' };
      expect(parseChatAction(raw)).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a non-finite amount', () => {
      expect(parseChatAction({ action: 'set_monthly_spend', amount: Infinity, reason: 'r' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ action: 'set_monthly_spend', amount: NaN, reason: 'r' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a non-numeric amount', () => {
      const raw = { action: 'set_monthly_spend', amount: '9000', reason: 'r' };
      expect(parseChatAction(raw)).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a missing or empty reason', () => {
      expect(parseChatAction({ action: 'set_monthly_spend', amount: 9000 })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ action: 'set_monthly_spend', amount: 9000, reason: '' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects extra top-level keys', () => {
      const raw = { action: 'set_monthly_spend', amount: 9000, reason: 'r', extra: true };
      expect(parseChatAction(raw)).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a __proto__ key alongside an otherwise valid payload', () => {
      const raw = JSON.parse(
        '{"action":"set_monthly_spend","amount":9000,"reason":"r","__proto__":{"polluted":true}}',
      ) as unknown;
      expect(parseChatAction(raw)).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });
  });

  describe('record_bill', () => {
    const valid = {
      action: 'record_bill',
      vendor: 'Apple Card',
      amount: 45.79,
      frequency: 'monthly',
      reason: "You said to record the Apple Card installment.",
    };

    it('accepts a minimal valid record_bill action', () => {
      expect(parseChatAction(valid)).toEqual(valid);
    });

    it('accepts every optional field together', () => {
      const raw = {
        ...valid,
        dueDay: 15,
        nextDueDate: '2026-09-15',
        accountName: 'Apple Card',
        installmentsRemaining: 13,
        nonNegotiable: true,
      };
      expect(parseChatAction(raw)).toEqual(raw);
    });

    it('accepts endDate instead of installmentsRemaining', () => {
      const raw = { ...valid, endDate: '2027-01-01' };
      expect(parseChatAction(raw)).toEqual(raw);
    });

    it('rejects both endDate and installmentsRemaining present together', () => {
      const raw = { ...valid, endDate: '2027-01-01', installmentsRemaining: 5 };
      expect(parseChatAction(raw)).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a bad frequency', () => {
      expect(parseChatAction({ ...valid, frequency: 'daily' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects zero, negative, non-finite and sub-cent amounts', () => {
      for (const amount of [0, -1, Infinity, NaN, 0.001]) {
        expect(parseChatAction({ ...valid, amount })).toEqual({
          action: 'answer',
          explanation: "I can't do that from the phone yet.",
        });
      }
    });

    it('accepts the upper bound of 100,000 and rejects one cent over it', () => {
      expect(parseChatAction({ ...valid, amount: 100_000 })).toEqual({ ...valid, amount: 100_000 });
      expect(parseChatAction({ ...valid, amount: 100_000.01 })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a non-numeric amount', () => {
      expect(parseChatAction({ ...valid, amount: '45.79' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects dueDay out of 1-31 or non-integer', () => {
      for (const dueDay of [0, 32, 1.5]) {
        expect(parseChatAction({ ...valid, dueDay })).toEqual({
          action: 'answer',
          explanation: "I can't do that from the phone yet.",
        });
      }
    });

    it('accepts dueDay at the 1 and 31 bounds', () => {
      expect(parseChatAction({ ...valid, dueDay: 1 })).toEqual({ ...valid, dueDay: 1 });
      expect(parseChatAction({ ...valid, dueDay: 31 })).toEqual({ ...valid, dueDay: 31 });
    });

    it('rejects installmentsRemaining out of 1-480 or non-integer', () => {
      for (const installmentsRemaining of [0, 481, 2.5]) {
        expect(parseChatAction({ ...valid, installmentsRemaining })).toEqual({
          action: 'answer',
          explanation: "I can't do that from the phone yet.",
        });
      }
    });

    it('rejects a malformed nextDueDate or endDate', () => {
      expect(parseChatAction({ ...valid, nextDueDate: '09/15/2026' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ ...valid, endDate: 'not-a-date' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      // Calendar-invalid: fails Date.parse despite matching the regex shape.
      expect(parseChatAction({ ...valid, nextDueDate: '2026-13-40' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a missing or empty vendor, and a missing or empty reason', () => {
      const { vendor: _vendor, ...noVendor } = valid;
      expect(parseChatAction(noVendor)).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ ...valid, vendor: '   ' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(parseChatAction({ ...valid, reason: '' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects an accountName present but empty/whitespace', () => {
      expect(parseChatAction({ ...valid, accountName: '   ' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a non-boolean nonNegotiable', () => {
      expect(parseChatAction({ ...valid, nonNegotiable: 'yes' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects unknown top-level keys', () => {
      expect(parseChatAction({ ...valid, extra: 'nope' })).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });

    it('rejects a __proto__ key alongside an otherwise valid payload', () => {
      const raw = JSON.parse(
        `{"action":"record_bill","vendor":"Apple Card","amount":45.79,"frequency":"monthly",` +
          `"reason":"r","__proto__":{"polluted":true}}`,
      ) as unknown;
      expect(parseChatAction(raw)).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('rejects a constructor/prototype key nested under the payload', () => {
      const raw = JSON.parse(
        `{"action":"record_bill","vendor":"Apple Card","amount":45.79,"frequency":"monthly",` +
          `"reason":"r","constructor":{"prototype":{"polluted":true}}}`,
      ) as unknown;
      expect(parseChatAction(raw)).toEqual({
        action: 'answer',
        explanation: "I can't do that from the phone yet.",
      });
    });
  });
});

describe('resolveBillAnchor', () => {
  it('weekly/biweekly resolve an anchorDate from nextDueDate, with no autopayDay', () => {
    expect(resolveBillAnchor({ frequency: 'weekly', nextDueDate: '2026-08-28' })).toEqual({
      anchorDate: '2026-08-28',
    });
    expect(resolveBillAnchor({ frequency: 'biweekly', nextDueDate: '2026-08-28' })).toEqual({
      anchorDate: '2026-08-28',
    });
  });

  it('weekly/biweekly with no nextDueDate cannot be anchored', () => {
    expect(resolveBillAnchor({ frequency: 'weekly' })).toBeNull();
    expect(resolveBillAnchor({ frequency: 'biweekly', dueDay: 15 })).toBeNull();
  });

  it('monthly never blocks — no autopayDay at all is "varies"', () => {
    expect(resolveBillAnchor({ frequency: 'monthly' })).toEqual({ autopayDay: undefined });
    expect(resolveBillAnchor({ frequency: 'monthly', dueDay: 15 })).toEqual({ autopayDay: 15 });
  });

  it('monthly derives autopayDay from nextDueDate when dueDay is absent', () => {
    expect(resolveBillAnchor({ frequency: 'monthly', nextDueDate: '2026-09-15' })).toEqual({
      autopayDay: 15,
    });
  });

  it('dueDay wins over a nextDueDate-derived day when both are present', () => {
    expect(resolveBillAnchor({ frequency: 'monthly', dueDay: 1, nextDueDate: '2026-09-15' })).toEqual({
      autopayDay: 1,
    });
  });

  it('quarterly/semiannual/annual need nextDueDate as the only anchorDate source', () => {
    for (const frequency of ['quarterly', 'semiannual', 'annual'] as const) {
      expect(resolveBillAnchor({ frequency, dueDay: 15 })).toBeNull();
      expect(resolveBillAnchor({ frequency, nextDueDate: '2026-09-15' })).toEqual({
        autopayDay: 15,
        anchorDate: '2026-09-15',
      });
    }
  });
});

describe('sendChatTurn', () => {
  it('builds context from the finance store and sends message/history through', async () => {
    useFinanceStore.setState({
      accounts: [
        account({ id: 'acc_checking', name: 'Everyday Checking' }),
        account({ id: 'acc_card', name: 'Sapphire Card' }),
      ],
      transactions: [
        txn({ id: 't1', description: 'STARBUCKS', merchant: 'Starbucks', amountCents: -650, category: 'food' }),
        txn({ id: 't2', description: 'POS DEBIT', merchant: null, amountCents: -1200, category: 'shopping' }),
      ],
    });
    const callable = jest.fn().mockResolvedValue({
      data: { success: true, result: { action: 'answer', explanation: 'hi' } },
    });
    mockHttpsCallable.mockReturnValue(callable);

    const history = [{ role: 'user' as const, content: 'earlier turn' }];
    const result = await sendChatTurn({ message: 'How much did I spend on coffee?', history });

    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'aiChat');
    expect(callable).toHaveBeenCalledWith({
      message: 'How much did I spend on coffee?',
      history,
      context: {
        categories: CATEGORIES.map((c) => c.value),
        accounts: ['Everyday Checking', 'Sapphire Card'],
        recent: [
          // Dollars on the wire: the server prints context amounts with
          // toFixed(2), so cents here read back as 100x the real figure.
          { title: 'STARBUCKS', merchant: 'Starbucks', amount: -6.5, category: 'food' },
          { title: 'POS DEBIT', amount: -12, category: 'shopping' },
        ],
        bills: [],
        upcoming: [],
      },
    });
    expect(result).toEqual({ action: 'answer', explanation: 'hi' });
  });

  it('caps recent transactions at 20, taking the most recent (front of the array)', async () => {
    useFinanceStore.setState({
      accounts: [],
      transactions: Array.from({ length: 25 }, (_, i) => txn({ id: `t${i}`, description: `Txn ${i}` })),
    });
    const callable = jest
      .fn()
      .mockResolvedValue({ data: { success: true, result: { action: 'answer', explanation: 'ok' } } });
    mockHttpsCallable.mockReturnValue(callable);

    await sendChatTurn({ message: 'summary', history: [] });

    const sent = callable.mock.calls[0][0];
    expect(sent.context.recent).toHaveLength(20);
    expect(sent.context.recent[0].title).toBe('Txn 0');
    expect(sent.context.recent[19].title).toBe('Txn 19');
  });

  it('sends bills and upcoming so the model can answer recurring-payment questions', async () => {
    useFinanceStore.setState({
      accounts: [],
      transactions: [],
      bills: [
        { id: 'b1', vendor: 'City Utilities', amountCents: 8_740, frequency: 'monthly', nonNegotiable: false, endDate: null, installmentsRemaining: null, method: null },
      ],
      upcoming: [
        {
          id: 'u1',
          name: 'City Utilities',
          dueDate: '2026-08-25',
          amountCents: 8_740,
          accountId: 'acc_checking',
          kind: 'bill',
          autopay: true,
        },
      ],
    });
    const callable = jest
      .fn()
      .mockResolvedValue({ data: { success: true, result: { action: 'answer', explanation: 'ok' } } });
    mockHttpsCallable.mockReturnValue(callable);

    await sendChatTurn({ message: 'what are my recurring payments?', history: [] });

    const sent = callable.mock.calls[0][0];
    // Dollars, not cents: the server prints these with toFixed(2).
    expect(sent.context.bills).toEqual([
      {
        vendor: 'City Utilities',
        amount: 87.4,
        frequency: 'monthly',
        nonNegotiable: false,
        endDate: null,
        installmentsRemaining: null,
        method: null,
      },
    ]);
    expect(sent.context.upcoming).toEqual([
      { name: 'City Utilities', dueDate: '2026-08-25', amount: 87.4 },
    ]);
  });

  it('caps bills and upcoming at 30, taking the front of each array', async () => {
    useFinanceStore.setState({
      accounts: [],
      transactions: [],
      bills: Array.from({ length: 35 }, (_, i) => ({
        id: `b${i}`,
        vendor: `Vendor ${i}`,
        amountCents: 100,
        frequency: 'monthly' as const,
        nonNegotiable: false,
        endDate: null,
        installmentsRemaining: null,
        method: null,
      })),
      upcoming: Array.from({ length: 35 }, (_, i) => ({
        id: `u${i}`,
        name: `Payment ${i}`,
        dueDate: '2026-08-25',
        amountCents: 100,
        accountId: null,
        kind: 'bill' as const,
        autopay: false,
      })),
    });
    const callable = jest
      .fn()
      .mockResolvedValue({ data: { success: true, result: { action: 'answer', explanation: 'ok' } } });
    mockHttpsCallable.mockReturnValue(callable);

    await sendChatTurn({ message: 'summary', history: [] });

    const sent = callable.mock.calls[0][0];
    expect(sent.context.bills).toHaveLength(30);
    expect(sent.context.upcoming).toHaveLength(30);
    expect(sent.context.bills[0].vendor).toBe('Vendor 0');
    expect(sent.context.upcoming[0].name).toBe('Payment 0');
  });

  it('passes image fields through when an image is attached', async () => {
    const callable = jest
      .fn()
      .mockResolvedValue({ data: { success: true, result: { action: 'answer', explanation: 'ok' } } });
    mockHttpsCallable.mockReturnValue(callable);

    await sendChatTurn({
      message: "what's in this screenshot?",
      history: [],
      image: { base64: 'AAAA', mimeType: 'image/jpeg' },
    });

    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({ imageBase64: 'AAAA', imageMimeType: 'image/jpeg' }),
    );
  });

  it('parses the untrusted result before returning it', async () => {
    const callable = jest.fn().mockResolvedValue({
      data: {
        success: true,
        result: {
          action: 'create_rule',
          rule: { match: { field: 'merchant', op: 'equals', value: 'X' }, set: { category: 'food' } },
          explanation: 'e',
        },
      },
    });
    mockHttpsCallable.mockReturnValue(callable);

    const result = await sendChatTurn({ message: 'x', history: [] });

    expect(result).toEqual({
      action: 'create_rule',
      rule: { match: { field: 'merchant', op: 'equals', value: 'X' }, set: { category: 'food' } },
      explanation: 'e',
    });
  });

  it('throws FIREBASE_NOT_CONFIGURED and never calls the callable', async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    await expect(sendChatTurn({ message: 'hi', history: [] })).rejects.toMatchObject({
      code: 'FIREBASE_NOT_CONFIGURED',
    });
    expect(mockHttpsCallable).not.toHaveBeenCalled();
  });

  it('maps resource-exhausted to the daily limit message', async () => {
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('quota'), { code: 'resource-exhausted' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(sendChatTurn({ message: 'hi', history: [] })).rejects.toMatchObject({
      userMessage: 'Daily AI limit reached — try again tomorrow.',
      retryable: false,
    });
  });

  it('maps unavailable to the AI-not-configured message', async () => {
    const callable = jest.fn().mockRejectedValue(Object.assign(new Error('nope'), { code: 'unavailable' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(sendChatTurn({ message: 'hi', history: [] })).rejects.toMatchObject({
      userMessage: 'AI is not configured.',
    });
  });

  it('maps unauthenticated to the sign-in message', async () => {
    const callable = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('nope'), { code: 'unauthenticated' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(sendChatTurn({ message: 'hi', history: [] })).rejects.toMatchObject({
      category: 'authentication',
      userMessage: 'Your session has expired. Sign in again to continue.',
    });
  });

  it('maps any other failure to a retryable data error', async () => {
    const callable = jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'internal' }));
    mockHttpsCallable.mockReturnValue(callable);

    await expect(sendChatTurn({ message: 'hi', history: [] })).rejects.toMatchObject({
      retryable: true,
    });
  });
});
