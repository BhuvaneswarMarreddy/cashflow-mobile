import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { usageAnalytics, type InteractionSource } from '@/analytics';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

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
  /** Toggle icon, rotated 45° into an × while open. */
  icon?: IconName;
  label?: string;
}

const FAB_SIZE = 56;
/** 44 is the Apple/WCAG floor — matches `theme.touchTarget.min`, mirrored as a
 *  literal because the fit-math below reads plainer with plain numbers. */
const MINI_SIZE = 44;
const GAP = 12; // theme.spacing.md
/** Vertical pitch of the stack: one mini button plus the gap after it. */
const ROW = MINI_SIZE + GAP;

/**
 * Context-aware floating action, as a classic speed-dial.
 *
 * Tapping the toggle fans mini action buttons out vertically above it — every
 * screen's "Ask Cashflow" among them (see AppScreen) — rather than opening a
 * picker sheet. Even a single action still fans out one button: a screen that
 * sometimes shows one action and sometimes three should not teach two
 * different gestures for the same button.
 *
 * Positioning respects, in order: the tab bar, the home indicator, and the
 * keyboard (it hides entirely rather than floating over an input).
 *
 * Fit-by-construction: the owner caps quick actions at 4 (today's fullest
 * screen — Accounts' 3 plus the standing chat action). The stack's own height
 * is `N * ROW` regardless of screen size, so what matters is how much air sits
 * below the header on the shortest current target. On an iPhone SE (667pt
 * tall, ~49pt tab bar, no home-indicator inset), the tallest mini button's top
 * edge sits at `49 + 16 (spacing.lg) + 56 (FAB) + 4 * 56 (ROW×4)` ≈ 345pt off
 * the bottom of the screen — comfortably clear of the ~90pt header, with N=4
 * as the worst case today. No cap or scroll needed unless that count grows.
 *
 * The open fan (backdrop + mini buttons) renders inside a `Modal`, not as a
 * sibling in the screen's own view tree: a plain sibling paints *below* the
 * floating glass tab bar (a sibling at the navigator level, rendered after
 * screen content), so the bar stayed reachable — both to a finger and to
 * VoiceOver — while the dial was open. A `Modal` is its own native window
 * above everything else in the app, so the tab bar and the rest of the
 * screen are genuinely unreachable while it is up. The toggle button itself
 * stays outside the `Modal`, in its usual spot, so its own tap target never
 * moves.
 *
 * Because the `Modal`'s coordinate space is the device screen rather than
 * wherever this component happens to sit, the fan is positioned from the
 * toggle's real on-screen box — measured off the toggle via `onLayout` +
 * `measureInWindow` — rather than assumed to share an origin with it. The
 * `right`/`bottom` tab-bar-height formula below is both the toggle's own
 * position AND the fallback anchor for the brief window before the first
 * measurement lands (and for tests, where a real `onLayout` never fires) —
 * so the visual position is identical either way.
 */
export const FAB = ({ actions, source, icon = 'plus', label }: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const keyboardVisible = useKeyboardVisible();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [rotation] = useState(() => new Animated.Value(0));
  const toggleRef = useRef<View>(null);
  /** The toggle's real on-screen box, in the `Modal`'s window coordinates. */
  const [anchor, setAnchor] = useState<{ right: number; bottom: number } | null>(null);

  useEffect(() => {
    const toValue = open ? 1 : 0;
    if (theme.reduceMotion) {
      rotation.setValue(toValue);
      return;
    }
    Animated.spring(rotation, {
      toValue,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [open, rotation, theme.reduceMotion]);

  if (actions.length === 0 || keyboardVisible) return null;

  const toggleLabel = label ?? 'Quick actions';
  // Clears the tab bar when inside one, the home indicator otherwise — the
  // same source AppScreen's bottom padding reads, so the two stay in sync.
  const bottom = (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + theme.spacing.lg;

  // Re-measured on every layout pass the toggle goes through — mount,
  // tab-bar-height changes, keyboard visibility — so it never goes stale.
  const measureAnchor = () => {
    toggleRef.current?.measureInWindow((x, y, width) => {
      setAnchor({ right: windowWidth - x - width, bottom: windowHeight - y });
    });
  };

  // Falls back to the toggle's own formula until the first measurement lands.
  const fanRight = anchor?.right ?? theme.spacing.lg;
  const fanBottom = anchor?.bottom ?? bottom + FAB_SIZE;

  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    usageAnalytics.track('fab.selected', source, { target: open ? 'close-menu' : 'open-menu' });
    setOpen((current) => !current);
  };

  const select = (action: FabAction) => {
    usageAnalytics.track('fab.selected', source, { target: action.key });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(false);
    action.onPress();
  };

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <>
      {/* transparent + statusBarTranslucent: a real window above the whole
          app, tab bar included. animationType "none" — the toggle's own
          Animated.spring (already reduceMotion-aware, above) is the only
          motion the open/close transition gets; a second, non-reduceMotion-
          aware fade from the Modal itself would fight it. */}
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        {/* Sibling of the trapped content below, not its parent — same
            reasoning as BottomSheet's backdrop: a Pressable ancestor would
            claim the touch responder before the mini buttons could. Also
            deliberately OUTSIDE accessibilityViewIsModal: VoiceOver can't
            swipe to it, but a sighted tap still reaches it, same as
            BottomSheet's backdrop. */}
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close quick actions"
          testID="fab-backdrop"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />

        {/* Traps VoiceOver focus to the mini buttons while the fan is open —
            without this, a screen-reader user could swipe past the backdrop
            into the screen content sitting behind it. */}
        <View
          accessibilityViewIsModal
          pointerEvents="box-none"
          testID="fab-fan"
          style={StyleSheet.absoluteFill}
        >
          {actions.map((action, index) => (
            <View
              key={action.key}
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                right: fanRight,
                bottom: fanBottom + GAP + index * ROW,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
              }}
            >
              <View
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.xs,
                  ...theme.elevation(2),
                }}
              >
                <AppText variant="secondary" numberOfLines={1}>
                  {action.label}
                </AppText>
              </View>
              <Pressable
                onPress={() => select(action)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={action.description}
                testID={`fab-action-${action.key}`}
                style={({ pressed }) => ({
                  width: MINI_SIZE,
                  height: MINI_SIZE,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surface,
                  opacity: pressed ? theme.opacity.pressed : 1,
                  ...theme.elevation(2),
                })}
              >
                <Icon name={action.icon} size={20} color={theme.colors.accent} />
              </Pressable>
            </View>
          ))}
        </View>
      </Modal>

      <View
        ref={toggleRef}
        onLayout={measureAnchor}
        pointerEvents="box-none"
        style={{ position: 'absolute', right: theme.spacing.lg, bottom }}
      >
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityHint={open ? undefined : 'Opens a fan of quick actions'}
          accessibilityState={{ expanded: open }}
          testID="fab-toggle"
          style={({ pressed }) => ({
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: theme.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            opacity: pressed ? theme.opacity.pressed : 1,
            ...theme.elevation(3),
          })}
        >
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Icon name={icon} size={24} color={theme.colors.textOnAccent} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
};
