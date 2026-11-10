// components/ui/text.tsx
// react-native Text/TextInput'un yerine kullanilir. Sistem yazi boyutu buyutuldugunde
// yazilar en fazla MAX_FONT_SCALE kat buyur: erisilebilirlik korunur, kartlar tasmaz.
// (React 19'da fonksiyon bilesenlerinde defaultProps calismadigi icin global ayar yerine sarmalayici.)
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import type { Ref } from 'react';

export const MAX_FONT_SCALE = 1.3;

export function Text({ ref, ...props }: TextProps & { ref?: Ref<RNText> }) {
  return <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

export function TextInput({ ref, ...props }: TextInputProps & { ref?: Ref<RNTextInput> }) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}
