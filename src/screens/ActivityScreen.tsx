import { useState } from 'react';
import { View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import { FAB, type FabAction } from '@/components';
import { FlowView } from '@/features/activity/FlowView';
import { TransactionsList } from '@/features/activity/TransactionsList';
import { ChatSheet } from '@/features/chat/ChatSheet';
import { SegmentedControl } from '@/features/settings/SegmentedControl';
import { useTheme } from '@/theme';

type ActivityTab = 'transactions' | 'flow';

const TABS: { value: ActivityTab; label: string }[] = [
  { value: 'transactions', label: 'Transactions' },
  { value: 'flow', label: 'Flow' },
];

/**
 * Activity: the backward-looking half of the app, in two readings.
 *
 * *Transactions* is the ledger, row by row. *Flow* is the same money as
 * movement — where it came in and where it went — which is the web app's
 * `/flow` page.
 *
 * A `SegmentedControl` rather than a material top-tab navigator: those need
 * `react-native-pager-view`, a native module and therefore a rebuild, to buy a
 * swipe gesture between two tabs. This control already exists and already
 * announces itself as a radio group to VoiceOver.
 */
export const ActivityScreen = () => {
  const theme = useTheme();
  const [tab, setTab] = useState<ActivityTab>('transactions');
  const [chatOpen, setChatOpen] = useState(false);

  const fabActions: FabAction[] = [
    {
      key: 'ask-cashflow',
      label: 'Ask Cashflow',
      description: 'Ask a question, or drop in a screenshot',
      icon: 'message-circle',
      onPress: () => setChatOpen(true),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.xs,
        }}
      >
        <SegmentedControl
          label="Activity view"
          options={TABS}
          value={tab}
          onChange={(next) => {
            setTab(next);
            usageAnalytics.track('card.opened', 'activity', { target: next });
          }}
        />
      </View>

      {/* Unmounted rather than hidden: the transaction list is virtualised, and
          keeping it mounted behind Flow would hold its whole render window in
          memory for a tab nobody is looking at. */}
      {tab === 'transactions' ? <TransactionsList /> : <FlowView />}

      {/* Not AppScreen here — Activity owns a custom two-tab layout, not a
          single scroll region, so the FAB is mounted directly the same way
          AppScreen mounts it internally. */}
      <FAB actions={fabActions} source="activity" />
      <ChatSheet visible={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
};
