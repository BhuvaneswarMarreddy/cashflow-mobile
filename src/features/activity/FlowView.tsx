import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  BottomSheet,
  Card,
  Divider,
  EmptyState,
  Icon,
  ErrorState,
  SectionHeader,
  SkeletonCard,
} from '@/components';
import {
  fetchFlow,
  fetchFlowNode,
  type FlowEndpoint,
  type FlowNodeDetail,
  type FlowRange,
  type FlowSnapshot,
} from '@/data/flow';
import { Sankey } from './Sankey';
import type { FinanceError } from '@/store/financeStore';
import { useTheme, type ThemeColors } from '@/theme';
import { formatCurrency, formatDate } from '@/utils/format';

const RANGES: { value: FlowRange; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

/** Maps the web app's `FlowColorKey` onto this client's semantic tokens. */
const TONE: Record<string, keyof ThemeColors> = {
  source: 'positive',
  person: 'info',
  credit: 'positive',
  bank: 'accent',
  card: 'negative',
  loan: 'negative',
  category: 'negative',
  warning: 'warning',
  hub: 'textTertiary',
  stub: 'textTertiary',
};

/**
 * One lane: a label, a proportional bar, an amount.
 *
 * The bar is scaled against the largest lane in its own group, not against the
 * total — with twenty categories every bar would otherwise be a sliver, which
 * communicates nothing.
 */
const Lane = ({
  node,
  largest,
  onPress,
}: {
  node: FlowEndpoint;
  largest: number;
  onPress: () => void;
}) => {
  const theme = useTheme();
  const colour = theme.colors[TONE[node.kind] ?? 'textTertiary'];
  const share = largest > 0 ? Math.max(node.cents / largest, 0.02) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${node.label}, ${formatCurrency(node.cents)}`}
      accessibilityHint="Opens the transactions behind this lane"
      onPress={onPress}
      style={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.xs }}
    >
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}
      >
        <AppText variant="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {node.label}
        </AppText>
        <AppText variant="amountSmall">{formatCurrency(node.cents)}</AppText>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${share * 100}%`, height: 6, backgroundColor: colour }} />
      </View>
    </Pressable>
  );
};

/**
 * Where the money came from, and where it went.
 *
 * The web app draws a Sankey. This draws the same graph's two endpoint columns
 * as proportional bars, deliberately: a Sankey's value is the *ribbons* between
 * columns, and on a 390pt screen those collapse into an unreadable tangle. What
 * a Sankey would show and bars cannot is the middle layer — which account each
 * pound passed through — so that travels separately, as a list, rather than
 * being silently dropped.
 *
 * Not one figure here is computed on the phone. `flowSnapshot` runs
 * `buildFlowGraph`, the same engine behind `/flow`, and returns finished cents.
 */
export const FlowView = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Same tab-bar-height source as TransactionsList/AppScreen/FAB, so the
  // floating glass bar clears content consistently across the Activity tab.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const [range, setRange] = useState<FlowRange>('month');
  const [data, setData] = useState<FlowSnapshot | null>(null);
  const [error, setError] = useState<FinanceError | null>(null);
  /** The range the data on screen belongs to; null until the first result. */
  const [loadedRange, setLoadedRange] = useState<FlowRange | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chart, setChart] = useState<'bars' | 'sankey'>('bars');
  const [periodPicker, setPeriodPicker] = useState(false);
  const [detail, setDetail] = useState<FlowNodeDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const openNode = (node: FlowEndpoint) => {
    setDetailBusy(true);
    setDetail(null);
    void fetchFlowNode(node.id, range, periodKey(range))
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailBusy(false));
  };

  // DERIVED, not a state flag set inside the effect: "loading" is exactly
  // "what is on screen is not what was asked for", and computing it removes a
  // setState that would run on every effect pass.
  const loading = loadedRange !== range;

  const periodKey = (next: FlowRange): string | undefined => {
    const now = new Date();
    if (next === 'month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return next === 'year' ? String(now.getFullYear()) : undefined;
  };

  useEffect(() => {
    // Guards a stale response: switching month → year → month fires three
    // fetches, and without this the slowest one wins and paints the wrong
    // period's figures under the right period's label.
    let alive = true;

    void fetchFlow(range, periodKey(range))
      .then((snapshot) => {
        if (!alive) return;
        setData(snapshot);
        setError(null);
        setLoadedRange(range);
      })
      .catch((caught: { category?: FinanceError['category']; userMessage?: string }) => {
        if (!alive) return;
        setError({
          category: caught.category ?? 'unexpected',
          userMessage: caught.userMessage ?? "Cashflow couldn't work out your money flow.",
          retryable: true,
          correlationId: null,
        });
        // Marked loaded so the spinner stops; `error` is what the screen shows.
        setLoadedRange(range);
      });

    return () => {
      alive = false;
    };
  }, [range, attempt]);

  const retry = useCallback(() => {
    setLoadedRange(null);
    setAttempt((n) => n + 1);
  }, []);

  if (loading && !data) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={{ padding: theme.spacing.lg }}>
        <ErrorState error={error} onRetry={retry} />
      </View>
    );
  }

  const largestSource = data?.sources[0]?.cents ?? 0;
  const largestSink = data?.sinks[0]?.cents ?? 0;
  const nameOf = (id: string) => data?.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing.lg,
        paddingBottom: (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + theme.spacing.huge,
        gap: theme.spacing.xl,
      }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={retry}
          tintColor={theme.colors.accent}
          colors={[theme.colors.accent]}
        />
      }
      testID="view-flow"
    >
      {/* ONE control row, not three stacked segmented controls. Two full-width
          pickers plus the screen tabs pushed every figure below the fold — the
          chrome was taller than the content it framed. The period is a chip
          that opens a sheet; the chart type is two icons, because "bars or
          Sankey" needs a glance, not a sentence. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Period: ${RANGES.find((r) => r.value === range)?.label}`}
          accessibilityHint="Opens the period picker"
          onPress={() => setPeriodPicker(true)}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: theme.touchTarget.min,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          <AppText variant="secondary">{RANGES.find((r) => r.value === range)?.label}</AppText>
          <Icon name="chevron-down" size={16} color={theme.colors.textTertiary} />
        </Pressable>

        <View
          style={{
            flexDirection: 'row',
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surfaceAlt,
            padding: 3,
          }}
        >
          {[
            { value: 'bars' as const, icon: 'bar-chart-2' as const, label: 'Bars' },
            { value: 'sankey' as const, icon: 'share-2' as const, label: 'Sankey' },
          ].map((option) => {
            const selected = chart === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => setChart(option.value)}
                style={{
                  width: 46,
                  height: theme.touchTarget.min - 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.pill,
                  backgroundColor: selected ? theme.colors.surface : 'transparent',
                }}
              >
                <Icon
                  name={option.icon}
                  size={17}
                  color={selected ? theme.colors.accent : theme.colors.textTertiary}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      {data && chart === 'sankey' ? <Sankey data={data} /> : null}

      {data && data.sources.length === 0 && data.sinks.length === 0 ? (
        <EmptyState
          kind="no-transactions"
          icon="wind"
          title="No movement in this period"
          body="Pick a wider range, or import some history."
        />
      ) : null}

      {data && chart === 'bars' && data.sources.length > 0 ? (
        <View>
          <SectionHeader title="Money in" caption={data.period.label} />
          <Card style={{ gap: theme.spacing.xs }}>
            {data.sources.map((node) => (
              <Lane
                key={node.id}
                node={node}
                largest={largestSource}
                onPress={() => openNode(node)}
              />
            ))}
          </Card>
        </View>
      ) : null}

      {data && chart === 'bars' && data.sinks.length > 0 ? (
        <View>
          <SectionHeader title="Money out" />
          <Card style={{ gap: theme.spacing.xs }}>
            {data.sinks.map((node) => (
              <Lane
                key={node.id}
                node={node}
                largest={largestSink}
                onPress={() => openNode(node)}
              />
            ))}
          </Card>
        </View>
      ) : null}

      {/* The layer bars cannot show. A Sankey's ribbons carry this; a bar chart
          has nowhere to put it, so it is a list rather than nothing. */}
      {data && data.betweenAccounts.length > 0 ? (
        <View>
          <SectionHeader
            title="Between your accounts"
            caption="Moves that are neither income nor spending"
          />
          <Card style={{ gap: theme.spacing.sm }}>
            {data.betweenAccounts.map((move) => (
              <View
                key={`${move.from}-${move.to}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: theme.spacing.md,
                }}
              >
                <AppText variant="secondary" numberOfLines={1} style={{ flex: 1 }}>
                  {nameOf(move.from)} → {nameOf(move.to)}
                </AppText>
                <AppText variant="caption" tone="textTertiary">
                  {move.moves}×
                </AppText>
                <AppText variant="amountSmall">{formatCurrency(move.cents)}</AppText>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* The trust layer. A gap means the stored rows do not explain the
          balance, and hiding it would make every figure above unfalsifiable. */}
      {data && data.reconciliation.some((r) => r.gapCents !== 0) ? (
        <View>
          <SectionHeader
            title="Unexplained"
            caption="Where the transactions do not add up to the balance"
          />
          <Card style={{ gap: theme.spacing.sm }}>
            {data.reconciliation
              .filter((r) => r.gapCents !== 0)
              .map((row) => (
                <View
                  key={row.accountId}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: theme.spacing.md,
                  }}
                >
                  <AppText variant="secondary" numberOfLines={1} style={{ flex: 1 }}>
                    {row.name}
                  </AppText>
                  <AppText variant="amountSmall" tone="warning">
                    {formatCurrency(row.gapCents)}
                  </AppText>
                </View>
              ))}
          </Card>
        </View>
      ) : null}

      {data ? (
        <AppText variant="caption" tone="textTertiary" align="center">
          In {formatCurrency(data.totals.sourcesCents)} · out{' '}
          {formatCurrency(data.totals.sinksCents)} — equal by construction.
        </AppText>
      ) : null}
      <BottomSheet visible={periodPicker} onClose={() => setPeriodPicker(false)} title="Period">
        {RANGES.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: option.value === range }}
            onPress={() => {
              setRange(option.value);
              setPeriodPicker(false);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: theme.touchTarget.comfortable,
            }}
          >
            <AppText variant="body">{option.label}</AppText>
            {option.value === range ? (
              <Icon name="check" size={18} color={theme.colors.accent} />
            ) : null}
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet
        visible={detailBusy || detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.label ?? 'Loading…'}
      >
        {detailBusy ? (
          <SkeletonCard lines={4} />
        ) : detail?.folded ? (
          <AppText variant="secondary" tone="textSecondary">
            This lane groups several smaller ones together, so its rows cannot be attributed to it
            individually. Open a named lane to see its transactions.
          </AppText>
        ) : detail && detail.rows.length > 0 ? (
          <View>
            <AppText variant="caption" tone="textTertiary">
              {detail.count} transaction{detail.count === 1 ? '' : 's'} · {detail.period.label}
              {detail.count > detail.rows.length
                ? ` · showing the latest ${detail.rows.length}`
                : ''}
            </AppText>
            {detail.rows.map((row, index) => (
              <View key={row.id}>
                {index > 0 ? <Divider /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="secondary" numberOfLines={1}>
                      {row.merchant ?? row.description}
                    </AppText>
                    <AppText variant="caption" tone="textTertiary">
                      {formatDate(row.date, 'short')} · {row.category}
                    </AppText>
                  </View>
                  <AppText variant="amountSmall">
                    {formatCurrency(Math.abs(row.amountCents))}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <AppText variant="secondary" tone="textSecondary">
            No transactions behind this lane in {detail?.period.label ?? 'this period'}.
          </AppText>
        )}
      </BottomSheet>
    </ScrollView>
  );
};
