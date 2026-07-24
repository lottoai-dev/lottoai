// components/ui/toggle.tsx
import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { softHaptic } from '../../lib/haptics';
import { useTheme } from '../../lib/theme';

const TRACK_OFF = 'rgba(255,255,255,0.14)';
const THUMB_OFF_X = 3;
const THUMB_ON_X = 23;

const SPRING = {
  damping: 18,
  stiffness: 240,
  mass: 0.7,
  overshootClamping: false,
};

export function Toggle({
  value,
  onChange,
  accent,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const on = accent ?? c.brand;
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, SPRING);
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [TRACK_OFF, on]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: THUMB_OFF_X + progress.value * (THUMB_ON_X - THUMB_OFF_X) },
    ],
  }));

  return (
    <Pressable
      onPress={() => {
        softHaptic();
        onChange(!value);
      }}
      hitSlop={8}
    >
      <Animated.View
        style={[
          {
            width: 48,
            height: 28,
            borderRadius: 14,
            justifyContent: 'center',
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: '#fff',
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
