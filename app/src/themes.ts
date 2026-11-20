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
  // more dark
  { id: 'aurora', name: 'Aurora', dark: true, mood: 'Northern lights: teal, mint and violet', bg: '#0E1B24', surface: '#172A36', text: '#E6F4F2', accent: '#7CF5C8', accent2: '#8F7CFF', mine: '#3B4FA8' },
  { id: 'cherry', name: 'Cherry Night', dark: true, mood: 'Deep wine with cherry and amber', bg: '#1C1016', surface: '#2B1822', text: '#FBE9EE', accent: '#FF5C7A', accent2: '#FFB86B', mine: '#A32A4B' },
  { id: 'cobalt', name: 'Cobalt', dark: true, mood: 'Ink blue with bright cobalt and gold', bg: '#0B1020', surface: '#141C36', text: '#E8EDFF', accent: '#5B8CFF', accent2: '#FFC857', mine: '#2A4BB5' },
  { id: 'moss', name: 'Moss', dark: true, mood: 'Mossy dark with soft lime', bg: '#14180F', surface: '#1F2616', text: '#EEF2DF', accent: '#D7E36B', accent2: '#8FBF6A', mine: '#55702D' },
  { id: 'dusk', name: 'Dusk', dark: true, mood: 'Plum evening with orange and rose', bg: '#201522', surface: '#2E1D31', text: '#F9EBF2', accent: '#FF9E5E', accent2: '#FF5E8E', mine: '#B8436B' },
  { id: 'galaxy', name: 'Galaxy', dark: true, mood: 'Space indigo with stardust gold', bg: '#12102B', surface: '#1D1A42', text: '#EDEBFF', accent: '#FFD166', accent2: '#B79CFF', mine: '#4B3FA8' },
  // more light
  { id: 'peach', name: 'Peach', dark: false, mood: 'Soft peach with warm orange', bg: '#FFE9DC', surface: '#FFF5EE', text: '#4A2A1C', accent: '#D9623A', accent2: '#A03A22', mine: '#D9623A' },
  { id: 'mint', name: 'Mint', dark: false, mood: 'Cool mint and deep green', bg: '#DFF5EC', surface: '#F2FCF8', text: '#17382D', accent: '#14946E', accent2: '#0F6E56', mine: '#14946E' },
  { id: 'butter', name: 'Butter', dark: false, mood: 'Buttery yellow with olive', bg: '#FFF6C9', surface: '#FFFBE6', text: '#3A3512', accent: '#C99700', accent2: '#6B5E00', mine: '#6B5E00' },
  { id: 'periwinkle', name: 'Periwinkle', dark: false, mood: 'Blue-violet and crisp white', bg: '#E4E8FF', surface: '#F5F6FF', text: '#1E2250', accent: '#4F5BE0', accent2: '#3340B8', mine: '#4F5BE0' },
  { id: 'reef', name: 'Coral Reef', dark: false, mood: 'Coral pink with sea teal', bg: '#FFE3E0', surface: '#FFF3F1', text: '#4A1E1E', accent: '#E5513F', accent2: '#1B8F8A', mine: '#1B8F8A' },
  { id: 'blossom', name: 'Blossom', dark: false, mood: 'Orchid pink and plum', bg: '#F7E6F5', surface: '#FDF3FC', text: '#3E1F3D', accent: '#B1409F', accent2: '#7A2C75', mine: '#B1409F' },
  { id: 'glacier', name: 'Glacier', dark: false, mood: 'Icy blue with deep teal', bg: '#E6F4F7', surface: '#F4FBFC', text: '#12363D', accent: '#12809A', accent2: '#0B5A6B', mine: '#12809A' },
  { id: 'lemonade', name: 'Lemonade', dark: false, mood: 'Fresh lemon, pink and green', bg: '#FFF9D6', surface: '#FFFDEE', text: '#33321A', accent: '#E0457B', accent2: '#2F9E6B', mine: '#E0457B' },
  { id: 'dawn', name: 'Dawn', dark: false, mood: 'First light: rose, gold and soft blue', bg: '#FDEBE3', surface: '#FFF7F2', text: '#3A2438', accent: '#E8734A', accent2: '#4C6FB8', mine: '#4C6FB8' },
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

