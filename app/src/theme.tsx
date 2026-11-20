import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  bg: string; // page
  surface: string; // cards, inputs (the clay colour)
  surfaceHi: string; // lighter edge
  surfaceLo: string; // darker edge / shadow tint
  text: string;
  textDim: string;
  accent: string; // main buttons
  onAccent: string;
  accent2: string; // second colour (headline, links)
  bubbleMine: string;
  onMine: string;
  bubbleTheirs: string;
  onTheirs: string;
  good: string;
  danger: string;
  swatch: [string, string, string]; // preview dots
}

export const THEMES: Theme[] = [
  {
    id: 'nocturne', name: 'Nocturne', dark: true,
    bg: '#26262B', surface: '#34343B', surfaceHi: '#44444D', surfaceLo: '#17171A',
    text: '#F3EFF8', textDim: '#A9A3B8', accent: '#F7C948', onAccent: '#2A2410', accent2: '#9C88C9',
    bubbleMine: '#6F5E97', onMine: '#FFFFFF', bubbleTheirs: '#3B3B44', onTheirs: '#F3EFF8',
    good: '#8FD6A8', danger: '#FF8A80', swatch: ['#26262B', '#7C6A9C', '#F7C948'],
  },
  {
    id: 'monstera', name: 'Monstera', dark: false,
    bg: '#F6EEE0', surface: '#FFF8EC', surfaceHi: '#FFFFFF', surfaceLo: '#D9C9AE',
    text: '#254638', textDim: '#6F8479', accent: '#F4906B', onAccent: '#3A1608', accent2: '#2E5B49',
    bubbleMine: '#F4906B', onMine: '#2E1004', bubbleTheirs: '#EADFCB', onTheirs: '#254638',
    good: '#3E8E6A', danger: '#C8503B', swatch: ['#F6EEE0', '#2E5B49', '#F4906B'],
  },
  {
    id: 'swell', name: 'Swell', dark: false,
    bg: '#FBDDA8', surface: '#FFEBC7', surfaceHi: '#FFF6E3', surfaceLo: '#D9AE6C',
    text: '#1E2C5C', textDim: '#5C6896', accent: '#F59A3B', onAccent: '#2B1700', accent2: '#2F4A85',
    bubbleMine: '#2F4A85', onMine: '#FFFFFF', bubbleTheirs: '#FFF1D6', onTheirs: '#1E2C5C',
    good: '#2F8F6B', danger: '#C74B3B', swatch: ['#FBDDA8', '#2F4A85', '#F59A3B'],
  },
];

export type ThemeChoice = 'auto' | string;

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'auto') return THEMES.find((t) => t.id === (systemDark ? 'nocturne' : 'monstera'))!;
  return THEMES.find((t) => t.id === choice) ?? THEMES[0];
}

const Ctx = createContext<Theme>(THEMES[0]);
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ choice, children }: { choice: ThemeChoice; children: React.ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(() => resolveTheme(choice, scheme === 'dark'), [choice, scheme]);
  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}

export const fonts = {
  display: 'Anton_400Regular',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  bold: 'Inter_700Bold',
};
