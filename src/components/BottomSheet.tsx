import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned below the scrolling body, e.g. a chat input row — never scrolls away. */
  footer?: ReactNode;
  /** Lets a consumer (e.g. a chat transcript) call `.scrollToEnd()` on the body. */
  scrollRef?: RefObject<ScrollView | null>;
}

/** Drag further than this and releasing dismisses instead of springing back. */
const DISMISS_AFTER = 110;

/**
 * Bottom sheet built on React Native's `Modal`.
 *
 * Deliberately not `@gorhom/bottom-sheet`: that pulls in Reanimated and Gesture
 * Handler, and what this needs is a panel that slides up, scrolls, and can be
 * flung away — `PanResponder` and `Animated` are already here and do it.
 *
 * Three properties that are load-bearing rather than polish, all learned from
 * the same failure — a category's two hundred transactions rendered into an
 * uncapped sheet:
 *
 *  1. **Capped height.** Uncapped, the sheet grows upward past the top of the
 *     screen and puts its own content under the status bar.
 *  2. **Pinned header.** It sits outside the scroll view, so the close button
 *     cannot be carried off-screen by a long child. When it was inside, the
 *     only way out of the sheet was to force-quit the app.
 *  3. **Scrolling body**, with `flexShrink: 1` AND `flexGrow: 0` — without
 *     `flexShrink` the ScrollView keeps its full content height and the cap
 *     has no effect at all; without `flexGrow: 0` it swings the other way
 *     and stretches to fill the cap even when content is much shorter (RN's
 *     ScrollView.js default is `flexGrow: 1`), leaving dead space above the
 *     footer instead of the sheet hugging short content. See the ScrollView
 *     below for the full story.
 */
export const BottomSheet = ({ visible, onClose, title, children, footer, scrollRef }: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [slide] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  // Never taller than most of the screen: the strip left above it is what says
  // "this is a panel over the page", and it is where you tap to dismiss.
  const maxHeight = height * 0.85 - insets.top;

  useEffect(() => {
    if (visible) drag.setValue(0);
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: theme.duration.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide, drag, theme.duration.base]);

  /**
   * Swipe down to dismiss.
   *
   * Attached to the header only, never the whole sheet: a responder over the
   * body would swallow the scroll gesture, and a list you cannot scroll is the
   * problem this sheet already had once.
   */
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claims the gesture only once it is clearly a downward drag, so a tap
        // on the close button still registers as a tap.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          // Downward only. Dragging up must not lift the sheet off its edge.
          if (gesture.dy > 0) drag.setValue(gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          // Velocity as well as distance: a short fast flick is a dismiss, and
          // requiring the full drag would make the sheet feel stuck.
          if (gesture.dy > DISMISS_AFTER || gesture.vy > 0.6) {
            Animated.timing(drag, {
              toValue: height,
              duration: theme.duration.fast,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }).start(() => onClose());
            return;
          }
          Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    // Rebuilt when the handler changes so a dismiss can never fire a stale
    // `onClose`. Safe to recreate: `drag.setValue` does not re-render, so no
    // rebuild can happen mid-gesture.
    [drag, height, onClose, theme.duration.fast],
  );

  const translateY = Animated.add(
    slide.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }),
    drag,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* The backdrop is a SIBLING of the sheet, not its parent.
          Nested, its `Pressable` claimed the touch responder before the body's
          ScrollView could, and the list would not scroll at all — a Pressable
          ancestor swallows the pan. Keeping them siblings means a tap outside
          still dismisses while gestures inside reach the content.

          KeyboardAvoidingView on the OUTER container, not just around a
          footer: "padding" shrinks THIS view by the keyboard's height, and
          because the sheet inside is anchored to `flex-end`, it rides up to
          sit right above the keyboard rather than being covered by it. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />

        <Animated.View
          accessibilityViewIsModal
          style={{
            maxHeight,
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius.card,
            borderTopRightRadius: theme.radius.card,
            transform: [{ translateY }],
          }}
        >
          <View {...pan.panHandlers}>
            {/* Grabber: the one-glance signal that this can be flung away. */}
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 4,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.border,
                marginTop: theme.spacing.sm,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingLeft: theme.spacing.xl,
                paddingRight: theme.spacing.sm,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.sm,
              }}
            >
              <AppText variant="bodyStrong" heading numberOfLines={1} style={{ flex: 1 }}>
                {title}
              </AppText>
              <IconButton icon="x" onPress={onClose} accessibilityLabel="Close" size={20} />
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            testID="bottom-sheet-scroll"
            // flexShrink lets the body give way to the cap; without it the
            // ScrollView keeps its full content height and the cap does
            // nothing. flexGrow: 0 is the other half: RN's ScrollView.js
            // gives EVERY ScrollView (vertical included, not just horizontal
            // ones — see `baseVertical`/`baseHorizontal` in ScrollView.js) a
            // default flexGrow: 1. Left at that default, this ScrollView
            // stretches to fill the sheet's maxHeight cap even when its
            // content (the transcript) is much shorter — e.g. a single short
            // report card — leaving dead space between the content and the
            // footer. flexGrow: 0 makes the body hug the transcript's actual
            // height instead; the cap (maxHeight above, flexShrink here)
            // still applies once content genuinely exceeds it.
            style={{ flexShrink: 1, flexGrow: 0 }}
            contentContainerStyle={{
              paddingHorizontal: theme.spacing.lg,
              // A footer supplies its own safe-area padding below; without a
              // footer the scrolling body is the bottom-most thing and needs it.
              paddingBottom: footer ? theme.spacing.lg : insets.bottom + theme.spacing.lg,
            }}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? (
            <View
              style={{
                borderTopWidth: theme.borderWidth.hairline,
                borderTopColor: theme.colors.border,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.sm,
                paddingBottom: insets.bottom + theme.spacing.sm,
              }}
            >
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
