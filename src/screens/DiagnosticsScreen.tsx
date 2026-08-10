import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnalyticsStream } from '@/analytics';
import { useApiStream } from '@/api';
import { useAuditStream } from '@/audit';
import { AppText, Button, Card, Divider, EmptyState, StatusChip } from '@/components';
import { useLogStream, type LogLevel } from '@/logging';
import { useTheme } from '@/theme';

/**
 * Diagnostics.
 *
 * The point of this screen is to make one chain visible on the phone, in order:
 *
 *   user event → API call → system processing → error → what the screen showed
 *
 * They are separate streams because they answer separate questions, but they
 * share a correlation ID, so a single refresh can be followed end to end
 * without opening a terminal.
 *
 * Development only — `ENABLE_DIAGNOSTICS` is false in production and the route
 * is not registered there.
 */
type Stream = 'logs' | 'events' | 'audit' | 'api' | 'errors';

const TABS: readonly { key: Stream; label: string }[] = [
  { key: 'logs', label: 'Logs' },
  { key: 'events', label: 'Events' },
  { key: 'audit', label: 'Audit' },
  { key: 'api', label: 'API' },
  { key: 'errors', label: 'Errors' },
];

const LEVEL_TONE: Record<LogLevel, 'neutral' | 'info' | 'warning' | 'error'> = {
  debug: 'neutral',
  info: 'info',
  warn: 'warning',
  error: 'error',
  critical: 'error',
};

interface Entry {
  id: string;
  timestamp: string;
  headline: string;
  detail: string;
  tone: 'neutral' | 'accent' | 'info' | 'warning' | 'error' | 'success';
  tag: string;
  correlationId?: string | null;
}

const time = (iso: string) => iso.slice(11, 23);

export const DiagnosticsScreen = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [stream, setStream] = useState<Stream>('logs');

  const logs = useLogStream((state) => state.entries);
  const clearLogs = useLogStream((state) => state.clear);
  const events = useAnalyticsStream((state) => state.entries);
  const clearEvents = useAnalyticsStream((state) => state.clear);
  const audit = useAuditStream((state) => state.entries);
  const clearAudit = useAuditStream((state) => state.clear);
  const api = useApiStream((state) => state.entries);
  const clearApi = useApiStream((state) => state.clear);

  const entries = useMemo<Entry[]>(() => {
    switch (stream) {
      case 'logs':
        return logs.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          headline: `${entry.category} ▸ ${entry.event}`,
          detail: entry.message ?? JSON.stringify(entry.metadata ?? {}),
          tone: LEVEL_TONE[entry.level],
          tag: entry.level,
          correlationId: entry.correlationId ?? null,
        }));

      case 'errors':
        return logs
          .filter((entry) => entry.level === 'error' || entry.level === 'critical')
          .map((entry) => ({
            id: entry.id,
            timestamp: entry.timestamp,
            headline: entry.event,
            detail: entry.message ?? JSON.stringify(entry.metadata ?? {}),
            tone: 'error' as const,
            tag: entry.level,
            correlationId: entry.correlationId ?? null,
          }));

      case 'events':
        return events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp,
          headline: event.name,
          detail: JSON.stringify(event.properties),
          tone: 'accent' as const,
          tag: event.source,
        }));

      case 'audit':
        return audit.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          headline: `${entry.stage} ▸ ${entry.action}`,
          detail: [
            entry.outcome,
            entry.durationMs !== undefined ? `${entry.durationMs}ms` : '',
            entry.reason ?? '',
            entry.metadata ? JSON.stringify(entry.metadata) : '',
          ]
            .filter(Boolean)
            .join(' · '),
          tone:
            entry.outcome === 'failed'
              ? ('error' as const)
              : entry.outcome === 'succeeded'
                ? ('success' as const)
                : ('neutral' as const),
          tag: entry.outcome,
          correlationId: entry.correlationId,
        }));

      case 'api':
        return api.map((call) => ({
          id: call.id,
          timestamp: call.timestamp,
          headline: `${call.method} ${call.url}`,
          detail: `${call.status ?? call.errorCode ?? 'no response'} · ${call.durationMs}ms · attempt ${call.attempt}`,
          tone: call.outcome === 'success' ? ('success' as const) : ('error' as const),
          tag: call.outcome,
          correlationId: call.correlationId,
        }));

      default:
        return [];
    }
  }, [stream, logs, events, audit, api]);

  const clearCurrent = () => {
    if (stream === 'logs' || stream === 'errors') clearLogs();
    else if (stream === 'events') clearEvents();
    else if (stream === 'audit') clearAudit();
    else clearApi();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID="screen-diagnostics">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
        }}
      >
        {TABS.map((tab) => {
          const selected = tab.key === stream;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setStream(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              style={{
                minHeight: theme.touchTarget.min - 8,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.pill,
                backgroundColor: selected ? theme.colors.accentSurface : theme.colors.surfaceAlt,
                borderWidth: theme.borderWidth.hairline,
                borderColor: selected ? theme.colors.accent : 'transparent',
              }}
            >
              <AppText variant="caption" tone={selected ? 'accent' : 'textSecondary'}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <AppText variant="caption" tone="textTertiary">
          {entries.length} entries · newest first
        </AppText>
        <Button label="Clear" variant="ghost" onPress={clearCurrent} />
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          flexGrow: 1,
        }}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        renderItem={({ item }) => (
          <Card style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <AppText variant="mono" tone="textTertiary">
                {time(item.timestamp)}
              </AppText>
              <StatusChip
                label={item.tag}
                tone={
                  item.tone === 'success'
                    ? 'success'
                    : item.tone === 'error'
                      ? 'error'
                      : item.tone === 'warning'
                        ? 'warning'
                        : item.tone === 'accent'
                          ? 'accent'
                          : 'neutral'
                }
              />
            </View>

            <AppText variant="bodyStrong">{item.headline}</AppText>

            {item.detail ? (
              <AppText variant="mono" tone="textSecondary">
                {item.detail}
              </AppText>
            ) : null}

            {item.correlationId ? (
              <>
                <Divider />
                <AppText variant="mono" tone="textTertiary">
                  #{item.correlationId}
                </AppText>
              </>
            ) : null}
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            kind={`diagnostics-${stream}`}
            icon="activity"
            title="Nothing recorded yet"
            body="Use the app for a moment — refresh, open a card, switch a scenario — and events will appear here."
          />
        }
      />
    </View>
  );
};
