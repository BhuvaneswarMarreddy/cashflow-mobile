import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import {
  AppScreen,
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  ProgressBar,
  SectionHeader,
  SkeletonCard,
  StatusChip,
} from '@/components';
import {
  INFLOW_ANSWERS,
  fetchReviewQueue,
  resolveReview,
  type ReviewQueue,
} from '@/data/review';
import { triggerRefresh } from '@/hooks/useRefresh';
import type { FinanceError } from '@/store/financeStore';
import { useTheme } from '@/theme';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * "Is this money income?", one card at a time.
 *
 * These credits are the reason other figures are fuzzy: an unreviewed inflow is
 * `unknown_inflow` — real money that counts as neither income nor spending —
 * so every answer here sharpens income, runway and Flow at once.
 *
 * One card, not a list. A list invites scrolling and deciding nothing; the
 * queue is hundreds long and only gets cleared if each decision is cheap. The
 * count and total stay on screen so the work feels finite.
 *
 * Nothing is decided locally. The server chooses the queue
 * (`selectInflowReviewQueue`) and records the answer; this screen renders and
 * posts.
 */
export const ReviewScreen = () => {
  const theme = useTheme();

  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FinanceError | null>(null);
  /** Bumped to refetch. Derived `loaded` beats a flag set inside the effect. */
  const [attempt, setAttempt] = useState(0);
  const [loadedAttempt, setLoadedAttempt] = useState(-1);
  /** Answered in this sitting — the queue is not refetched between cards. */
  const [done, setDone] = useState(0);

  const loaded = loadedAttempt === attempt;
  const load = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    fetchReviewQueue()
      .then((next) => {
        if (!alive) return;
        setQueue(next);
        setIndex(0);
        setError(null);
      })
      .catch((caught: { category?: FinanceError['category']; userMessage?: string }) => {
        if (!alive) return;
        setError({
          category: caught.category ?? 'unexpected',
          userMessage: caught.userMessage ?? "Cashflow couldn't load the queue.",
          retryable: true,
          correlationId: null,
        });
      })
      .finally(() => {
        if (alive) setLoadedAttempt(attempt);
      });

    return () => {
      alive = false;
    };
  }, [attempt]);

  const item = queue?.items[index];

  const answer = (decision: 'confirm' | 'dismiss', meaning?: string) => {
    if (!item || busy) return;
    setBusy(true);
    void resolveReview({
      transactionId: item.transactionId,
      decision,
      ...(meaning ? { meaning } : {}),
    })
      .then(() => {
        usageAnalytics.track('action.selected', 'activity', {
          target: 'review-decision',
          outcome: 'success',
        });
        setDone((n) => n + 1);
        setIndex((n) => n + 1);
        setError(null);
      })
      .catch((caught: { userMessage?: string }) =>
        setError({
          category: 'data',
          userMessage: caught.userMessage ?? "Cashflow couldn't save that decision.",
          retryable: true,
          correlationId: null,
        }),
      )
      .finally(() => setBusy(false));
  };

  // The figures on every other screen were derived with these rows unexplained,
  // so they are stale the moment a decision lands. Re-derived once on the way
  // out rather than after each card — a refresh between taps would make the
  // queue feel slow for no benefit.
  useEffect(
    () => () => {
      if (done > 0) void triggerRefresh('tap');
    },
    [done],
  );

  if (!loaded && !queue) {
    return (
      <AppScreen fabSource="more" testID="screen-review">
        <View style={{ gap: theme.spacing.lg }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={5} />
        </View>
      </AppScreen>
    );
  }

  if (error && !queue) {
    return (
      <AppScreen fabSource="more" testID="screen-review">
        <ErrorState error={error} onRetry={load} />
      </AppScreen>
    );
  }

  if (queue && !item) {
    return (
      <AppScreen fabSource="more" testID="screen-review">
        <EmptyState
          kind="no-transactions"
          icon="check-circle"
          title={done > 0 ? `${done} sorted` : 'Nothing to review'}
          body={
            queue.total > done
              ? `That is this batch done. ${queue.total - done} more are waiting.`
              : 'Every credit Cashflow found is explained. Your income figure is as sharp as your data.'
          }
          {...(queue.total > done ? { actionLabel: 'Load the next batch', onAction: load } : {})}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen fabSource="more" testID="screen-review">
      <View style={{ gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader
            title="Unexplained credits"
            caption={`${formatCurrency(queue?.totalCents ?? 0)} of money Cashflow will not call income until you say so`}
          />
          <ProgressBar
            progress={queue && queue.items.length > 0 ? index / queue.items.length : 0}
            label="Review progress"
            tone="accent"
          />
          <AppText variant="caption" tone="textTertiary">
            {index + 1} of {queue?.items.length ?? 0} in this batch · {queue?.total ?? 0} in total
          </AppText>
        </View>

        {item ? (
          <Card style={{ gap: theme.spacing.md }}>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}
            >
              <AppText variant="heroNumber" style={{ flex: 1 }}>
                {formatCurrency(item.amountCents)}
              </AppText>
              {item.pending ? <StatusChip label="Pending" tone="warning" icon="clock" /> : null}
            </View>

            <View style={{ gap: 2 }}>
              <AppText variant="bodyStrong">{item.merchant ?? item.title}</AppText>
              <AppText variant="caption" tone="textTertiary">
                {formatDate(item.date, 'medium')}
                {item.accountName ? ` · ${item.accountName}` : ''}
              </AppText>
            </View>

            {/* The engine's own words for why it is asking. Without this the
                card is an interrogation with no context. */}
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.surfaceAlt,
              }}
            >
              <Icon name="help-circle" size={16} color={theme.colors.textTertiary} />
              <AppText variant="caption" tone="textSecondary" style={{ flex: 1 }}>
                {item.reason}
              </AppText>
            </View>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          {INFLOW_ANSWERS.map((option) => (
            <Pressable
              key={option.meaning}
              accessibilityRole="button"
              accessibilityLabel={`${option.label}. ${option.hint}`}
              disabled={busy}
              onPress={() => answer('confirm', option.meaning)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                minHeight: theme.touchTarget.comfortable,
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.surface,
                borderWidth: theme.borderWidth.hairline,
                borderColor: theme.colors.border,
                opacity: busy ? theme.opacity.disabled : 1,
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{option.label}</AppText>
                <AppText variant="caption" tone="textTertiary">
                  {option.hint}
                </AppText>
              </View>
              <Icon name="chevron-right" size={18} color={theme.colors.textTertiary} />
            </Pressable>
          ))}

          {/* Dismiss is NOT "income" and not a guess — it records that the
              owner looked and had no answer, so the row stops being asked
              without ever being counted. */}
          <Button
            label="Skip — I don't know"
            variant="ghost"
            fullWidth
            disabled={busy}
            onPress={() => answer('dismiss')}
            testID="button-review-dismiss"
          />
        </View>

        {error ? (
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.errorSurface,
            }}
          >
            <Icon name="alert-circle" size={16} color={theme.colors.error} />
            <AppText variant="secondary" tone="error" style={{ flex: 1 }}>
              {error.userMessage}
            </AppText>
          </View>
        ) : null}
      </View>
    </AppScreen>
  );
};
