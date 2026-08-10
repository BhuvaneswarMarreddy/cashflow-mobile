import { accountDocument, type NewAccount } from '../accountsWrite';

/**
 * The opening anchor, and the dollars boundary.
 *
 * These two are the whole correctness of adding an account by hand. The anchor
 * rule mirrors `openingAnchor()` in the web app (issue #83) — if it drifts, an
 * imported history silently disappears behind a $0 starting balance, which is
 * exactly the failure that rule exists to prevent.
 */
const NOW = new Date(2026, 7, 9, 15, 42); // 9 Aug 2026, LOCAL

const base: NewAccount = {
  name: '  Apple Card  ',
  kind: 'credit-card',
  provider: 'apple',
  openingBalanceCents: null,
};

describe('accountDocument', () => {
  it('writes NO openingDate when the balance is left blank, so all history counts', () => {
    const doc = accountDocument(base, 0, NOW);
    expect(doc.openingDate).toBeUndefined();
    expect(doc.openingBalance).toBe(0);
  });

  it('anchors to today when a balance IS stated, so only later rows move it', () => {
    const doc = accountDocument({ ...base, openingBalanceCents: 123_456 }, 0, NOW);
    expect(doc.openingDate).toBe('2026-08-09');
    expect(doc.openingBalance).toBe(1234.56);
  });

  /**
   * A typed zero is a CLAIM ("I owe nothing today"), not an absence. Collapsing
   * it to the blank case would silently re-count an entire imported history
   * against an account the owner said was clear.
   */
  it('treats a typed zero as a real claim, not as blank', () => {
    const doc = accountDocument({ ...base, openingBalanceCents: 0 }, 0, NOW);
    expect(doc.openingDate).toBe('2026-08-09');
    expect(doc.openingBalance).toBe(0);
  });

  it('converts cents to the dollars the web model stores', () => {
    const doc = accountDocument(
      { ...base, openingBalanceCents: 1, creditLimitCents: 500_000 },
      0,
      NOW,
    );
    expect(doc.openingBalance).toBe(0.01);
    expect(doc.creditLimit).toBe(5000);
  });

  it('satisfies the fields firestore.rules requires on create', () => {
    const doc = accountDocument(base, 3, NOW);
    for (const key of ['name', 'type', 'provider', 'openingBalance', 'isActive']) {
      expect(doc[key]).toBeDefined();
    }
    expect(doc.name).toBe('Apple Card');
    expect(doc.type).toBe('credit_card');
    expect(doc.isActive).toBe(true);
    expect(doc.sortIndex).toBe(3);
  });

  it('maps every offered kind to one of the five AccountType values', () => {
    const allowed = ['bank_account', 'debit_card', 'credit_card', 'cash', 'personal_loan'];
    for (const kind of ['checking', 'credit-card', 'loan', 'cash'] as const) {
      expect(allowed).toContain(accountDocument({ ...base, kind }, 0, NOW).type);
    }
  });

  it('omits optional fields rather than writing undefined, which Firestore rejects', () => {
    const doc = accountDocument(base, 0, NOW);
    expect('lastFourDigits' in doc).toBe(false);
    expect('creditLimit' in doc).toBe(false);
    expect('dueDate' in doc).toBe(false);
  });
});
