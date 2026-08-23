import { buildBaseDataset } from '@/mocks/dataset';
import { useFinanceStore } from '@/store/financeStore';
import { fireEvent, renderWithProviders, waitFor } from '@/test/render';
import { resetStores } from '@/test/stores';

import { applyMerchantRule } from '@/data/decisions';

import { TransactionsList } from '../TransactionsList';

/** Same posture as the CategorizeSheet suite: mock the wire the sheet talks
 *  over, never the network — this list only owns which transaction opens. */
jest.mock('@/data/decisions', () => ({
  applyMerchantRule: jest.fn(),
  undoDecision: jest.fn(),
}));

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const data = buildBaseDataset(NOW);

// From src/mocks/dataset.ts — two distinct, always-present rows.
const BLUE_BOTTLE = data.transactions.find((t) => t.id === 'txn_01');
const WHOLE_FOODS = data.transactions.find((t) => t.id === 'txn_02');
if (!BLUE_BOTTLE || !WHOLE_FOODS) {
  throw new Error('mock dataset fixture changed — txn_01/txn_02 no longer present');
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStores();
  useFinanceStore.setState({
    accounts: data.accounts,
    transactions: data.transactions,
    status: 'success',
    hasLoadedOnce: true,
    lastRefreshedAt: new Date(NOW).toISOString(),
  });
});

describe('TransactionsList', () => {
  it('opens no sheet until a row is long-pressed', async () => {
    const { queryByTestId } = await renderWithProviders(<TransactionsList />);
    expect(queryByTestId('category-food')).toBeNull();
  });

  it('long-pressing a row opens the categorize sheet for THAT transaction', async () => {
    const { getByText } = await renderWithProviders(<TransactionsList />);

    // Long-press the SECOND row, not the first — proves the sheet opens for
    // whichever row was pressed, not always the top of the list.
    await fireEvent(getByText('Whole Foods'), 'longPress');

    await waitFor(() => expect(getByText('Always categorize Whole Foods')).toBeTruthy());
    expect(() => getByText('Always categorize Blue Bottle')).toThrow();
  });

  it('picking a category in the sheet calls applyMerchantRule for the long-pressed transaction', async () => {
    (applyMerchantRule as jest.Mock).mockResolvedValue({
      decisionId: 'd1',
      changed: { transactionsMatched: 1, monthsAffected: ['2026-08'] },
    });

    const { getByText, getByTestId } = await renderWithProviders(<TransactionsList />);

    await fireEvent(getByText('Blue Bottle'), 'longPress');
    await waitFor(() => expect(getByTestId('category-food')).toBeTruthy());

    await fireEvent.press(getByTestId('category-food'));

    await waitFor(() =>
      expect(applyMerchantRule).toHaveBeenCalledWith({
        match: { field: 'merchant', op: 'equals', value: 'Blue Bottle' },
        set: { category: 'food', sourceCategory: 'Food & Dining' },
      }),
    );
  });
});
