// lib/emblems.tsx
import React from 'react';
import { Image, StyleSheet } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { GameAccent } from '../constants/theme';

type EmblemProps = { game: string; size?: number };

export const GameEmblem = React.memo(function GameEmblem({ game, size = 40 }: EmblemProps) {
  const c = GameAccent[game] ?? '#1C9E73';
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <Rect width={40} height={40} rx={12} fill={c} />
      {game === 'cilgin' && (
        <G>
          <Circle cx={20} cy={20} r={11} fill="none" stroke="#fff" strokeWidth={2.2} opacity={0.95} />
          <Circle cx={16} cy={16} r={2.6} fill="#fff" opacity={0.9} />
        </G>
      )}
      {game === 'superloto' && (
        <Path d="M20 9l2.6 7.4L30 19l-7.4 2.6L20 29l-2.6-7.4L10 19l7.4-2.6L20 9z" fill="#fff" />
      )}
      {game === 'sanstopu' && (
        <G fill="#fff">
          <Circle cx={16} cy={16} r={4.3} />
          <Circle cx={24} cy={16} r={4.3} />
          <Circle cx={16} cy={24} r={4.3} />
          <Circle cx={24} cy={24} r={4.3} />
        </G>
      )}
      {game === 'onnumara' && (
        <G fill="#fff">
          <Circle cx={15} cy={15} r={2.4} />
          <Circle cx={20} cy={15} r={2.4} />
          <Circle cx={25} cy={15} r={2.4} />
          <Circle cx={15} cy={20} r={2.4} />
          <Circle cx={20} cy={20} r={2.4} />
          <Circle cx={25} cy={20} r={2.4} />
          <Circle cx={15} cy={25} r={2.4} />
          <Circle cx={20} cy={25} r={2.4} />
          <Circle cx={25} cy={25} r={2.4} />
        </G>
      )}
    </Svg>
  );
});

// bg ve fg prop'ları kaldırıldı — icon.png kullandığı için bu renkler etkisiz
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../assets/images/icon.png')}
      style={[styles.brandImage, { width: size, height: size, borderRadius: size * 0.3 }]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  brandImage: {},
});