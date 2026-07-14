// components/ui/app-alert.tsx
import React from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useTheme } from '../../lib/theme';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss: () => void;
};

export function AppAlert({ visible, title, message, buttons = [], onDismiss }: Props) {
  const theme = useTheme();
  const c = theme.colors;

  const defaultButtons: AlertButton[] = buttons.length > 0 ? buttons : [{ text: 'Tamam', style: 'default' }];

  const getButtonStyle = (style?: AlertButton['style']) => {
    switch (style) {
      case 'destructive': return { color: c.danger, fontFamily: theme.font.bold };
      case 'cancel': return { color: c.text2, fontFamily: theme.font.medium };
      default: return { color: c.brand, fontFamily: theme.font.bold };
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
            },
            theme.shadowSm,
          ]}
        >
          <Text style={[styles.title, { color: c.text, fontFamily: theme.font.extrabold }]}>
            {title}
          </Text>

          {message ? (
            <Text style={[styles.message, { color: c.text2, fontFamily: theme.font.regular }]}>
              {message}
            </Text>
          ) : null}

          <View style={[styles.divider, { backgroundColor: c.hairline }]} />

          <View style={[
            styles.buttons,
            defaultButtons.length === 2 && styles.buttonsRow,
          ]}>
            {defaultButtons.map((btn, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  btn.onPress?.();
                  onDismiss();
                }}
                style={({ pressed }) => [
                  styles.button,
                  defaultButtons.length === 2 && styles.buttonHalf,
                  i === 0 && defaultButtons.length === 2 && {
                    borderRightWidth: 1,
                    borderRightColor: c.hairline,
                  },
                  pressed && { backgroundColor: c.surfaceAlt },
                ]}
              >
                <Text style={[styles.buttonText, getButtonStyle(btn.style)]}>
                  {btn.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  title: {
    fontSize: 17,
    textAlign: 'center',
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 6,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    lineHeight: 20,
  },
  divider: {
    height: 1,
  },
  buttons: {
    flexDirection: 'column',
  },
  buttonsRow: {
    flexDirection: 'row',
  },
  button: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonHalf: {
    flex: 1,
  },
  buttonText: {
    fontSize: 15,
  },
});
