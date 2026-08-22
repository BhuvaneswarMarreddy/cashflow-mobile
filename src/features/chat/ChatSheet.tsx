import { useState } from 'react';
import { ActivityIndicator, Image, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

import { AppText, BottomSheet, Button, Card, IconButton, ListRow } from '@/components';
import { setAssumedMonthlySpend } from '@/data/accountsWrite';
import { sendChatTurn, type ChatAction, type ChatMessage } from '@/data/chat';
import { applyMerchantRule, undoDecision, type ApplyDecisionResult } from '@/data/decisions';
import { isAppError } from '@/errors';
import { CATEGORIES } from '@/features/activity/categories';
import { useTheme } from '@/theme';
import type { Theme } from '@/theme';
import { formatCurrency } from '@/utils/format';
import { createId } from '@/utils/id';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type ProposalState =
  | { phase: 'pending' }
  | { phase: 'applying' }
  | { phase: 'error'; message: string }
  | { phase: 'applied'; result: ApplyDecisionResult; undoBusy: boolean; undoError: string | null }
  | { phase: 'undone' }
  | { phase: 'dismissed' };

type ProposalRule = Extract<ChatAction, { action: 'create_rule' }>['rule'];

/** Same phase shape as `ProposalState`, minus the rule-specific `result` payload Undo needs here. */
type SpendProposalState =
  | { phase: 'pending' }
  | { phase: 'applying' }
  | { phase: 'error'; message: string }
  | { phase: 'applied'; undoBusy: boolean; undoError: string | null }
  | { phase: 'undone' }
  | { phase: 'dismissed' };

// Headroom under the server's 10MB request cap (see task-chat-brief.md).
const MAX_IMAGE_BYTES = 9 * 1024 * 1024;

/** Decoded byte size of a base64 string: 3 bytes per 4 chars, minus padding. */
const decodedBase64Size = (base64: string): number => {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

type Entry =
  // No `base64` here — only `lastTurn` (below) needs the decoded bytes, for
  // retry, and it's replaced/cleared every turn. The thumbnail only ever
  // renders `uri`; keeping the decoded image in permanent transcript state
  // would grow this component's memory without bound across a long chat.
  | { id: string; kind: 'user'; text: string; image?: { uri: string; mimeType: string } }
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'proposal'; rule: ProposalRule; explanation: string; state: ProposalState }
  | { id: string; kind: 'spend-proposal'; amountCents: number; reason: string; state: SpendProposalState };

type Turn = { message: string; history: ChatMessage[]; image?: { base64: string; mimeType: string } };

const categoryLabel = (value: string): string =>
  CATEGORIES.find((category) => category.value === value)?.label ?? value;

/** What the rule's `set` half reads as, picking whichever key is present. */
const setDescription = (set: ProposalRule['set']): string => {
  if (set.category) return `category to ${categoryLabel(set.category)}`;
  if (set.sourceCategory) return `source category to ${set.sourceCategory}`;
  if (set.type) return `type to ${set.type}`;
  if (set.merchant) return `merchant to ${set.merchant}`;
  return 'a rule';
};

const describeRule = (rule: ProposalRule): string => {
  const verb = rule.match.op === 'contains' ? 'contains' : 'is';
  return `When ${rule.match.field} ${verb} "${rule.match.value}", set ${setDescription(rule.set)}.`;
};

const describeSpendProposal = (amountCents: number): string =>
  `Assume ${formatCurrency(amountCents)} a month for runway`;

const describeSpendApplied = (amountCents: number): string =>
  `Runway now assumes ${formatCurrency(amountCents)} a month`;

/** Same "Mapped … — N transactions re-tallied" copy CategorizeSheet uses after a write. */
const summarizeApplied = (rule: ProposalRule, result: ApplyDecisionResult): string => {
  const { transactionsMatched, monthsAffected } = result.changed;
  const months = monthsAffected.length;
  return (
    `Mapped ${rule.match.value} — ${transactionsMatched} ` +
    `transaction${transactionsMatched === 1 ? '' : 's'} re-tallied across ` +
    `${months} month${months === 1 ? '' : 's'}.`
  );
};

/** Chat history for the next turn — everything said so far, in the API's role/content shape. */
const toHistory = (entries: Entry[]): ChatMessage[] =>
  entries.flatMap((entry): ChatMessage[] => {
    if (entry.kind === 'user') return [{ role: 'user', content: entry.text }];
    if (entry.kind === 'text') return [{ role: 'assistant', content: entry.text }];
    if (entry.state.phase === 'dismissed') return [];
    if (entry.kind === 'proposal') return [{ role: 'assistant', content: entry.explanation }];
    return [{ role: 'assistant', content: entry.reason }];
  });

const bubble = (theme: Theme, key: string, text: string, align: 'flex-end' | 'flex-start') => (
  <View
    key={key}
    style={{
      alignSelf: align,
      maxWidth: '85%',
      backgroundColor: align === 'flex-end' ? theme.colors.accentSurface : theme.colors.surfaceAlt,
      borderRadius: theme.radius.control,
      padding: theme.spacing.md,
    }}
  >
    <AppText variant="body">{text}</AppText>
  </View>
);

/**
 * "Ask Cashflow" — the owner's single-point-of-control chat.
 *
 * Overlay only, never full-screen (BottomSheet's 85% cap). Every proposal the
 * AI makes renders as a card the owner must explicitly Apply or Dismiss —
 * nothing here ever writes on its own. Apply goes through the same validated
 * `applyMerchantRule` CategorizeSheet uses, so a chat-originated rule and a
 * long-press-originated rule are indistinguishable to the server.
 *
 * State lives here, not in the screen: unlike CategorizeSheet (keyed to
 * whichever transaction was long-pressed), there is exactly one chat per
 * screen and nothing external drives what it shows — the transcript is this
 * component's own memory of the conversation.
 */
export const ChatSheet = ({ visible, onClose }: Props) => {
  const theme = useTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<{
    uri: string;
    base64: string;
    mimeType: string;
  } | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // The exact request that failed, so "Try again" resends it without the
  // owner having to retype a message that's already in the transcript.
  const [lastTurn, setLastTurn] = useState<Turn | null>(null);

  const errorBanner = (message: string) => (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.control,
        backgroundColor: theme.colors.errorSurface,
      }}
    >
      <AppText variant="secondary" tone="error" style={{ flex: 1 }}>
        {message}
      </AppText>
    </View>
  );

  const runTurn = async (turn: Turn) => {
    setSending(true);
    setSendError(null);
    setLastTurn(turn);
    try {
      const action = await sendChatTurn(turn);
      setSending(false);
      setLastTurn(null);
      setEntries((previous) => {
        if (action.action === 'create_rule') {
          return [
            ...previous,
            {
              id: createId('chat'),
              kind: 'proposal',
              rule: action.rule,
              explanation: action.explanation,
              state: { phase: 'pending' },
            },
          ];
        }
        if (action.action === 'set_monthly_spend') {
          return [
            ...previous,
            {
              id: createId('chat'),
              kind: 'spend-proposal',
              amountCents: Math.round(action.amount * 100),
              reason: action.reason,
              state: { phase: 'pending' },
            },
          ];
        }
        return [...previous, { id: createId('chat'), kind: 'text', text: action.explanation }];
      });
    } catch (error) {
      setSending(false);
      const message = isAppError(error) ? error.userMessage : "Cashflow couldn't reach the AI. Try again.";
      setSendError(message);
    }
  };

  const send = () => {
    const text = input.trim();
    if (sending || (!text && !pendingImage)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userEntry: Entry = {
      id: createId('chat'),
      kind: 'user',
      text,
      ...(pendingImage ? { image: { uri: pendingImage.uri, mimeType: pendingImage.mimeType } } : {}),
    };
    const turn: Turn = {
      message: text,
      // Trimmed to the last 10 turns — matches the server's own history cap.
      history: toHistory(entries).slice(-10),
      ...(pendingImage
        ? { image: { base64: pendingImage.base64, mimeType: pendingImage.mimeType } }
        : {}),
    };

    setEntries((previous) => [...previous, userEntry]);
    setInput('');
    setPendingImage(null);
    void runTurn(turn);
  };

  const retry = () => {
    if (!lastTurn || sending) return;
    void runTurn(lastTurn);
  };

  const attach = async () => {
    setAttachError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        // `quality` only affects a JPEG re-encode — iOS IGNORES it entirely
        // for PNG library picks, and a screenshot IS a PNG. This option does
        // nothing to bound a screenshot's payload; the size check below,
        // computed from the decoded base64 length, is what actually does.
        quality: 0.5,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        setAttachError("Cashflow couldn't read that image.");
        return;
      }
      if (decodedBase64Size(asset.base64) > MAX_IMAGE_BYTES) {
        setAttachError('That image is too large to send. Screenshots are fine; photos may be too big.');
        return;
      }
      setPendingImage({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' });
    } catch {
      setAttachError("Cashflow couldn't open your photos.");
    }
  };

  const updateProposal = (id: string, state: ProposalState) =>
    setEntries((previous) =>
      previous.map((entry) => (entry.id === id && entry.kind === 'proposal' ? { ...entry, state } : entry)),
    );

  const applyProposal = async (entry: Extract<Entry, { kind: 'proposal' }>) => {
    if (entry.state.phase === 'applying' || entry.state.phase === 'applied') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateProposal(entry.id, { phase: 'applying' });
    try {
      const result = await applyMerchantRule({ match: entry.rule.match, set: entry.rule.set });
      updateProposal(entry.id, { phase: 'applied', result, undoBusy: false, undoError: null });
    } catch (error) {
      const message = isAppError(error) ? error.userMessage : "Cashflow couldn't save that rule.";
      updateProposal(entry.id, { phase: 'error', message });
    }
  };

  const dismissProposal = (entry: Extract<Entry, { kind: 'proposal' }>) =>
    updateProposal(entry.id, { phase: 'dismissed' });

  const undoProposal = async (entry: Extract<Entry, { kind: 'proposal' }>) => {
    if (entry.state.phase !== 'applied' || entry.state.undoBusy) return;
    updateProposal(entry.id, { ...entry.state, undoBusy: true, undoError: null });
    try {
      await undoDecision(entry.state.result.decisionId);
      updateProposal(entry.id, { phase: 'undone' });
    } catch (error) {
      const message = isAppError(error) ? error.userMessage : "Cashflow couldn't undo that rule.";
      updateProposal(entry.id, { ...entry.state, undoBusy: false, undoError: message });
    }
  };

  const renderProposal = (entry: Extract<Entry, { kind: 'proposal' }>) => {
    const { state } = entry;

    if (state.phase === 'dismissed') return bubble(theme, entry.id, entry.explanation, 'flex-start');
    if (state.phase === 'undone') return bubble(theme, entry.id, 'Undone — nothing changed.', 'flex-start');

    if (state.phase === 'applied') {
      return (
        <Card key={entry.id} style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
          <AppText variant="body" style={{ paddingBottom: theme.spacing.sm }}>
            {summarizeApplied(entry.rule, state.result)}
          </AppText>
          {state.undoError ? errorBanner(state.undoError) : null}
          <ListRow
            title="Undo"
            leadingIcon="rotate-ccw"
            onPress={state.undoBusy ? undefined : () => void undoProposal(entry)}
            testID="chat-proposal-undo"
          />
        </Card>
      );
    }

    return (
      <Card key={entry.id} style={{ alignSelf: 'flex-start', maxWidth: '90%', gap: theme.spacing.sm }}>
        <AppText variant="body">{describeRule(entry.rule)}</AppText>
        <AppText variant="secondary" tone="textSecondary">
          {entry.explanation}
        </AppText>
        {state.phase === 'error' ? errorBanner(state.message) : null}
        {state.phase === 'applying' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <AppText variant="secondary" tone="textSecondary">
              Saving…
            </AppText>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button label="Apply" onPress={() => void applyProposal(entry)} testID="chat-proposal-apply" />
            <Button
              label="Dismiss"
              variant="secondary"
              onPress={() => dismissProposal(entry)}
              testID="chat-proposal-dismiss"
            />
          </View>
        )}
      </Card>
    );
  };

  const updateSpendProposal = (id: string, state: SpendProposalState) =>
    setEntries((previous) =>
      previous.map((entry) =>
        entry.id === id && entry.kind === 'spend-proposal' ? { ...entry, state } : entry,
      ),
    );

  const applySpendProposal = async (entry: Extract<Entry, { kind: 'spend-proposal' }>) => {
    if (entry.state.phase === 'applying' || entry.state.phase === 'applied') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSpendProposal(entry.id, { phase: 'applying' });
    try {
      await setAssumedMonthlySpend(entry.amountCents / 100);
      updateSpendProposal(entry.id, { phase: 'applied', undoBusy: false, undoError: null });
    } catch (error) {
      const message = isAppError(error) ? error.userMessage : "Cashflow couldn't save that assumption.";
      updateSpendProposal(entry.id, { phase: 'error', message });
    }
  };

  const dismissSpendProposal = (entry: Extract<Entry, { kind: 'spend-proposal' }>) =>
    updateSpendProposal(entry.id, { phase: 'dismissed' });

  const undoSpendProposal = async (entry: Extract<Entry, { kind: 'spend-proposal' }>) => {
    if (entry.state.phase !== 'applied' || entry.state.undoBusy) return;
    updateSpendProposal(entry.id, { ...entry.state, undoBusy: true, undoError: null });
    try {
      await setAssumedMonthlySpend(null);
      updateSpendProposal(entry.id, { phase: 'undone' });
    } catch (error) {
      const message = isAppError(error) ? error.userMessage : "Cashflow couldn't undo that assumption.";
      updateSpendProposal(entry.id, { ...entry.state, undoBusy: false, undoError: message });
    }
  };

  const renderSpendProposal = (entry: Extract<Entry, { kind: 'spend-proposal' }>) => {
    const { state } = entry;

    if (state.phase === 'dismissed') return bubble(theme, entry.id, entry.reason, 'flex-start');
    if (state.phase === 'undone') return bubble(theme, entry.id, 'Undone — nothing changed.', 'flex-start');

    if (state.phase === 'applied') {
      return (
        <Card key={entry.id} style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
          <AppText variant="body" style={{ paddingBottom: theme.spacing.sm }}>
            {describeSpendApplied(entry.amountCents)}
          </AppText>
          {state.undoError ? errorBanner(state.undoError) : null}
          <ListRow
            title="Undo"
            leadingIcon="rotate-ccw"
            onPress={state.undoBusy ? undefined : () => void undoSpendProposal(entry)}
            testID="chat-spend-undo"
          />
        </Card>
      );
    }

    return (
      <Card key={entry.id} style={{ alignSelf: 'flex-start', maxWidth: '90%', gap: theme.spacing.sm }}>
        <AppText variant="body">{describeSpendProposal(entry.amountCents)}</AppText>
        <AppText variant="secondary" tone="textSecondary">
          {entry.reason}
        </AppText>
        {state.phase === 'error' ? errorBanner(state.message) : null}
        {state.phase === 'applying' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <AppText variant="secondary" tone="textSecondary">
              Saving…
            </AppText>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button label="Apply" onPress={() => void applySpendProposal(entry)} testID="chat-spend-apply" />
            <Button
              label="Dismiss"
              variant="secondary"
              onPress={() => dismissSpendProposal(entry)}
              testID="chat-spend-dismiss"
            />
          </View>
        )}
      </Card>
    );
  };

  const footer = (
    <View style={{ gap: theme.spacing.sm }}>
      {attachError ? errorBanner(attachError) : null}
      {pendingImage ? (
        <View style={{ flexDirection: 'row' }}>
          <View>
            <Image
              source={{ uri: pendingImage.uri }}
              accessibilityLabel="Attached screenshot"
              style={{ width: 56, height: 56, borderRadius: theme.radius.control }}
            />
            <View style={{ position: 'absolute', top: -8, right: -8 }}>
              <IconButton
                icon="x-circle"
                size={18}
                onPress={() => setPendingImage(null)}
                accessibilityLabel="Remove attached screenshot"
                testID="chat-remove-image"
              />
            </View>
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <IconButton
          icon="image"
          onPress={() => void attach()}
          accessibilityLabel="Attach a screenshot"
          testID="chat-attach"
        />
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask Cashflow…"
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          editable={!sending}
          accessibilityLabel="Message"
          testID="chat-input"
          style={{
            flex: 1,
            maxHeight: 96,
            minHeight: theme.touchTarget.comfortable,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.control,
            backgroundColor: theme.colors.surfaceAlt,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.colors.border,
            color: theme.colors.textPrimary,
            ...theme.typography.body,
          }}
        />
        <IconButton
          icon="send"
          onPress={send}
          accessibilityLabel="Send"
          disabled={sending || (input.trim().length === 0 && !pendingImage)}
          testID="chat-send"
        />
      </View>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Ask Cashflow" footer={footer}>
      <View style={{ gap: theme.spacing.md }}>
        {entries.length === 0 ? (
          <AppText variant="secondary" tone="textSecondary">
            Ask about your spending, or drop in a screenshot.
          </AppText>
        ) : null}

        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <View key={entry.id} style={{ alignSelf: 'flex-end', maxWidth: '85%', gap: theme.spacing.xs }}>
                {entry.image ? (
                  <Image
                    source={{ uri: entry.image.uri }}
                    accessibilityLabel="Attached screenshot"
                    style={{ width: 96, height: 96, borderRadius: theme.radius.control, alignSelf: 'flex-end' }}
                  />
                ) : null}
                {entry.text ? bubble(theme, `${entry.id}-text`, entry.text, 'flex-end') : null}
              </View>
            );
          }
          if (entry.kind === 'text') return bubble(theme, entry.id, entry.text, 'flex-start');
          if (entry.kind === 'spend-proposal') return renderSpendProposal(entry);
          return renderProposal(entry);
        })}

        {sending ? (
          <View
            testID="chat-busy"
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
          >
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <AppText variant="secondary" tone="textSecondary">
              Thinking…
            </AppText>
          </View>
        ) : null}

        {sendError ? (
          <View style={{ gap: theme.spacing.sm }}>
            {errorBanner(sendError)}
            <Button label="Try again" icon="refresh-cw" variant="secondary" onPress={retry} testID="chat-retry" />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
};
