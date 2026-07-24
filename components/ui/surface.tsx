// components/ui/surface.tsx
import React from 'react';
import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { softHaptic } from '../../lib/haptics';
import { useTheme } from '../../lib/theme';

export function Surface({
  children,
  style,
  elevated = false,
  ...rest
}: ViewProps & { elevated?: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: elevated ? c.elevated : c.surface,
          borderRadius: theme.radius.xl,
        },
        elevated ? theme.shadowSm : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export const PressableScale = React.memo(function PressableScale({
  children,
  onPress,
  style,
  disabled,
  haptic = true,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        if (haptic) softHaptic();
        onPress?.();
      }}
      style={style}
    >
      {children}
    </Pressable>
  );
});
