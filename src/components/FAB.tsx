import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { usageAnalytics, type InteractionSource } from '@/analytics';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Divider } from './Divider';
import { Icon, type IconName } from './Icon';
import { ListRow } from './ListRow';

export interface FabAction {
  /** Stable key, reported to telemetry: `refresh`, `add-transaction`. */
  key: string;
  label: string;
  description?: string;
  icon: IconName;
  onPress: () => void;
}

interface Props {
  actions: FabAction[];
  source: InteractionSource;
  /** Icon when there are several actions. Ignored for a single action. */
  icon?: IconName;
  label?: string;
}

/**
 * Context-aware floating action.
 *
 * One action behaves as a direct button; several open a sheet. The FAB itself
 * owns no behaviour — each screen supplies what is worth doing *there*, which
 * is the difference between a useful quick action and a button that always does
 * the same arbitrary thing.
 *
 * Positioning respects, in order: the tab bar, the home indicator, and the
 * keyboard (it hides entirely rather than floating over an input).
 */
export const FAB = ({ actions, source, icon = 'plus', label }: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const keyboardVisible = useKeyboardVisible();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (actions.length === 0 || keyboardVisible) return null;

  const single = actions.length === 1 ? actions[0] : null;
  const displayIcon = single?.icon ?? icon;
  const displayLabel = label ?? single?.label ?? 'Quick actions';

  const run = (action: FabAction) => {
    usageAnalytics.track('fab.selected', source, { target: action.key });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action.onPress();
  };

  const onPress = () => {
    if (single) {
      run(single);
      return;
    }
    usageAnalytics.track('fab.selected', source, { target: 'open-menu' });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetOpen(true);
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          right: theme.spacing.lg,
          // Clear the tab bar when inside one, the home indicator otherwise.
          bottom: (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + theme.spacing.lg,
        }}
      >
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={displayLabel}
          accessibilityHint={single ? undefined : 'Opens a list of quick actions'}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: theme.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            opacity: pressed ? theme.opacity.pressed : 1,
            ...theme.elevation(3),
          })}
        >
          <Icon name={displayIcon} size={24} color={theme.colors.textOnAccent} />
        </Pressable>
      </View>

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Quick actions">
        {actions.map((action, index) => (
          <View key={action.key}>
            {index > 0 ? <Divider inset={theme.spacing.huge} /> : null}
            <ListRow
              title={action.label}
              {...(action.description !== undefined ? { subtitle: action.description } : {})}
              leadingIcon={action.icon}
              leadingTone="accent"
              onPress={() => {
                setSheetOpen(false);
                run(action);
              }}
            />
          </View>
        ))}
        <AppText variant="caption" tone="textTertiary" style={{ paddingTop: theme.spacing.sm }}>
          Actions change with the screen you are on.
        </AppText>
      </BottomSheet>
    </>
  );
};
