import { useEffect, useState } from 'react';
import { Animated, Easing, Image, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

interface Props {
  size?: number;
  showWordmark?: boolean;
  /** Off for a still coin — list rows and headers do not need a light show. */
  animated?: boolean;
}

/**
 * The Cashflow mark: a gold coin with an embossed C and a slow gleam sweeping
 * across it — the same logo the web app draws in its own `LogoMark.tsx`, and
 * the same one baked into `icon.png` by `scripts/gen-icons.mjs`.
 *
 * The coin is the generated PNG rather than an SVG: its circle is the image's
 * bounding circle, so a plain `borderRadius` clips the gleam to the coin and
 * this component needs no renderer dependency at all.
 *
 * Gleam geometry is transcribed from the web mark's 64-unit viewBox (a 12×76
 * bar at 18°, travelling x −24→70 over 3.2s) rescaled to the 46-unit coin.
 */
const GLEAM_WIDTH = 12 / 46;
const GLEAM_HEIGHT = 76 / 46;
const GLEAM_TOP = -15 / 46;
const GLEAM_FROM = -33 / 46;
const GLEAM_TO = 61 / 46;
const GLEAM_MS = 3200;

export const LogoMark = ({ size = 28, showWordmark = false, animated = true }: Props) => {
  const theme = useTheme();
  // The gleam is decoration; under reduced motion the coin simply sits still.
  const gleaming = animated && !theme.reduceMotion;
  const [sweep] = useState(() => new Animated.Value(0));

  // Set together, always. See the note on the wordmark below.
  const wordmarkSize = size * 0.62;
  const wordmark = { fontSize: wordmarkSize, lineHeight: wordmarkSize * 1.18, letterSpacing: 0 };

  useEffect(() => {
    if (!gleaming) return;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: GLEAM_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [gleaming, sweep]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Cashflow"
      style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.28 }}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        <Image
          source={require('../../assets/logo-coin.png')}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
        {gleaming ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: size * GLEAM_TOP,
              width: size * GLEAM_WIDTH,
              height: size * GLEAM_HEIGHT,
              backgroundColor: '#ffffff',
              opacity: 0.25,
              transform: [
                { rotate: '18deg' },
                {
                  translateX: sweep.interpolate({
                    inputRange: [0, 1],
                    outputRange: [size * GLEAM_FROM, size * GLEAM_TO],
                  }),
                },
              ],
            }}
          />
        ) : null}
      </View>

      {showWordmark ? (
        /**
         * Two siblings, not nested `<Text>`, and `lineHeight` always set
         * alongside `fontSize`.
         *
         * Overriding a variant's `fontSize` while inheriting its `lineHeight`
         * is what clipped the tops off the C and the F: cap-height reaches
         * above the x-height, so at 40pt inside `heading`'s 34pt line box iOS
         * cropped exactly the capitals and left every lowercase letter intact.
         */
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <AppText variant="display" heading style={wordmark}>
            Cash
          </AppText>
          <AppText variant="display" style={[wordmark, { color: theme.colors.accent }]}>
            Flow
          </AppText>
        </View>
      ) : null}
    </View>
  );
};
