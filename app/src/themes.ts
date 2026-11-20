import { darken, lighten, mix, readableOn } from './colors';

export interface Seed {
  id: string; name: string; dark: boolean; mood: string;
  bg: string; surface: string; text: string; accent: string; accent2: string; mine?: string; theirs?: string;
}

/** Builds a complete theme from a few base colours; shades and text colours are worked out so they stay readable. */
function make(s: Seed): Theme {
  const mine = s.mine ?? s.accent;
  const theirs = s.theirs ?? (s.dark ? lighten(s.surface, 0.05) : darken(s.surface, 0.05));
  return {
    id: s.id, name: s.name, dark: s.dark, mood: s.mood,
    bg: s.bg, surface: s.surface,
    surfaceHi: s.dark ? lighten(s.surface, 0.12) : lighten(s.surface, 0.6),
    surfaceLo: s.dark ? darken(s.bg, 0.45) : darken(s.surface, 0.18),
    text: s.text, textDim: mix(s.text, s.bg, s.dark ? 0.42 : 0.4),
    accent: s.accent, onAccent: readableOn(s.accent), accent2: s.accent2,
    bubbleMine: mine, onMine: readableOn(mine), bubbleTheirs: theirs, onTheirs: readableOn(theirs, s.text, s.text),
    good: s.dark ? '#8FD6A8' : '#2F8F6B', danger: s.dark ? '#FF8A80' : '#C74B3B',
    swatch: [s.bg, s.accent2, s.accent],
  };
}

export interface Theme {
  id: string;
  name: string;
  mood: string; // one-line description for the gallery
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

// The first three come from your reference pictures and are tuned by hand.
const HAND: Theme[] = [
  {
    id: 'nocturne', name: 'Nocturne', mood: 'Charcoal, lavender and a yellow sun', dark: true,
    bg: '#26262B', surface: '#34343B', surfaceHi: '#44444D', surfaceLo: '#17171A',
    text: '#F3EFF8', textDim: '#A9A3B8', accent: '#F7C948', onAccent: '#2A2410', accent2: '#9C88C9',
    bubbleMine: '#6F5E97', onMine: '#FFFFFF', bubbleTheirs: '#3B3B44', onTheirs: '#F3EFF8',
    good: '#8FD6A8', danger: '#FF8A80', swatch: ['#26262B', '#7C6A9C', '#F7C948'],
  },
  {
    id: 'monstera', name: 'Monstera', mood: 'Cream, forest green and coral', dark: false,
    bg: '#F6EEE0', surface: '#FFF8EC', surfaceHi: '#FFFFFF', surfaceLo: '#D9C9AE',
    text: '#254638', textDim: '#5F766B', accent: '#F4906B', onAccent: '#3A1608', accent2: '#2E5B49',
    bubbleMine: '#F4906B', onMine: '#2E1004', bubbleTheirs: '#EADFCB', onTheirs: '#254638',
    good: '#3E8E6A', danger: '#C8503B', swatch: ['#F6EEE0', '#2E5B49', '#F4906B'],
  },
  {
    id: 'swell', name: 'Swell', mood: 'Warm sand, deep navy and orange', dark: false,
    bg: '#FBDDA8', surface: '#FFEBC7', surfaceHi: '#FFF6E3', surfaceLo: '#D9AE6C',
    text: '#1E2C5C', textDim: '#4F5B8A', accent: '#F59A3B', onAccent: '#2B1700', accent2: '#2F4A85',
    bubbleMine: '#2F4A85', onMine: '#FFFFFF', bubbleTheirs: '#FFF1D6', onTheirs: '#1E2C5C',
    good: '#2F8F6B', danger: '#C74B3B', swatch: ['#FBDDA8', '#2F4A85', '#F59A3B'],
  },
];

const SEEDS: Seed[] = [
  // dark
  { id: 'midnight', name: 'Midnight', dark: true, mood: 'Deep navy with electric cyan', bg: '#0F1626', surface: '#1A2338', text: '#E8EEFB', accent: '#4DD6E8', accent2: '#7C9BFF', mine: '#2E4A8F' },
  { id: 'ember', name: 'Ember', dark: true, mood: 'Warm charcoal with glowing orange', bg: '#1F1B19', surface: '#2D2623', text: '#F6EBE3', accent: '#FF8A4C', accent2: '#E8604C', mine: '#B5472E' },
  { id: 'pine', name: 'Pine Night', dark: true, mood: 'Forest dark with fresh lime', bg: '#101A15', surface: '#1B2B22', text: '#E6F2EA', accent: '#B6E35A', accent2: '#4FBF8B', mine: '#2F6B4C' },
  { id: 'plum', name: 'Plum', dark: true, mood: 'Aubergine with soft pink', bg: '#1E1424', surface: '#2D1E36', text: '#F5E9F7', accent: '#FF8FC7', accent2: '#B28CFF', mine: '#7B3F8F' },
  { id: 'abyss', name: 'Abyss', dark: true, mood: 'Ocean black with aqua', bg: '#0A1517', surface: '#12262A', text: '#E3F6F4', accent: '#2FE0C3', accent2: '#4FA3D9', mine: '#16706B' },
  { id: 'mono-dark', name: 'Graphite', dark: true, mood: 'Quiet black and white', bg: '#121212', surface: '#1F1F1F', text: '#F2F2F2', accent: '#FFFFFF', accent2: '#A0A0A0', mine: '#3A3A3A' },
  { id: 'neon', name: 'Neon', dark: true, mood: 'Near black, lime and magenta', bg: '#0B0B10', surface: '#17171F', text: '#F4F4FA', accent: '#C6FF3D', accent2: '#FF3DCB', mine: '#7A1F66' },
  // light
  { id: 'rosewater', name: 'Rosewater', dark: false, mood: 'Blush pink with berry', bg: '#FBEAEC', surface: '#FFF5F6', text: '#4A1F2E', accent: '#C23A62', accent2: '#8F2A52', mine: '#C23A62' },
  { id: 'matcha', name: 'Matcha', dark: false, mood: 'Soft sage and fresh green', bg: '#E8EFE0', surface: '#F5F9EF', text: '#243320', accent: '#5E9B3F', accent2: '#2F6B3A', mine: '#5E9B3F' },
  { id: 'lilac', name: 'Lilac', dark: false, mood: 'Misty lavender and violet', bg: '#ECE8F8', surface: '#F7F5FD', text: '#2A2350', accent: '#7C5CD6', accent2: '#4B3A9C', mine: '#7C5CD6' },
  { id: 'sand', name: 'Sand', dark: false, mood: 'Warm beige and terracotta', bg: '#F1E6D6', surface: '#FAF3E8', text: '#41281B', accent: '#B65A2D', accent2: '#7A4A2E', mine: '#B65A2D' },
  { id: 'candy', name: 'Candy', dark: false, mood: 'Pink and mint, playful', bg: '#FFE6F1', surface: '#FFF4F9', text: '#42213A', accent: '#FF6FA8', accent2: '#2FBF9F', mine: '#FF6FA8' },
  { id: 'paper', name: 'Paper', dark: false, mood: 'Clean white and ink', bg: '#F4F4F2', surface: '#FFFFFF', text: '#17171A', accent: '#17171A', accent2: '#5A5A66', mine: '#17171A' },
  { id: 'sky', name: 'Sky', dark: false, mood: 'Light blue with navy', bg: '#E1EEFA', surface: '#F3F9FE', text: '#14284B', accent: '#2A6FCF', accent2: '#14407F', mine: '#2A6FCF' },
  { id: 'citrus', name: 'Citrus', dark: false, mood: 'Cream, orange and teal', bg: '#FFF3DA', surface: '#FFFAEC', text: '#33321A', accent: '#F28A1B', accent2: '#16897F', mine: '#12766E' },
];

export const THEMES: Theme[] = [...HAND, ...SEEDS.map(make)];

/** Accent colours you can lay over any theme. */
export const ACCENTS = ['#F7C948', '#F4906B', '#FF6FA8', '#D6456F', '#7C5CD6', '#2F7BE0', '#4DD6E8', '#2FBF9F', '#5E9B3F', '#C6FF3D'];


export type ThemeChoice = 'auto' | string;

export function resolveTheme(choice: ThemeChoice, systemDark: boolean, accent?: string): Theme {
  const base = choice === 'auto' ? THEMES.find((t) => t.id === (systemDark ? 'nocturne' : 'monstera'))! : THEMES.find((t) => t.id === choice) ?? THEMES[0];
  if (!accent) return base;
  return { ...base, accent, onAccent: readableOn(accent), bubbleMine: accent, onMine: readableOn(accent) };
}

