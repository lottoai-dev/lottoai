import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = {
  color: string;
  size: number;
};

export function HomeIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2L2 9h3v11h6v-6h2v6h6V9h3L12 2z" fill={color} opacity={0.9} />
      <Circle cx="12" cy="7" r="1.5" fill="#FFD700" />
    </Svg>
  );
}

export function GenerateIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={color} opacity={0.15} />
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" />
      <Circle cx="8" cy="9" r="1.5" fill={color} />
      <Circle cx="12" cy="7" r="1.5" fill={color} />
      <Circle cx="16" cy="9" r="1.5" fill={color} />
      <Circle cx="8" cy="15" r="1.5" fill={color} />
      <Circle cx="16" cy="15" r="1.5" fill={color} />
      <Circle cx="12" cy="17" r="1.5" fill="#FFD700" />
    </Svg>
  );
}

export function ResultsIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="18" height="18" rx="3" fill={color} opacity={0.15} />
      <Rect x="3" y="3" width="18" height="18" rx="3" stroke={color} strokeWidth="1.5" />
      <Circle cx="8" cy="9" r="2" fill={color} />
      <Circle cx="12" cy="9" r="2" fill={color} />
      <Circle cx="16" cy="9" r="2" fill={color} />
      <Circle cx="8" cy="15" r="2" fill={color} />
      <Circle cx="12" cy="15" r="2" fill={color} />
      <Circle cx="16" cy="15" r="2" fill="#FFD700" />
    </Svg>
  );
}

export function CheckIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="2" width="14" height="20" rx="2" fill={color} opacity={0.15} />
      <Rect x="3" y="2" width="14" height="20" rx="2" stroke={color} strokeWidth="1.5" />
      <Path d="M7 8h8M7 12h8M7 16h5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Circle cx="19" cy="18" r="4" fill="#6BCB77" />
      <Path d="M17 18l1.5 1.5L21 16.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function AnalyzeIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="10" cy="10" r="7" fill={color} opacity={0.15} />
      <Circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.5" />
      <Path d="M15 15l5 5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M7 10h6M10 7v6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function SavedIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="4" width="20" height="16" rx="2" fill={color} opacity={0.15} />
      <Rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="1.5" />
      <Path d="M6 4v4l3-2 3 2V4" fill={color} />
      <Path d="M2 10h20" stroke={color} strokeWidth="1" opacity={0.5} />
      <Circle cx="8" cy="15" r="1.5" fill={color} />
      <Circle cx="12" cy="15" r="1.5" fill={color} />
      <Circle cx="16" cy="15" r="1.5" fill={color} />
    </Svg>
  );
}

export function NotificationIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C8.5 2 6 4.5 6 8v5l-2 3h16l-2-3V8c0-3.5-2.5-6-6-6z"
        fill={color} opacity={0.15}
        stroke={color} strokeWidth="1.5"
      />
      <Path d="M10 19c0 1.1.9 2 2 2s2-.9 2-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Circle cx="17" cy="5" r="3" fill="#FF6B6B" />
    </Svg>
  );
}

export function ProfileIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" fill={color} opacity={0.15} stroke={color} strokeWidth="1.5" />
      <Path
        d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
        fill={color} opacity={0.15}
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
      />
      <Circle cx="18" cy="6" r="3" fill="#6C63FF" />
      <Path d="M17 6h2M18 5v2" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
    </Svg>
  );
}