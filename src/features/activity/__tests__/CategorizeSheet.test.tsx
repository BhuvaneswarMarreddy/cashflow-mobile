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
});
