import * as ImagePicker from 'expo-image-picker';

import { AppError } from '@/errors';
import { CATEGORIES } from '@/features/activity/categories';
import { useFinanceStore } from '@/store/financeStore';
import { fireEvent, renderWithProviders, waitFor } from '@/test/render';

import { addCategory, createBill, renameCategory, setAssumedMonthlySpend } from '@/data/accountsWrite';
import { sendChatTurn } from '@/data/chat';
import { applyMerchantRule, undoDecision } from '@/data/decisions';

import { ChatSheet } from '../ChatSheet';

/**
 * Mocks the wire, not the model — same posture as CategorizeSheet.test.tsx.
 * This suite asserts what THIS sheet sends and renders; the parser and the
 * request shape are `chat.test.ts`'s job, not this one's.
 */
jest.mock('@/data/chat', () => ({
  // `resolveBillAnchor` is real pure logic the bill card itself calls to
  // decide whether to render Apply — only the network call is mocked.
  ...jest.requireActual('@/data/chat'),
  sendChatTurn: jest.fn(),
}));

jest.mock('@/data/decisions', () => ({
  applyMerchantRule: jest.fn(),
  undoDecision: jest.fn(),
}));

jest.mock('@/data/accountsWrite', () => ({
  setAssumedMonthlySpend: jest.fn(),
  createBill: jest.fn(),
  addCategory: jest.fn(),
  renameCategory: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

const mockSend = sendChatTurn as jest.Mock;
const mockApply = applyMerchantRule as jest.Mock;
const mockUndo = undoDecision as jest.Mock;
const mockSetAssumedMonthlySpend = setAssumedMonthlySpend as jest.Mock;
const mockCreateBill = createBill as jest.Mock;
const mockAddCategory = addCategory as jest.Mock;
const mockRenameCategory = renameCategory as jest.Mock;
const mockPick = ImagePicker.launchImageLibraryAsync as jest.Mock;

/** A base64 string that decodes to `bytes` bytes, no padding. */
const base64OfSize = (bytes: number): string => 'A'.repeat(Math.ceil(bytes / 3) * 4);

const rule = {
  match: { field: 'merchant' as const, op: 'contains' as const, value: 'Starbucks' },
  set: { category: 'food' },
};

beforeEach(() => {
  jest.clearAllMocks();
  useFinanceStore.setState({ categories: [] });
});

const renderSheet = (onClose = jest.fn()) =>
  renderWithProviders(<ChatSheet visible onClose={onClose} />);

describe('ChatSheet', () => {
  it('sending a message renders the user bubble and a busy state', async () => {
    let resolveTurn: (value: unknown) => void = () => {};
    mockSend.mockReturnValue(new Promise((resolve) => (resolveTurn = resolve)));
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'How much did I spend on coffee?');
    await fireEvent.press(getByTestId('chat-send'));

    await waitFor(() => expect(getByText('How much did I spend on coffee?')).toBeTruthy());
    expect(getByTestId('chat-busy')).toBeTruthy();

    resolveTurn({ action: 'answer', explanation: 'done' });
  });

  it('an answer action renders as assistant text', async () => {
    mockSend.mockResolvedValue({ action: 'answer', explanation: 'You spent $42 on coffee this week.' });
    const { getByTestId, getByText, queryByTestId } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'How much on coffee?');
    await fireEvent.press(getByTestId('chat-send'));

    await waitFor(() => expect(getByText('You spent $42 on coffee this week.')).toBeTruthy());
    expect(queryByTestId('chat-busy')).toBeNull();
  });

  it('an unknown server action already collapses to friendly text by the time it reaches the sheet', async () => {
    mockSend.mockResolvedValue({ action: 'answer', explanation: "I can't do that from the phone yet." });
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'delete my account');
    await fireEvent.press(getByTestId('chat-send'));

    await waitFor(() => expect(getByText("I can't do that from the phone yet.")).toBeTruthy());
  });

  it('a create_rule action renders a proposal card with Apply and Dismiss', async () => {
    mockSend.mockResolvedValue({
      action: 'create_rule',
      rule,
      explanation: 'Always mark Starbucks as Food & Dining.',
    });
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'Always mark Starbucks as food');
    await fireEvent.press(getByTestId('chat-send'));

    await waitFor(() =>
      expect(getByText('When merchant contains "Starbucks", set category to Food & Dining.')).toBeTruthy(),
    );
    expect(getByText('Always mark Starbucks as Food & Dining.')).toBeTruthy();
    expect(getByTestId('chat-proposal-apply')).toBeTruthy();
    expect(getByTestId('chat-proposal-dismiss')).toBeTruthy();
  });

  it('Apply calls applyMerchantRule with the exact rule shape and swaps to a summary + Undo', async () => {
    mockSend.mockResolvedValue({
      action: 'create_rule',
      rule,
      explanation: 'Always mark Starbucks as Food & Dining.',
    });
    mockApply.mockResolvedValue({
      decisionId: 'd1',
      changed: { transactionsMatched: 4, monthsAffected: ['2026-08'] },
    });
    const { getByTestId, getByText, queryByTestId } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'rule please');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-proposal-apply')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-proposal-apply'));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply).toHaveBeenCalledWith({ match: rule.match, set: rule.set });

    await waitFor(() =>
      expect(
        getByText('Mapped Starbucks — 4 transactions re-tallied across 1 month.'),
      ).toBeTruthy(),
    );
    expect(getByTestId('chat-proposal-undo')).toBeTruthy();
    expect(queryByTestId('chat-proposal-apply')).toBeNull();
  });

  it('Undo after Apply calls undoDecision with the returned decisionId', async () => {
    mockSend.mockResolvedValue({ action: 'create_rule', rule, explanation: 'e' });
    mockApply.mockResolvedValue({
      decisionId: 'd2',
      changed: { transactionsMatched: 1, monthsAffected: ['2026-08'] },
    });
    mockUndo.mockResolvedValue(undefined);
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'rule please');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-proposal-apply')).toBeTruthy());
    await fireEvent.press(getByTestId('chat-proposal-apply'));
    await waitFor(() => expect(getByTestId('chat-proposal-undo')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-proposal-undo'));

    await waitFor(() => expect(mockUndo).toHaveBeenCalledWith('d2'));
    await waitFor(() => expect(getByText('Undone — nothing changed.')).toBeTruthy());
  });

  it('Dismiss keeps the chat open and does not call applyMerchantRule', async () => {
    mockSend.mockResolvedValue({
      action: 'create_rule',
      rule,
      explanation: 'Always mark Starbucks as Food & Dining.',
    });
    const onClose = jest.fn();
    const { getByTestId, getByText, queryByTestId } = await renderSheet(onClose);

    await fireEvent.changeText(getByTestId('chat-input'), 'How much did I spend at Starbucks?');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-proposal-dismiss')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-proposal-dismiss'));

    expect(mockApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Chat stays intact: the original user message is still there.
    expect(getByText('How much did I spend at Starbucks?')).toBeTruthy();
    // The explanation survives as plain text; the actionable buttons do not.
    expect(getByText('Always mark Starbucks as Food & Dining.')).toBeTruthy();
    expect(queryByTestId('chat-proposal-apply')).toBeNull();
  });

  it('a set_monthly_spend action renders a proposal card with Apply and Dismiss', async () => {
    mockSend.mockResolvedValue({
      action: 'set_monthly_spend',
      amount: 9000,
      reason: 'You asked to plan around $9,000 a month.',
    });
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'assume I spend 9000 a month');
    await fireEvent.press(getByTestId('chat-send'));

    await waitFor(() => expect(getByText('Assume $9,000 a month for runway')).toBeTruthy());
    expect(getByText('You asked to plan around $9,000 a month.')).toBeTruthy();
    expect(getByTestId('chat-spend-apply')).toBeTruthy();
    expect(getByTestId('chat-spend-dismiss')).toBeTruthy();
  });

  it('Apply calls setAssumedMonthlySpend with dollars and swaps to a summary + Undo', async () => {
    mockSend.mockResolvedValue({ action: 'set_monthly_spend', amount: 9000, reason: 'r' });
    mockSetAssumedMonthlySpend.mockResolvedValue(undefined);
    const { getByTestId, getByText, queryByTestId } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'assume I spend 9000 a month');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-spend-apply')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-spend-apply'));

    await waitFor(() => expect(mockSetAssumedMonthlySpend).toHaveBeenCalledTimes(1));
    expect(mockSetAssumedMonthlySpend).toHaveBeenCalledWith(9000);

    await waitFor(() => expect(getByText('Runway now assumes $9,000 a month')).toBeTruthy());
    expect(getByTestId('chat-spend-undo')).toBeTruthy();
    expect(queryByTestId('chat-spend-apply')).toBeNull();
  });

  it('Undo after Apply calls setAssumedMonthlySpend with null', async () => {
    mockSend.mockResolvedValue({ action: 'set_monthly_spend', amount: 9000, reason: 'r' });
    mockSetAssumedMonthlySpend.mockResolvedValue(undefined);
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'assume I spend 9000 a month');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-spend-apply')).toBeTruthy());
    await fireEvent.press(getByTestId('chat-spend-apply'));
    await waitFor(() => expect(getByTestId('chat-spend-undo')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-spend-undo'));

    await waitFor(() => expect(mockSetAssumedMonthlySpend).toHaveBeenLastCalledWith(null));
    await waitFor(() => expect(getByText('Undone — nothing changed.')).toBeTruthy());
  });

  it('Dismiss on a spend proposal keeps the chat open and does not write', async () => {
    mockSend.mockResolvedValue({
      action: 'set_monthly_spend',
      amount: 9000,
      reason: 'You asked to plan around $9,000 a month.',
    });
    const onClose = jest.fn();
    const { getByTestId, getByText, queryByTestId } = await renderSheet(onClose);

    await fireEvent.changeText(getByTestId('chat-input'), 'assume I spend 9000 a month');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-spend-dismiss')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-spend-dismiss'));

    expect(mockSetAssumedMonthlySpend).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getByText('assume I spend 9000 a month')).toBeTruthy();
    expect(getByText('You asked to plan around $9,000 a month.')).toBeTruthy();
    expect(queryByTestId('chat-spend-apply')).toBeNull();
  });

  const installmentBill = {
    action: 'record_bill' as const,
    vendor: 'Apple Card',
    amount: 45.79,
    frequency: 'monthly' as const,
    dueDay: 15,
    accountName: 'Apple Card',
    installmentsRemaining: 13,
    nonNegotiable: true,
    reason: 'You said to record the Apple Card installment.',
  };

  it('a record_bill action renders a proposal card with vendor, amount, cadence, end and account', async () => {
    mockSend.mockResolvedValue(installmentBill);
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'record my Apple Card installment');
    await fireEvent.press(getByTestId('chat-send'));

    await waitFor(() =>
      expect(getByText('Record Apple Card — $45.79 monthly (day 15)')).toBeTruthy(),
    );
    expect(getByText('Apple Card · 13 payments left')).toBeTruthy();
    expect(getByText('You said to record the Apple Card installment.')).toBeTruthy();
    expect(getByTestId('chat-bill-apply')).toBeTruthy();
    expect(getByTestId('chat-bill-dismiss')).toBeTruthy();
  });

  it('Apply calls createBill with the resolved shape and swaps to a saved state', async () => {
    mockSend.mockResolvedValue(installmentBill);
    mockCreateBill.mockResolvedValue('bill_1');
    const { getByTestId, getByText, queryByTestId } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'record my Apple Card installment');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-bill-apply')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-bill-apply'));

    await waitFor(() => expect(mockCreateBill).toHaveBeenCalledTimes(1));
    expect(mockCreateBill).toHaveBeenCalledWith({
      vendor: 'Apple Card',
      amountCents: 4579,
      frequency: 'monthly',
      accountName: 'Apple Card',
      autopayDay: 15,
      anchorDate: undefined,
      endDate: undefined,
      installmentsRemaining: 13,
      nonNegotiable: true,
    });

    await waitFor(() =>
      expect(
        getByText(
          "Saved — Apple Card now shows in Upcoming and Bills, $45.79 monthly. Edit it from the web app's Bills tab.",
        ),
      ).toBeTruthy(),
    );
    expect(queryByTestId('chat-bill-apply')).toBeNull();
    // No Undo verb exists server-side for bills — this card never offers one.
    expect(queryByTestId('chat-bill-undo')).toBeNull();
  });

  it('blocks Apply for a non-monthly bill with no next due date, mirroring the server card', async () => {
    mockSend.mockResolvedValue({
      action: 'record_bill',
      vendor: 'Home Insurance',
      amount: 620,
      frequency: 'annual',
      reason: 'You said to record your home insurance.',
    });
    const { getByTestId, getByText, queryByTestId } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'record my home insurance');
    await fireEvent.press(getByTestId('chat-send'));

    await waitFor(() =>
      expect(
        getByText(
          "I don't have a next due date for a annual bill, so it can't show a schedule yet — tell me when the next payment is due.",
        ),
      ).toBeTruthy(),
    );
    expect(queryByTestId('chat-bill-apply')).toBeNull();
    expect(getByTestId('chat-bill-dismiss')).toBeTruthy();
    expect(mockCreateBill).not.toHaveBeenCalled();
  });

  it('Dismiss on a bill proposal keeps the chat open and does not write', async () => {
    mockSend.mockResolvedValue(installmentBill);
    const onClose = jest.fn();
    const { getByTestId, getByText, queryByTestId } = await renderSheet(onClose);

    await fireEvent.changeText(getByTestId('chat-input'), 'record my Apple Card installment');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-bill-dismiss')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-bill-dismiss'));

    expect(mockCreateBill).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getByText('record my Apple Card installment')).toBeTruthy();
    expect(getByText('You said to record the Apple Card installment.')).toBeTruthy();
    expect(queryByTestId('chat-bill-apply')).toBeNull();
  });

  it('shows the AppError userMessage on a bill write failure and allows retrying Apply', async () => {
    mockSend.mockResolvedValue(installmentBill);
    mockCreateBill.mockRejectedValueOnce(
      new AppError({ category: 'data', userMessage: "Cashflow couldn't save that bill." }),
    );
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'record my Apple Card installment');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-bill-apply')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-bill-apply'));

    await waitFor(() => expect(getByText("Cashflow couldn't save that bill.")).toBeTruthy());
    // The card stays actionable — a busy guard, not a dead end.
    expect(getByTestId('chat-bill-apply')).toBeTruthy();
  });

  describe('cashflow-mobile#24: category verbs', () => {
    it('an add_category action renders a proposal card with Apply and Dismiss', async () => {
      mockSend.mockResolvedValue({
        action: 'add_category',
        label: 'Vacations',
        icon: '🏖️',
        reason: 'You asked to track vacations separately.',
      });
      const { getByTestId, getByText } = await renderSheet();

      await fireEvent.changeText(getByTestId('chat-input'), 'add a vacations category');
      await fireEvent.press(getByTestId('chat-send'));

      await waitFor(() => expect(getByText('Add "Vacations" as a category 🏖️')).toBeTruthy());
      expect(getByText('You asked to track vacations separately.')).toBeTruthy();
      expect(getByTestId('chat-category-apply')).toBeTruthy();
      expect(getByTestId('chat-category-dismiss')).toBeTruthy();
    });

    it('Apply calls addCategory with label and icon, and swaps to a saved state', async () => {
      mockSend.mockResolvedValue({ action: 'add_category', label: 'Vacations', icon: '🏖️', reason: 'r' });
      mockAddCategory.mockResolvedValue('vacations');
      const { getByTestId, getByText, queryByTestId } = await renderSheet();

      await fireEvent.changeText(getByTestId('chat-input'), 'add a vacations category');
      await fireEvent.press(getByTestId('chat-send'));
      await waitFor(() => expect(getByTestId('chat-category-apply')).toBeTruthy());

      await fireEvent.press(getByTestId('chat-category-apply'));

      await waitFor(() => expect(mockAddCategory).toHaveBeenCalledTimes(1));
      expect(mockAddCategory).toHaveBeenCalledWith('Vacations', '🏖️');

      await waitFor(() =>
        expect(getByText('Saved — added "Vacations" as a category.')).toBeTruthy(),
      );
      expect(queryByTestId('chat-category-apply')).toBeNull();
      // No Undo verb exists server-side for categories — this card never offers one.
      expect(queryByTestId('chat-category-undo')).toBeNull();
    });

    it('Dismiss on an add_category proposal keeps the chat open and does not write', async () => {
      mockSend.mockResolvedValue({ action: 'add_category', label: 'Vacations', reason: 'r' });
      const onClose = jest.fn();
      const { getByTestId, queryByTestId } = await renderSheet(onClose);

      await fireEvent.changeText(getByTestId('chat-input'), 'add a vacations category');
      await fireEvent.press(getByTestId('chat-send'));
      await waitFor(() => expect(getByTestId('chat-category-dismiss')).toBeTruthy());

      await fireEvent.press(getByTestId('chat-category-dismiss'));

      expect(mockAddCategory).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(queryByTestId('chat-category-apply')).toBeNull();
    });

    it('shows the AppError userMessage on an add_category write failure and allows retrying Apply', async () => {
      mockSend.mockResolvedValue({ action: 'add_category', label: 'Vacations', reason: 'r' });
      mockAddCategory.mockRejectedValueOnce(
        new AppError({ category: 'data', userMessage: "Cashflow couldn't save that category." }),
      );
      const { getByTestId, getByText } = await renderSheet();

      await fireEvent.changeText(getByTestId('chat-input'), 'add a vacations category');
      await fireEvent.press(getByTestId('chat-send'));
      await waitFor(() => expect(getByTestId('chat-category-apply')).toBeTruthy());

      await fireEvent.press(getByTestId('chat-category-apply'));

      await waitFor(() => expect(getByText("Cashflow couldn't save that category.")).toBeTruthy());
      expect(getByTestId('chat-category-apply')).toBeTruthy();
    });

    it('a rename_category action renders the current label being renamed to the new one', async () => {
      useFinanceStore.setState({
        categories: [...CATEGORIES, { value: 'vacations', label: 'Vacations', icon: '🏖️' }],
      });
      mockSend.mockResolvedValue({
        action: 'rename_category',
        value: 'vacations',
        label: 'Trips',
        reason: 'You asked to rename it.',
      });
      const { getByTestId, getByText } = await renderSheet();

      await fireEvent.changeText(getByTestId('chat-input'), 'rename vacations to trips');
      await fireEvent.press(getByTestId('chat-send'));

      await waitFor(() => expect(getByText('Rename "Vacations" to "Trips"')).toBeTruthy());
      expect(getByTestId('chat-category-apply')).toBeTruthy();
    });

    it('Apply calls renameCategory with value and the new label, and swaps to a saved state', async () => {
      useFinanceStore.setState({
        categories: [...CATEGORIES, { value: 'vacations', label: 'Vacations' }],
      });
      mockSend.mockResolvedValue({
        action: 'rename_category',
        value: 'vacations',
        label: 'Trips',
        reason: 'r',
      });
      mockRenameCategory.mockResolvedValue(undefined);
      const { getByTestId, getByText, queryByTestId } = await renderSheet();

      await fireEvent.changeText(getByTestId('chat-input'), 'rename vacations to trips');
      await fireEvent.press(getByTestId('chat-send'));
      await waitFor(() => expect(getByTestId('chat-category-apply')).toBeTruthy());

      await fireEvent.press(getByTestId('chat-category-apply'));

      await waitFor(() => expect(mockRenameCategory).toHaveBeenCalledTimes(1));
      expect(mockRenameCategory).toHaveBeenCalledWith('vacations', 'Trips');

      await waitFor(() => expect(getByText('Saved — renamed to "Trips".')).toBeTruthy());
      expect(queryByTestId('chat-category-apply')).toBeNull();
    });

    it('a remove_category action renders as plain text naming the category, never a card', async () => {
      useFinanceStore.setState({
        categories: [...CATEGORIES, { value: 'vacations', label: 'Vacations' }],
      });
      mockSend.mockResolvedValue({
        action: 'remove_category',
        value: 'vacations',
        reassignTo: 'other',
        reason: 'You asked to remove it.',
      });
      const { getByTestId, getByText, queryByTestId } = await renderSheet();

      await fireEvent.changeText(getByTestId('chat-input'), 'remove the vacations category');
      await fireEvent.press(getByTestId('chat-send'));

      await waitFor(() =>
        expect(
          getByText(
            'Removing "Vacations" isn\'t something Cashflow can do from the phone yet — it means ' +
              'moving every transaction, rule and bill filed under it first. Do this from the web app for now.',
          ),
        ).toBeTruthy(),
      );
      // Never a card, never a write path — no Apply button exists for this action at all.
      expect(queryByTestId('chat-category-apply')).toBeNull();
      expect(mockAddCategory).not.toHaveBeenCalled();
      expect(mockRenameCategory).not.toHaveBeenCalled();
    });
  });

  it('shows the AppError userMessage inline on a send failure, with a retry', async () => {
    mockSend.mockRejectedValue(
      new AppError({ category: 'service-unavailable', userMessage: 'Daily AI limit reached — try again tomorrow.' }),
    );
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'hi');
    await fireEvent.press(getByTestId('chat-send'));

    await waitFor(() =>
      expect(getByText('Daily AI limit reached — try again tomorrow.')).toBeTruthy(),
    );
    expect(getByTestId('chat-retry')).toBeTruthy();
  });

  it('retry resends the same failed turn', async () => {
    mockSend
      .mockRejectedValueOnce(new AppError({ category: 'network', userMessage: 'Network unreachable.' }))
      .mockResolvedValueOnce({ action: 'answer', explanation: 'here you go' });
    const { getByTestId, getByText } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), 'hi');
    await fireEvent.press(getByTestId('chat-send'));
    await waitFor(() => expect(getByTestId('chat-retry')).toBeTruthy());

    await fireEvent.press(getByTestId('chat-retry'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2));
    expect(mockSend.mock.calls[1][0]).toEqual(mockSend.mock.calls[0][0]);
    await waitFor(() => expect(getByText('here you go')).toBeTruthy());
  });

  it('Send is disabled with no text and no image', async () => {
    const { getByTestId } = await renderSheet();
    expect(getByTestId('chat-send').props.accessibilityState.disabled).toBe(true);
  });

  it('does not send on an empty/whitespace-only message', async () => {
    const { getByTestId } = await renderSheet();

    await fireEvent.changeText(getByTestId('chat-input'), '   ');
    await fireEvent.press(getByTestId('chat-send'));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('an oversized picked image is not attached — shows a notice instead', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://big.png', base64: base64OfSize(10 * 1024 * 1024), mimeType: 'image/png' }],
    });
    const { getByTestId, getByText, queryByTestId } = await renderSheet();

    await fireEvent.press(getByTestId('chat-attach'));

    await waitFor(() =>
      expect(
        getByText('That image is too large to send. Screenshots are fine; photos may be too big.'),
      ).toBeTruthy(),
    );
    expect(queryByTestId('chat-remove-image')).toBeNull();
    // Send stays disabled: no text typed and no image attached.
    expect(getByTestId('chat-send').props.accessibilityState.disabled).toBe(true);
  });

  it('a normal-sized picked image attaches', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://ok.png', base64: base64OfSize(1024), mimeType: 'image/png' }],
    });
    const { getByTestId, queryByText } = await renderSheet();

    await fireEvent.press(getByTestId('chat-attach'));

    await waitFor(() => expect(getByTestId('chat-remove-image')).toBeTruthy());
    expect(
      queryByText('That image is too large to send. Screenshots are fine; photos may be too big.'),
    ).toBeNull();
  });

  it('trims the history sent to the server to the last 10 turns', async () => {
    mockSend.mockResolvedValue({ action: 'answer', explanation: 'ok' });
    const { getByTestId } = await renderSheet();

    for (let i = 0; i < 12; i++) {
      await fireEvent.changeText(getByTestId('chat-input'), `message ${i}`);
      await fireEvent.press(getByTestId('chat-send'));
      await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(i + 1));
    }

    const lastCall = mockSend.mock.calls[11][0];
    expect(lastCall.history).toHaveLength(10);
    // 11 prior turns (22 entries) trimmed to the last 10 — the oldest
    // surviving entry is user turn 6's message, not turn 0's.
    expect(lastCall.history[0]).toEqual({ role: 'user', content: 'message 6' });
    expect(lastCall.history[9]).toEqual({ role: 'assistant', content: 'ok' });
  });
});
