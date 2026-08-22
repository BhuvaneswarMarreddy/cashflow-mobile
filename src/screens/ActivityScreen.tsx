import { useState } from 'react';
import { View } from 'react-native';

import { usageAnalytics } from '@/analytics';
import { AppScreen } from '@/components';
import { FlowView } from '@/features/activity/FlowView';
import { TransactionsList } from '@/features/activity/TransactionsList';
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
 *
 * `AppScreen` with `scroll={false}`: Activity has no actions of its own
 * (the FAB here is only ever the standing "Ask Cashflow" AppScreen appends),
 * and each tab's content — `TransactionsList`, `FlowView` — owns its own
 * `StatusBanner`, scrolling and pull-to-refresh already, so wrapping them in
 * AppScreen's `ScrollView` would nest two scroll regions and break both.
 */
export const ActivityScreen = () => {
  const theme = useTheme();
  const [tab, setTab] = useState<ActivityTab>('transactions');

  return (
    // No testID here: TransactionsList's own root already carries
    // `screen-activity` for the navigator suite (see its doc comment).
    <AppScreen scroll={false} padded={false} fabSource="activity">
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
    </AppScreen>
  );
};
