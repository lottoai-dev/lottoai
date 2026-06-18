/**
 * LottoSplash.tsx — LottoAI açılış animasyonu (React Native / Expo).
 *
 * HTML splash'in birebir native karşılığı. react-native-svg + reanimated ile.
 * Bağımlılıklar (zaten package.json'da var):
 *   react-native-svg, react-native-reanimated, expo-linear-gradient
 *
 * Kullanım (en basit):
 *   const [showSplash, setShowSplash] = useState(true);
 *   ...
 *   {showSplash && <LottoSplash onFinish={() => setShowSplash(false)} />}
 *
 * expo-router ile kök layout entegrasyonu için dosyanın altındaki nota bak.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, G, Mask, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);

// ---- Marka geometrisi (viewBox 240) ----
const LEAVES: { cx: number; cy: number; dx: number; dy: number }[] = [
  { cx: 120, cy: 90, dx: 0, dy: -26 },   // üst
  { cx: 151, cy: 121, dx: 26, dy: 0 },   // sağ
  { cx: 120, cy: 152, dx: 0, dy: 26 },   // alt
  { cx: 89, cy: 121, dx: -26, dy: 0 },   // sol
];
const R = 37;
const CX = 120, CY = 121;

// 4-uçlu içbükey çekirdek (seed) path'i
const SEED_L = 20, SEED_W = 5.4;
const SEED_D =
  `M${CX} ${CY - SEED_L} ` +
  `C ${CX + SEED_W} ${CY - SEED_W} ${CX + SEED_W} ${CY - SEED_W} ${CX + SEED_L} ${CY} ` +
  `C ${CX + SEED_W} ${CY + SEED_W} ${CX + SEED_W} ${CY + SEED_W} ${CX} ${CY + SEED_L} ` +
  `C ${CX - SEED_W} ${CY + SEED_W} ${CX - SEED_W} ${CY + SEED_W} ${CX - SEED_L} ${CY} ` +
  `C ${CX - SEED_W} ${CY - SEED_W} ${CX - SEED_W} ${CY - SEED_W} ${CX} ${CY - SEED_L} Z`;

const COLORS = {
  leaf: '#F6F9F8',
  disc: '#15885F',
  emeraldA: '#28B083',
  emeraldB: '#1C9E73',
  emeraldC: '#178A63',
};

type Variant = 'disk' | 'disksiz';

interface Props {
  onFinish?: () => void;
  variant?: Variant;       // 'disk' (varsayılan) veya 'disksiz'
  size?: number;           // ikon kenarı (px), varsayılan 168
  showWordmark?: boolean;  // "LottoAI" yazısı, varsayılan true
  holdMs?: number;         // animasyon bitince ekranda bekleme, varsayılan 650
}

export default function LottoSplash({
  onFinish,
  variant = 'disk',
  size = 168,
  showWordmark = true,
  holdMs = 650,
}: Props) {
  const isDisksiz = variant === 'disksiz';

  // shared values
  const l0 = useSharedValue(0), l1 = useSharedValue(0), l2 = useSharedValue(0), l3 = useSharedValue(0);
  const leafSV = [l0, l1, l2, l3];
  const disc = useSharedValue(0);
  const seed = useSharedValue(0);
  const glint = useSharedValue(0);
  const word = useSharedValue(0);
  const tag = useSharedValue(0);

  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (cancelled) return;
      setReduceMotion(rm);
      if (rm) {
        // hareket kapalı: son kareye anında geç
        leafSV.forEach((s) => (s.value = 1));
        disc.value = 1; seed.value = 1; word.value = 1; tag.value = 1;
        const t = setTimeout(() => onFinish?.(), 900);
        return () => clearTimeout(t);
      }

      // sahne (HTML ile aynı zamanlama)
      const springCfg = { damping: 9, stiffness: 140, mass: 0.7 };
      leafSV.forEach((s, i) => {
        s.value = withDelay(100 + i * 100, withSpring(1, springCfg));
      });
      disc.value = withDelay(620, withSpring(1, { damping: 8, stiffness: 170 }));
      seed.value = withDelay(820, withSpring(1, { damping: 8, stiffness: 160 }));
      glint.value = withDelay(
        1000,
        withSequence(
          withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }),
        ),
      );
      word.value = withDelay(1150, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
      tag.value = withDelay(
        1340,
        withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }, (done) => {
          'worklet';
          if (done && onFinish) runOnJS(onFinish)();
        }),
      );
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // leaf animated props (her biri ayrı hook)
  const lp0 = useAnimatedProps(() => leafProps(l0, LEAVES[0]));
  const lp1 = useAnimatedProps(() => leafProps(l1, LEAVES[1]));
  const lp2 = useAnimatedProps(() => leafProps(l2, LEAVES[2]));
  const lp3 = useAnimatedProps(() => leafProps(l3, LEAVES[3]));
  const leafProplist = [lp0, lp1, lp2, lp3];

  const discProps = useAnimatedProps(() => ({
    opacity: disc.value,
    transform: [{ scale: disc.value }],
    originX: CX, originY: CY,
  }));

  const seedProps = useAnimatedProps(() => ({
    opacity: isDisksiz ? 0 : seed.value, // disksiz'de seed çizilmez (maske ile oyulur)
    transform: [{ scale: seed.value }, { rotate: `${(1 - seed.value) * -40}deg` }],
    originX: CX, originY: CY,
  }));

  const glintProps = useAnimatedProps(() => ({
    opacity: glint.value * 0.9,
    transform: [{ scale: 0.3 + glint.value * 1.3 }],
    originX: CX, originY: CY,
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: (1 - word.value) * 12 }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tag.value,
    transform: [{ translateY: (1 - tag.value) * 12 }],
  }));

  // disksiz: yonca beyaz, seed negatif (oyuk) -> arka plan görünür
  const cloverFill = COLORS.leaf;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1E3A31', '#0E2A24', '#08201B']}
        start={{ x: 0.3, y: 0.1 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.iconWrap, { width: size, height: size, borderRadius: size * 0.226 }]}>
        <LinearGradient
          colors={[COLORS.emeraldA, COLORS.emeraldB, COLORS.emeraldC]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size * 0.226 }]}
        />
        <Svg viewBox="0 0 240 240" width={size} height={size}>
          <Defs>
            <RadialGradient id="glintG" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
            <Mask id="seedCut">
              <Rect width={240} height={240} fill="white" />
              <Path d={SEED_D} fill="black" />
            </Mask>
          </Defs>

          {/* Yapraklar (disksiz'de seed maskesiyle oyulur) */}
          <G mask={isDisksiz ? 'url(#seedCut)' : undefined}>
            {LEAVES.map((lf, i) => (
              <ACircle
                key={i}
                cx={lf.cx}
                cy={lf.cy}
                r={R}
                fill={cloverFill}
                animatedProps={leafProplist[i]}
              />
            ))}
          </G>

          {/* Disk (yalnız diskli) */}
          {!isDisksiz && (
            <ACircle cx={CX} cy={CY} r={27} fill={COLORS.disc} animatedProps={discProps} />
          )}

          {/* Çekirdek (yalnız diskli; disksiz'de zaten oyuk) */}
          {!isDisksiz && (
            <APath d={SEED_D} fill={COLORS.leaf} animatedProps={seedProps} />
          )}

          {/* Parıltı */}
          <ACircle cx={CX} cy={CY} r={30} fill="url(#glintG)" animatedProps={glintProps} />
        </Svg>
      </View>

      {showWordmark && (
        <>
          <Animated.View style={[styles.wordRow, wordStyle]}>
            <Text style={styles.lotto}>Lotto</Text>
            <Text style={styles.ai}>AI</Text>
          </Animated.View>
          <Animated.Text style={[styles.tag, tagStyle]}>AKILLI ŞANS</Animated.Text>
        </>
      )}
    </View>
  );
}

// worklet helper — leaf transform/opacity
function leafProps(sv: { value: number }, lf: { cx: number; cy: number; dx: number; dy: number }) {
  'worklet';
  const v = sv.value;
  return {
    opacity: v,
    transform: [
      { translateX: (1 - v) * lf.dx },
      { translateY: (1 - v) * lf.dy },
      { scale: 0.2 + 0.8 * v },
    ],
    originX: lf.cx,
    originY: lf.cy,
  } as any;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    backgroundColor: '#08201B',
  },
  iconWrap: {
    overflow: 'hidden',
    // hafif gölge
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  wordRow: { flexDirection: 'row', alignItems: 'center' },
  lotto: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: '#EAF4F0' },
  ai: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: '#7FE3BD' },
  tag: {
    marginTop: -18,
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 3,
    color: 'rgba(220,238,232,0.55)',
  },
});

/* ------------------------------------------------------------------ *
 * expo-router KÖK ENTEGRASYONU  (app/_layout.tsx)
 * ------------------------------------------------------------------ *

import { useState, useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import LottoSplash from '@/components/LottoSplash'; // dosyanın konumuna göre

SplashScreen.preventAutoHideAsync(); // native (statik) splash'i elde tut

export default function RootLayout() {
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    // native statik splash'i gizle ki bizim animasyon görünsün
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <Stack> ... </Stack>
      {!animDone && (
        <LottoSplash variant="disk" onFinish={() => setAnimDone(true)} />
      )}
    </>
  );
}

 * ------------------------------------------------------------------ *
 * NATIVE (statik) SPLASH + APP İKONU — app.json / app.config
 * ------------------------------------------------------------------ *
 * Animasyon başlamadan önceki ilk kareyi statik PNG ile eşle:
 *
 *   "expo": {
 *     "icon": "./assets/icon/LottoAI-AppStore-1024.png",
 *     "splash": {
 *       "image": "./assets/icon/LottoAI-iOS-180.png",
 *       "resizeMode": "contain",
 *       "backgroundColor": "#0E2A24"
 *     },
 *     "android": {
 *       "adaptiveIcon": {
 *         "foregroundImage": "./assets/icon/adaptive-foreground-432.png",
 *         "backgroundColor": "#1C9E73"
 *       }
 *     }
 *   }
 *
 * (PNG'leri indirdiğin paketten assets/icon/ altına kopyala.)
 * ------------------------------------------------------------------ */
