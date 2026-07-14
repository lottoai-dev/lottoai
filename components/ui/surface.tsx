// components/ui/surface.tsx
import React from 'react';
import { Pressable, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '../../lib/theme';

export function Surface({
  children,
  style,
  elevated = true,
  ...rest
}: ViewProps & { elevated?: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: c.border,
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
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        onPress?.();
      }}
      style={style}
    >
      {children}
    </Pressable>
  );
});
