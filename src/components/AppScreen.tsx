import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import type { ReactNode } from 'react';
import { useContext, useState } from 'react';
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatSheet } from '@/features/chat/ChatSheet';
import { useTheme } from '@/theme';

import { FAB, type FabAction } from './FAB';

interface Props {
  children: ReactNode;
  /** Off for screens that own a FlatList — nesting scroll views breaks both. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  fabActions?: FabAction[];
  fabSource?: Parameters<typeof FAB>[0]['source'];
  /** Pinned above the scroll area, e.g. the offline banner. */
  banner?: ReactNode;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The frame every screen sits in.
 *
 * Owns the things that are wrong on exactly one screen if each screen owns them
 * itself: background colour, safe-area padding at the bottom, pull-to-refresh
 * wiring, and the FAB's relationship to the tab bar.
 *
 * The top inset is deliberately *not* handled here — the navigation header
 * already covers it, and adding it twice is the classic double-gap.
 *
 * The tab bar floats (`position: 'absolute'`, for the glass effect), so it no
 * longer reserves its own layout space — content would scroll under it
 * without this. `BottomTabBarHeightContext` reports the bar's real rendered
 * height and is 0 only when no tab bar is mounted at all (e.g. Sign in), where
 * `insets.bottom` is what is needed instead. Note the context stays non-zero
 * inside `presentation: 'modal'` screens nested in a tab's stack even though
 * an iOS sheet covers the bar — those forms carry a little extra bottom
 * padding, accepted as harmless. FAB uses the same source, so the two stay in
 * sync.
 *
 * Also the single home of "Ask Cashflow": the chat action and its ChatSheet
 * are appended and hosted here, once, rather than copy-pasted onto every
 * screen — so every screen that renders through AppScreen gets the FAB with
 * chat for free, on top of whatever actions it already had. The FAB is
 * therefore never empty and always renders.
 */
export const AppScreen = ({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  fabActions,
  fabSource = 'home',
  banner,
  padded = true,
  contentStyle,
  testID,
}: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [chatOpen, setChatOpen] = useState(false);

  const actions: FabAction[] = [
    ...(fabActions ?? []),
    {
      key: 'ask-ai',
      label: 'Ask Cashflow',
      icon: 'message-circle',
      onPress: () => setChatOpen(true),
    },
  ];

  const padding = padded
    ? { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg }
    : null;

  // Leaves room for the FAB (always present, chat if nothing else) and the
  // home indicator (or the floating tab bar) so the last row is reachable.
  const bottomInset = (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + theme.spacing.huge + 56;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID={testID}>
      {banner}

      {scroll ? (
        <ScrollView
          contentContainerStyle={[padding, { paddingBottom: bottomInset }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.accent}
                colors={[theme.colors.accent]}
                progressBackgroundColor={theme.colors.surface}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding, contentStyle]}>{children}</View>
      )}

      <FAB actions={actions} source={fabSource} />
      <ChatSheet visible={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
};
