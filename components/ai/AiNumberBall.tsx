// components/ai/AiNumberBall.tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { FontFamily } from '../../constants/theme';

type Variant = 'game' | 'bonus' | 'star' | 'matched';

const AI_BASE_DELAY_MS = 480;
const AI_STAGGER_MS = 155;

const softFillCache = new Map<string, string>();

function softFill(hex: string, alpha = 0.16): string {
  const key = `${hex}|${alpha}`;
  const cached = softFillCache.get(key);
  if (cached) return cached;
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const value = `rgba(${r},${g},${b},${alpha})`;
  softFillCache.set(key, value);
  return value;
}

function useBallColors(color: string, variant: Variant) {
  const accent = color;
  let bg = softFill(accent, 0.16);
  let fg = accent;

  if (variant === 'bonus') {
    bg = '#159ad5';
    fg = '#FFFFFF';
  } else if (variant === 'star') {
    bg = '#ffe103';
    fg = '#1A1407';
  } else if (variant === 'matched') {
    bg = accent;
    fg = '#FFFFFF';
  }

  return { bg, fg };
}

export const AiNumberBall = React.memo(function AiNumberBall({
  value,
  color = '#6366f1',
  size = 34,
  variant = 'matched',
  style,
  revealIndex,
  revealKey,
}: {
  value: number | string;
  color?: string;
  size?: number;
  variant?: Variant;
  style?: ViewStyle;
  revealIndex: number;
  /** Bump when a new AI generation starts so reveal replays. */
  revealKey: number;
}) {
  const { bg, fg } = useBallColors(color, variant);
  const fontSize = Math.round(size * 0.4);
  const progress = useSharedValue(0);
  const spin = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    spin.value = -14;
    glow.value = 0;

    const startAt = AI_BASE_DELAY_MS + revealIndex * AI_STAGGER_MS;

    spin.value = withDelay(
      startAt,
      withSequence(
        withTiming(10, { duration: 120 }),
        withSpring(0, { damping: 11, stiffness: 170 }),
      ),
    );

    glow.value = withDelay(
      startAt,
      withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0.35, { duration: 420 }),
      ),
    );

    progress.value = withDelay(
      startAt,
      withSequence(
        withSpring(1.14, { damping: 9, stiffness: 210, mass: 0.75 }),
        withSpring(1, { damping: 13, stiffness: 190 }),
      ),
    );
  }, [revealIndex, revealKey, progress, spin, glow]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [
      { scale: 0.28 + Math.min(1.14, progress.value) * 0.72 },
      { rotate: `${spin.value}deg` },
    ],
    shadowOpacity: glow.value * 0.45,
    shadowRadius: 8 + glow.value * 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: glow.value * 6,
  }));

  return (
    <Animated.View
      style={[
        styles.ball,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          shadowColor: color,
        },
        style,
        revealStyle,
      ]}
    >
      <Text style={[styles.text, { color: fg, fontSize }]} allowFontScaling={false}>
        {value}
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  ball: { alignItems: 'center', justifyContent: 'center' },
  text: {
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});

/** Total ms until the last main ball finishes its entrance (for button lock timing). */
export function aiRevealDurationMs(ballCount: number): number {
  if (ballCount <= 0) return AI_BASE_DELAY_MS + 700;
  return AI_BASE_DELAY_MS + (ballCount - 1) * AI_STAGGER_MS + 850;
}

export const AI_THINK_MIN_MS = 1100;
export const AI_THINK_EXTRA_MS = 450;
