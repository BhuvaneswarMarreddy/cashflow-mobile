import { AppError } from '@/errors';
import { fireEvent, renderWithProviders, waitFor } from '@/test/render';

import { sendChatTurn } from '@/data/chat';
import { applyMerchantRule, undoDecision } from '@/data/decisions';

import { ChatSheet } from '../ChatSheet';

/**
 * Mocks the wire, not the model — same posture as CategorizeSheet.test.tsx.
 * This suite asserts what THIS sheet sends and renders; the parser and the
 * request shape are `chat.test.ts`'s job, not this one's.
 */
jest.mock('@/data/chat', () => ({
  sendChatTurn: jest.fn(),
}));

jest.mock('@/data/decisions', () => ({
  applyMerchantRule: jest.fn(),
  undoDecision: jest.fn(),
}));

const mockSend = sendChatTurn as jest.Mock;
const mockApply = applyMerchantRule as jest.Mock;
const mockUndo = undoDecision as jest.Mock;

const rule = {
  match: { field: 'merchant' as const, op: 'contains' as const, value: 'Starbucks' },
  set: { category: 'food' },
};

beforeEach(() => {
  jest.clearAllMocks();
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
});
