import { AppError } from '@/errors';
import { fireEvent, renderWithProviders, waitFor } from '@/test/render';
import type { Transaction } from '@/types';

import { applyMerchantRule, undoDecision } from '@/data/decisions';

import { CATEGORIES } from '../categories';
import { CategorizeSheet } from '../CategorizeSheet';

/**
 * Mocks the wire, not the ledger — same posture as `decisions.test.ts`. This
 * suite asserts the EXACT match/set shape this client sends and how it reacts
 * to what comes back; it never re-derives the server's own category logic.
 */
jest.mock('@/data/decisions', () => ({
  applyMerchantRule: jest.fn(),
  undoDecision: jest.fn(),
}));

const mockApply = applyMerchantRule as jest.Mock;
const mockUndo = undoDecision as jest.Mock;

const withMerchant: Transaction = {
  id: 't1',
  accountId: 'acc_checking',
  date: '2026-08-10',
  description: 'STARBUCKS STORE #4821',
  merchant: 'Starbucks',
  amountCents: -650,
  category: 'food',
  pending: false,
  kind: 'purchase',
};

const noMerchant: Transaction = {
  ...withMerchant,
  id: 't2',
  merchant: null,
  description: 'POS DEBIT VISA 4821',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CategorizeSheet', () => {
  it('lists all 13 categories', async () => {
    const { getByTestId } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={jest.fn()} />,
    );
    for (const category of CATEGORIES) {
      expect(getByTestId(`category-${category.value}`)).toBeTruthy();
    }
  });

  it('marks the transaction current category', async () => {
    const { getByTestId } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={jest.fn()} />,
    );
    expect(getByTestId('category-food').props.accessibilityLabel).toContain('current category');
    expect(getByTestId('category-shopping').props.accessibilityLabel).not.toContain(
      'current category',
    );
  });

  it('picking a category sends the merchant match when the transaction has a merchant', async () => {
    mockApply.mockResolvedValue({
      decisionId: 'd1',
      changed: { transactionsMatched: 4, monthsAffected: ['2026-08'] },
    });
    const { getByTestId } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={jest.fn()} />,
    );

    await fireEvent.press(getByTestId('category-transportation'));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply).toHaveBeenCalledWith({
      match: { field: 'merchant', op: 'equals', value: 'Starbucks' },
      set: { category: 'transportation' },
    });
  });

  it('picking a category falls back to description when merchant is null', async () => {
    mockApply.mockResolvedValue({
      decisionId: 'd2',
      changed: { transactionsMatched: 1, monthsAffected: ['2026-08'] },
    });
    const { getByTestId } = await renderWithProviders(
      <CategorizeSheet transaction={noMerchant} onClose={jest.fn()} />,
    );

    await fireEvent.press(getByTestId('category-shopping'));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply).toHaveBeenCalledWith({
      match: { field: 'description', op: 'equals', value: 'POS DEBIT VISA 4821' },
      set: { category: 'shopping' },
    });
  });

  it('shows the change summary and an Undo after a successful pick', async () => {
    mockApply.mockResolvedValue({
      decisionId: 'd3',
      changed: { transactionsMatched: 4, monthsAffected: ['2026-06', '2026-07'] },
    });
    const { getByTestId, getByText } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={jest.fn()} />,
    );

    await fireEvent.press(getByTestId('category-transportation'));

    await waitFor(() =>
      expect(
        getByText(
          'Mapped Starbucks to Transportation — 4 transactions re-tallied across 2 months.',
        ),
      ).toBeTruthy(),
    );
    expect(getByTestId('row-undo')).toBeTruthy();
    expect(getByTestId('row-done')).toBeTruthy();
  });

  it('Undo calls undoDecision with the returned decisionId, then closes', async () => {
    mockApply.mockResolvedValue({
      decisionId: 'd4',
      changed: { transactionsMatched: 1, monthsAffected: ['2026-08'] },
    });
    mockUndo.mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { getByTestId } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={onClose} />,
    );

    await fireEvent.press(getByTestId('category-transportation'));
    await waitFor(() => expect(getByTestId('row-undo')).toBeTruthy());

    await fireEvent.press(getByTestId('row-undo'));

    await waitFor(() => expect(mockUndo).toHaveBeenCalledWith('d4'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Done closes the sheet without calling undoDecision', async () => {
    mockApply.mockResolvedValue({
      decisionId: 'd5',
      changed: { transactionsMatched: 1, monthsAffected: ['2026-08'] },
    });
    const onClose = jest.fn();
    const { getByTestId } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={onClose} />,
    );

    await fireEvent.press(getByTestId('category-transportation'));
    await waitFor(() => expect(getByTestId('row-done')).toBeTruthy());

    await fireEvent.press(getByTestId('row-done'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('shows the AppError userMessage inline on failure and stays on the pick list', async () => {
    mockApply.mockRejectedValue(
      new AppError({ category: 'data', userMessage: "Cashflow couldn't save that rule." }),
    );
    const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={jest.fn()} />,
    );

    await fireEvent.press(getByTestId('category-transportation'));

    await waitFor(() => expect(getByText("Cashflow couldn't save that rule.")).toBeTruthy());
    // Still on the pick list — every category row is still there, no Undo/Done.
    expect(getByTestId('category-food')).toBeTruthy();
    expect(queryByTestId('row-undo')).toBeNull();
  });

  it('undo failure stays on done state, shows message, does not close, and can be retried', async () => {
    // Setup: apply succeeds, then undo fails on first attempt, succeeds on retry
    mockApply.mockResolvedValue({
      decisionId: 'd_undo_fail',
      changed: { transactionsMatched: 1, monthsAffected: ['2026-08'] },
    });

    let undoReject: any;
    mockUndo
      .mockImplementationOnce(() => new Promise((_, reject) => {
        undoReject = reject;
      })) // First undo attempt: reject with error
      .mockResolvedValueOnce(undefined); // Second undo attempt: succeed

    const onClose = jest.fn();
    const { getByTestId, getByText } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={onClose} />,
    );

    // Get to done state
    await fireEvent.press(getByTestId('category-transportation'));
    await waitFor(() => expect(getByTestId('row-undo')).toBeTruthy());

    // Try undo (will fail)
    await fireEvent.press(getByTestId('row-undo'));

    // Reject it
    undoReject(
      new AppError({ category: 'network', userMessage: 'Network unreachable. Try again?' }),
    );

    // Error should appear
    await waitFor(() => expect(getByText('Network unreachable. Try again?')).toBeTruthy());

    // Still on done state
    expect(getByTestId('row-undo')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    // Retry undo
    await fireEvent.press(getByTestId('row-undo'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('does not show done state when transaction changes before write resolves', async () => {
    // Deferred promise: pick on A, switch to B before resolve, then resolve.
    // Asserts the late setState is ignored and B stays on pick (not done with A's data).
    let resolvePick: any;
    const pickPromise = new Promise((resolve) => {
      resolvePick = resolve;
    });
    mockApply.mockReturnValue(pickPromise);

    const onClose = jest.fn();
    const { getByTestId, queryByTestId, rerender } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={onClose} />,
    );

    // Pick a category on transaction A
    await fireEvent.press(getByTestId('category-transportation'));

    // Switch to transaction B (null then B, as TransactionsList does)
    await rerender(<CategorizeSheet transaction={null} onClose={onClose} />);
    await rerender(<CategorizeSheet transaction={noMerchant} onClose={onClose} />);

    // Resolve the deferred pick from A — should NOT update B's state
    resolvePick({
      decisionId: 'd_race',
      changed: { transactionsMatched: 4, monthsAffected: ['2026-08'] },
    });

    // Wait a tick to let the promise settle and any stale setState run
    await new Promise((resolve) => setTimeout(resolve, 0));

    // B should remain on pick list, not show A's done state or summary
    // The guard prevents the stale setState from updating state for txn A after switching to B
    expect(queryByTestId('row-undo')).toBeNull(); // Not in done state
    // Categories should still be visible (we're on pick)
    expect(queryByTestId('category-shopping')).toBeTruthy();
  });

  it('does not close sheet when undo resolves after transaction switches', async () => {
    // Deferred promise: undo on A, switch to B, resolve undo.
    // Asserts the late undo resolution does not close B's sheet.
    let resolveUndo: any;
    const undoPromise = new Promise((resolve) => {
      resolveUndo = resolve;
    });
    mockApply.mockResolvedValue({
      decisionId: 'd_undo_switch',
      changed: { transactionsMatched: 1, monthsAffected: ['2026-08'] },
    });
    mockUndo.mockReturnValue(undoPromise);

    const onClose = jest.fn();
    const { getByTestId, rerender } = await renderWithProviders(
      <CategorizeSheet transaction={withMerchant} onClose={onClose} />,
    );

    // Get to done state
    await fireEvent.press(getByTestId('category-transportation'));
    await waitFor(() => expect(getByTestId('row-undo')).toBeTruthy());

    // Start undo
    await fireEvent.press(getByTestId('row-undo'));

    // Switch to transaction B (null then B) before undo resolves
    await rerender(<CategorizeSheet transaction={null} onClose={onClose} />);
    await rerender(<CategorizeSheet transaction={noMerchant} onClose={onClose} />);

    // Resolve the undo from A — should NOT call onClose (would close B)
    resolveUndo(undefined);

    // Wait a tick to let the promise settle and onClose be called (if not guarded)
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify onClose was never called — guard prevented the stale undo's .then from running onClose
    expect(onClose).not.toHaveBeenCalled();
  });
});
