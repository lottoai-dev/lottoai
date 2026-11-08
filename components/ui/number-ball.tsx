// components/ui/number-ball.tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { FontFamily } from '../../constants/theme';
import { useTheme } from '../../lib/theme';

type Variant = 'game' | 'bonus' | 'star' | 'muted' | 'matched';

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

const REVEAL_SPRING = {
  damping: 18,
  stiffness: 240,
  mass: 0.7,
  overshootClamping: false,
};

const REVEAL_STAGGER_MS = 45;

type NumberBallProps = {
  value: number | string;
  color?: string;
  size?: number;
  variant?: Variant;
  style?: ViewStyle;
  /** When set, plays a short stagger reveal on mount (coupon generate). */
  revealIndex?: number;
  /**
   * Topun içine ince bir halka çizer (ör. kullanıcının zorunlu tuttuğu sayı).
   * Halka topun kendi alanında kalır; top boyutu ve aralıklar değişmez.
   */
  ring?: boolean;
};

/** Topun içindeki halka. Rengi yazı rengiyle aynı, her varyantta okunur. */
function BallRing({ size, color }: { size: number; color: string }) {
  const inset = Math.max(2, Math.round(size * 0.07));
  return (
    <View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
          borderRadius: size / 2 - inset,
          borderColor: color,
        },
      ]}
    />
  );
}

function useBallColors(color: string | undefined, variant: Variant) {
  const theme = useTheme();
  const c = theme.colors;
  const accent = color ?? c.brand;
  let bg = softFill(accent, 0.16);
  let fg = accent;

  if (variant === 'bonus') {
    bg = '#159ad5';
    fg = '#FFFFFF';
  } else if (variant === 'star') {
    bg = '#ffe103';
    fg = '#1A1407';
  } else if (variant === 'muted') {
    bg = c.surfaceAlt;
    fg = c.text3;
  } else if (variant === 'matched') {
    bg = accent;
    fg = '#FFFFFF';
  } else if (variant === 'game' && !color) {
    bg = c.brandSoft;
    fg = c.brand;
  }

  return { bg, fg };
}

const StaticBall = React.memo(function StaticBall({
  value,
  color,
  size = 34,
  variant = 'game',
  style,
  ring,
}: Omit<NumberBallProps, 'revealIndex'>) {
  const { bg, fg } = useBallColors(color, variant);
  const fontSize = Math.round(size * 0.4);

  return (
    <View
      style={[
        styles.ball,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
      ]}
    >
      {ring ? <BallRing size={size} color={fg} /> : null}
      <Text style={[styles.text, { color: fg, fontSize }]} allowFontScaling={false}>
        {value}
      </Text>
    </View>
  );
});

const RevealBall = React.memo(function RevealBall({
  value,
  color,
  size = 34,
  variant = 'game',
  style,
  revealIndex,
  ring,
}: NumberBallProps & { revealIndex: number }) {
  const { bg, fg } = useBallColors(color, variant);
  const fontSize = Math.round(size * 0.4);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      revealIndex * REVEAL_STAGGER_MS,
      withSpring(1, REVEAL_SPRING),
    );
  }, [revealIndex, progress]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.72 + progress.value * 0.28 }],
  }));

  return (
    <Animated.View
      style={[
        styles.ball,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
        revealStyle,
      ]}
    >
      {ring ? <BallRing size={size} color={fg} /> : null}
      <Text style={[styles.text, { color: fg, fontSize }]} allowFontScaling={false}>
        {value}
      </Text>
    </Animated.View>
  );
});

export const NumberBall = React.memo(function NumberBall({
  revealIndex,
  ...rest
}: NumberBallProps) {
  if (revealIndex == null) {
    return <StaticBall {...rest} />;
  }
  return <RevealBall {...rest} revealIndex={revealIndex} />;
});

const styles = StyleSheet.create({
  ball: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5, opacity: 0.85 },
  text: {
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});
