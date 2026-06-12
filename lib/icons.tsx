// lib/icons.tsx
// Unified, emoji-free icon set for LottoAI. All icons are stroke-based line
// icons sized to a 24px grid. Pass { color, size, active } — `active` fills
// tab icons with a soft tint.

import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

export type IconProps = { color: string; size?: number; strokeWidth?: number; active?: boolean };

const base = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const });

/* ---------------- Tab icons ---------------- */
export function HomeIcon({ color, size = 24, active }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M4 11l8-6.5L20 11v7.5a1.5 1.5 0 01-1.5 1.5H14v-5h-4v5H5.5A1.5 1.5 0 014 18.5V11z"
        stroke={color} strokeWidth={active ? 2 : 1.7} strokeLinejoin="round" fill={active ? color + '22' : 'none'} />
    </Svg>
  );
}

export function ResultsIcon({ color, size = 24, active }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M6 19v-5M12 19V8M18 19v-8" stroke={color} strokeWidth={active ? 2.2 : 1.9} strokeLinecap="round" />
      <Circle cx={6} cy={11} r={1.6} fill={color} />
      <Circle cx={12} cy={5.5} r={1.6} fill={color} />
      <Circle cx={18} cy={8} r={1.6} fill={color} />
    </Svg>
  );
}

export function GenerateIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function SavedIcon({ color, size = 24, active }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M4 9A1.5 1.5 0 015.5 7.5h13A1.5 1.5 0 0120 9v1.5a2 2 0 000 4V16a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 16v-1.5a2 2 0 000-4V9z"
        stroke={color} strokeWidth={active ? 2 : 1.7} fill={active ? color + '22' : 'none'} />
      <Path d="M14 7.5v10" stroke={color} strokeWidth={1.4} strokeDasharray="1.5 2.5" />
    </Svg>
  );
}

export function ProfileIcon({ color, size = 24, active }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx={12} cy={8.5} r={3.7} stroke={color} strokeWidth={active ? 2 : 1.7} fill={active ? color + '22' : 'none'} />
      <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke={color} strokeWidth={active ? 2 : 1.7} strokeLinecap="round" />
    </Svg>
  );
}

/* ---------------- Feature icons ---------------- */
export function AIAssistantIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 4.5l1.4 3.6 3.6 1.4-3.6 1.4L12 14.5l-1.4-3.6L7 9.5l3.6-1.4L12 4.5z" fill={color} />
      <Circle cx={6} cy={17} r={1.6} fill={color} />
      <Circle cx={18} cy={16.5} r={1.1} fill={color} />
    </Svg>
  );
}

export function SparkIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 3.5l1.7 4.9 4.9 1.7-4.9 1.7L12 16.7l-1.7-4.9-4.9-1.7 4.9-1.7L12 3.5z" fill={color} />
      <Circle cx={18.5} cy={5.5} r={1.4} fill={color} />
    </Svg>
  );
}

export function BellIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10.3 21a1.94 1.94 0 003.4 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function TicketIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M4 8.5A1.5 1.5 0 015.5 7h13A1.5 1.5 0 0120 8.5v2a2 2 0 000 4v2a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 16.5v-2a2 2 0 000-4v-2z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M14 7v10" stroke={color} strokeWidth={1.4} strokeDasharray="1.5 2.5" />
    </Svg>
  );
}

export function CalendarIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x={3.5} y={5} width={17} height={16} rx={2.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M3.5 9.5h17M8 3v4M16 3v4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function ClockIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 7.5V12l3 2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SearchIcon({ color, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M16 16l4.5 4.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function StatsIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x={3} y={11} width={4} height={9} rx={1.4} fill={color} />
      <Rect x={10} y={6} width={4} height={14} rx={1.4} fill={color} />
      <Rect x={17} y={3} width={4} height={17} rx={1.4} fill={color} />
    </Svg>
  );
}

/* ---------------- UI icons ---------------- */
export function ArrowRightIcon({ color, size = 24, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M5 12h13M13 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ color, size = 24, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronDownIcon({ color, size = 24, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CloseIcon({ color, size = 24, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ color, size = 24, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ color, size = 24, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M5 12.5l4 4 10-10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrashIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M4 6.5h16M9 6.5V4.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 4.5v2M6.5 6.5l.8 13a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4l.8-13"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function EditIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M16.5 3.5l4 4L8 20H4v-4L16.5 3.5z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M14 6l4 4" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function InfoIcon({ color, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 11v5M12 7.6h.01" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function ShieldIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DocIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M6 3.5h7l5 5V20a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 20V5A1.5 1.5 0 016 3.5z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M13 3.5V9h5M9 13h6M9 16.5h6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MailIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x={3} y={5} width={18} height={14} rx={2.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M4 7l8 5.5L20 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SettingsIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 2.5v3M12 18.5v3M4.5 4.5l2.1 2.1M17.4 17.4l2.1 2.1M2.5 12h3M18.5 12h3M4.5 19.5l2.1-2.1M17.4 6.6l2.1-2.1"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function RefreshIcon({ color, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M20 11a8 8 0 10-1.8 6.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M20 5v6h-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function WifiOffIcon({ color, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={19.5} r={1.2} fill={color} />
      <Line x1={4} y1={4} x2={20} y2={20} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function DiceIcon({ color, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Rect x={3.5} y={3.5} width={17} height={17} rx={4.5} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={8.5} cy={8.5} r={1.5} fill={color} />
      <Circle cx={15.5} cy={8.5} r={1.5} fill={color} />
      <Circle cx={12} cy={12} r={1.5} fill={color} />
      <Circle cx={8.5} cy={15.5} r={1.5} fill={color} />
      <Circle cx={15.5} cy={15.5} r={1.5} fill={color} />
    </Svg>
  );
}

export function SlidersIcon({ color, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={16} cy={7} r={2.3} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={8} cy={12} r={2.3} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={14} cy={17} r={2.3} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function BookmarkIcon({ color, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M6 4.5h12v15l-6-4-6 4v-15z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

export function FlameIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 3c1 3-2 4-2 7a2 2 0 104 0c0 2 2 3 2 5a6 6 0 11-8-5c0-3 3-5 4-7z" fill={color} />
    </Svg>
  );
}

export function SnowflakeIcon({ color, size = 24, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M12 3v18M5 7.5l14 9M19 7.5l-14 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function TargetIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12} cy={12} r={1.4} fill={color} />
    </Svg>
  );
}

export function SendIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M4 12l16-7-7 16-2.5-6.5L4 12z" fill={color} />
    </Svg>
  );
}

export function BackIcon({ color, size = 24, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M15 6l-6 6 6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ShareIcon({ color, size = 24, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Circle cx={18} cy={5.5} r={2.5} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={6} cy={12} r={2.5} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={18} cy={18.5} r={2.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8.5 13.5l7-3M8.5 10.5l7 3" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function TrophyIcon({ color, size = 24, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path d="M7 4h10v3.5A3.5 3.5 0 0113.5 11h-3A3.5 3.5 0 017 7.5V4z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M5 4.5H4a1.5 1.5 0 00-1.5 1.5v1a3 3 0 003 3M19 4.5h1a1.5 1.5 0 011.5 1.5v1a3 3 0 01-3 3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 11v8M9 20h6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}