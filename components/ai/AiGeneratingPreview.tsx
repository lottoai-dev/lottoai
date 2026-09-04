// components/ai/AiGeneratingPreview.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppTheme } from '../../constants/theme';
import type { Game } from '../../lib/games';
import { SparkIcon } from '../../lib/icons';
import { useTheme } from '../../lib/theme';

type BallLayout = { size: number; gap: number; nowrap: boolean };

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function AiGeneratingPreview({
  game,
  ballLayout,
  accentColor,
}: {
  game: Game;
  ballLayout: BallLayout;
  accentColor: string;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const s = makeStyles(theme);
  const slotCount = game.count + (game.bonus?.count ?? 0) + (game.superStar ? 1 : 0);
  const [slots, setSlots] = useState(() =>
    Array.from({ length: slotCount }, () => randomInt(1, game.max)),
  );

  const pulse = useSharedValue(0.55);
  const spin = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 680, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.55, { duration: 680, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    spin.value = withRepeat(withTiming(360, { duration: 2400, easing: Easing.linear }), -1, false);
  }, [pulse, spin]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSlots((prev) =>
        prev.map((_, i) => {
          const isBonus = i >= game.count && i < game.count + (game.bonus?.count ?? 0);
          const isStar = game.superStar && i === slotCount - 1;
          const max = isStar ? game.superStar!.max : isBonus ? game.bonus!.max : game.max;
          return randomInt(1, max);
        }),
      );
    }, 90);
    return () => clearInterval(tick);
  }, [game, slotCount]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.94 + pulse.value * 0.08 }],
  }));

  const iconSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const fontSize = Math.round(ballLayout.size * 0.38);

  return (
    <View style={s.wrap}>
      <Animated.View style={[s.iconRing, { borderColor: `${accentColor}33` }, glowStyle]}>
        <Animated.View style={iconSpinStyle}>
          <SparkIcon color={accentColor} size={28} />
        </Animated.View>
      </Animated.View>
      <Text style={[s.status, { color: c.brand }]}>Lota üretiyor…</Text>
      <Text style={s.hint}>Kolon hazırlanıyor</Text>
      <View
        style={[
          s.balls,
          { gap: ballLayout.gap },
          ballLayout.nowrap ? s.ballsNowrap : null,
        ]}
      >
        {slots.map((num, i) => {
          const isBonus = i >= game.count && i < game.count + (game.bonus?.count ?? 0);
          const isStar = game.superStar && i === slotCount - 1;
          let bg = `${accentColor}18`;
          let fg = accentColor;
          if (isBonus) {
            bg = '#159ad522';
            fg = '#159ad5';
          } else if (isStar) {
            bg = '#ffe10333';
            fg = '#9A7B00';
          }
          return (
            <Animated.View
              key={i}
              style={[
                s.slot,
                {
                  width: ballLayout.size,
                  height: ballLayout.size,
                  borderRadius: ballLayout.size / 2,
                  backgroundColor: bg,
                  borderColor: `${fg}44`,
                },
                glowStyle,
              ]}
            >
              <Text style={[s.slotText, { color: fg, fontSize }]} allowFontScaling={false}>
                {num}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { typography: ty } = theme;
  return StyleSheet.create({
    wrap: { alignItems: 'center', gap: 10, paddingVertical: 10 },
    iconRing: {
      width: 56,
      height: 56,
      borderRadius: 18,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.brandSoft,
      marginBottom: 2,
    },
    status: { ...ty.title, fontSize: 17 },
    hint: { ...ty.caption, color: c.text3, marginBottom: 8 },
    balls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    ballsNowrap: { flexWrap: 'nowrap' },
    slot: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    slotText: {
      fontFamily: theme.font.bold,
      fontVariant: ['tabular-nums'],
      includeFontPadding: false,
    },
  });
}
