import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0`;

const ICONS = {
  search: [circle(11, 11, 7), 'M21 21l-4.3-4.3'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z'],
  settings: ['M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0', circle(16, 6, 2), circle(10, 12, 2), circle(18, 18, 2)],
  plus: ['M12 5v14M5 12h14'],
  image: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', circle(9, 9, 1.6), 'M21 16l-5-5L5 20'],
  camera: ['M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', circle(12, 13, 3.5)],
  pin: ['M12 17v5', 'M9 3h6l-1 6 3 4H7l3-4z'],
  note: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5M9 13h6M9 17h6'],
  x: ['M6 6l12 12M18 6L6 18'],
  send: ['M12 19V5M5 12l7-7 7 7'],
  check: ['M5 12l5 5L20 7'],
  download: ['M12 3v12M7 10l5 5 5-5M5 21h14'],
  reply: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 6 6v3'],
  timer: [circle(12, 13, 8), 'M12 9v4l3 2M9 2h6'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', circle(12, 12, 3)],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  back: ['M15 5l-7 7 7 7'],
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  more: [circle(5, 12, 1.2), circle(12, 12, 1.2), circle(19, 12, 1.2)],
  upload: ['M12 15V3M7 8l5-5 5 5M5 21h14'],
  mic: ['M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z', 'M5 11a7 7 0 0 0 14 0M12 18v3'],
  play: ['M7 4l13 8-13 8z'],
  stop: ['M6 6h12v12H6z'],
  lock: ['M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M8 11V8a4 4 0 0 1 8 0v3'],
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color, stroke = 2 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? t.text} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}
