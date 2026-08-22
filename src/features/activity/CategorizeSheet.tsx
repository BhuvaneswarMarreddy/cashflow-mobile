import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AppText, BottomSheet, Divider, Icon, ListRow } from '@/components';
import { applyMerchantRule, undoDecision, type ApplyDecisionResult } from '@/data/decisions';
import { isAppError } from '@/errors';
import { useFinanceStore } from '@/store/financeStore';
import { useTheme } from '@/theme';
import type { Transaction } from '@/types';

import { iconFor, resolveCategories, selectableCategories, type CategoryOption } from './categories';

interface Props {
  /** null closes the sheet (BottomSheet's `visible` follows this). */
  transaction: Transaction | null;
  onClose: () => void;
}

/**
 * pick → busy while the write is in flight → done (counts + Undo), or back to
 * pick with an inline error. `done` carries its own `undoBusy`/`undoError` so
 * a failed Undo can be retried without losing the change summary that made it
 * worth undoing.
 */
type SheetState =
  | { phase: 'pick'; busy: boolean; error: string | null }
  | {
      phase: 'done';
      result: ApplyDecisionResult;
      categoryLabel: string;
      undoBusy: boolean;
      undoError: string | null;
    };

const INITIAL_STATE: SheetState = { phase: 'pick', busy: false, error: null };

const summarize = (name: string, categoryLabel: string, result: ApplyDecisionResult): string => {
  const { transactionsMatched, monthsAffected } = result.changed;
  const months = monthsAffected.length;
  return (
    `Mapped ${name} to ${categoryLabel} — ${transactionsMatched} ` +
    `transaction${transactionsMatched === 1 ? '' : 's'} re-tallied across ` +
    `${months} month${months === 1 ? '' : 's'}.`
  );
};

/**
 * The first UI on top of `applyMerchantRule`: long-press a transaction, pick a
 * category, the server derives everything and this just reports the result.
 *
 * v1 simplifications, deliberate:
 *  - Match is always `op: 'equals'` on the exact merchant (or description)
 *    string — predictable, never over-sweeps variants ("COSTCO GAS" stays
 *    untouched when you categorize "COSTCO WHSE"). Grouping variants is a
 *    later issue; the change summary's counts tell the owner the scope of
 *    what this pick actually touched.
 *  - No direction/account qualifiers on the match.
 */
export const CategorizeSheet = ({ transaction, onClose }: Props) => {
  const theme = useTheme();
  const [state, setState] = useState<SheetState>(INITIAL_STATE);
  // cashflow-mobile#24: the owner's resolved category set (defaults + custom),
  // falling back to the 13 defaults before the first snapshot lands. Archived
  // categories never appear here for a NEW pick, except the transaction's own
  // current value — see `selectableCategories`.
  const storeCategories = useFinanceStore((financeState) => financeState.categories);
  const categories = selectableCategories(resolveCategories(storeCategories), transaction?.category);

  // Every reopen — including the same transaction long-pressed again after a
  // previous close — starts from the pick list, never the last run's "done".
  // Reset during render (React's documented pattern for state keyed off a
  // prop) rather than in a useEffect: an effect would commit the stale phase
  // for one frame first and only fix it on the following render.
  const [openedFor, setOpenedFor] = useState(transaction?.id);
  if (transaction?.id !== openedFor) {
    setOpenedFor(transaction?.id);
    setState(INITIAL_STATE);
  }

  // Ref for detecting stale writes: when a pick or undo is in flight and the
  // sheet switches transactions before it resolves, the late .then/.catch must
  // not update state for a transaction that's no longer displayed. Guard: bail
  // if the captured txnId at call time differs from txnIdRef.current.
  const txnIdRef = useRef(transaction?.id);
  // eslint-disable-next-line react-hooks/refs
  txnIdRef.current = transaction?.id;

  const name = transaction ? (transaction.merchant ?? transaction.description) : '';
  const title = transaction ? `Always categorize ${name}` : 'Always categorize';

  const pick = async (category: CategoryOption) => {
    if (!transaction || state.phase !== 'pick' || state.busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState({ phase: 'pick', busy: true, error: null });

    const field = transaction.merchant !== null ? 'merchant' : 'description';
    const value = transaction.merchant ?? transaction.description;
    // Capture the txn id at call time for stale-write detection in the closures below.
    const capturedTxnId = transaction.id;

    try {
      const result = await applyMerchantRule({
        match: { field, op: 'equals', value },
        set: { category: category.value },
      });
      // Bail if the sheet switched transactions before this resolved: do not
      // attribute this write's result (and summary counts) to the new transaction.
      if (capturedTxnId !== txnIdRef.current) return;
      setState({
        phase: 'done',
        result,
        categoryLabel: category.label,
        undoBusy: false,
        undoError: null,
      });
    } catch (error) {
      // Same guard in catch: this error belongs to capturedTxnId, not the
      // transaction now displayed (if it switched).
      if (capturedTxnId !== txnIdRef.current) return;
      const message = isAppError(error) ? error.userMessage : "Cashflow couldn't save that rule.";
      setState({ phase: 'pick', busy: false, error: message });
    }
  };

  const undo = async () => {
    if (state.phase !== 'done' || state.undoBusy) return;
    setState({ ...state, undoBusy: true, undoError: null });
    // Capture txn id at call time for stale-write detection in the catch below.
    const capturedTxnId = transaction?.id;
    try {
      await undoDecision(state.result.decisionId);
      // Bail if the sheet switched transactions: do not close the new sheet.
      if (capturedTxnId !== txnIdRef.current) return;
      onClose();
    } catch (error) {
      // Bail if the sheet switched transactions: do not show this error in the new transaction.
      if (capturedTxnId !== txnIdRef.current) return;
      const message = isAppError(error) ? error.userMessage : "Cashflow couldn't undo that rule.";
      setState((previous) =>
        previous.phase === 'done' ? { ...previous, undoBusy: false, undoError: message } : previous,
      );
    }
  };

  const errorBanner = (message: string) => (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        borderRadius: theme.radius.control,
        backgroundColor: theme.colors.errorSurface,
      }}
    >
      <Icon name="alert-circle" size={16} color={theme.colors.error} />
      <AppText variant="secondary" tone="error" style={{ flex: 1 }}>
        {message}
      </AppText>
    </View>
  );

  return (
    <BottomSheet visible={transaction !== null} onClose={onClose} title={title}>
      {!transaction ? null : state.phase === 'pick' ? (
        <>
          {state.error ? errorBanner(state.error) : null}
          {state.busy ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingBottom: theme.spacing.sm,
              }}
            >
              <ActivityIndicator size="small" color={theme.colors.accent} />
              <AppText variant="secondary" tone="textSecondary">
                Saving…
              </AppText>
            </View>
          ) : null}
          {categories.map((category, index) => {
            const isCurrent = category.value === transaction.category;
            return (
              <View key={category.value}>
                {index > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                <ListRow
                  title={`${iconFor(category)} ${category.label}`}
                  accessibilityLabel={
                    isCurrent ? `${category.label}, current category` : category.label
                  }
                  trailing={
                    isCurrent ? (
                      <Icon name="check" size={18} color={theme.colors.accent} />
                    ) : undefined
                  }
                  onPress={state.busy ? undefined : () => void pick(category)}
                  testID={`category-${category.value}`}
                />
              </View>
            );
          })}
        </>
      ) : (
        <>
          <AppText variant="body" style={{ paddingBottom: theme.spacing.md }}>
            {summarize(name, state.categoryLabel, state.result)}
          </AppText>
          {state.undoError ? errorBanner(state.undoError) : null}
          <ListRow
            title="Undo"
            leadingIcon="rotate-ccw"
            onPress={state.undoBusy ? undefined : () => void undo()}
            testID="row-undo"
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow title="Done" leadingIcon="check" onPress={onClose} testID="row-done" />
        </>
      )}
    </BottomSheet>
  );
};
