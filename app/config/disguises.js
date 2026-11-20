// The list of disguises. To add one: add an entry here and rebuild the app.
// Each disguise is a launcher name + icon. `kind` says which working app it opens
// ('calculator' or 'notes'); other kinds fall back to the notes app.
// Glyph coordinates use a 108 x 108 canvas (Android adaptive icon); the middle 66 x 66 is always visible.

const rect = (x, y, w, h, r = 0) =>
  r
    ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`
    : `M${x} ${y}h${w}v${h}h-${w}z`;
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0z`;

const keys = [];
for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) keys.push(rect(30 + col * 18, 49 + row * 12, 12, 8, 2.5));

module.exports = [
  {
    id: 'Calculator', label: 'Calculator', kind: 'calculator', bg: '#2B3445',
    glyph: [
      { d: rect(30, 26, 48, 16, 4), fill: '#9FE3D0' },
      { d: keys.slice(0, 8).join(''), fill: '#FFFFFF' },
      { d: keys[8], fill: '#FF8A65' },
    ],
  },
  {
    id: 'Notes', label: 'Notes', kind: 'notes', bg: '#F4C542',
    glyph: [
      { d: rect(32, 24, 44, 60, 6), fill: '#FFFFFF' },
      { d: rect(38, 33, 32, 4, 2) + rect(38, 44, 32, 3, 1.5) + rect(38, 53, 32, 3, 1.5) + rect(38, 62, 20, 3, 1.5), fill: '#C99A1E' },
    ],
  },
  {
    id: 'Clock', label: 'Clock', kind: 'notes', bg: '#232A3B',
    glyph: [
      { d: circle(54, 54, 26), stroke: '#FFFFFF', strokeWidth: 5 },
      { d: 'M54 40v15l10 7', stroke: '#FF8A65', strokeWidth: 4.5, cap: 'round' },
    ],
  },
  {
    id: 'Weather', label: 'Weather', kind: 'notes', bg: '#4C8DF0',
    glyph: [
      { d: circle(45, 44, 13), fill: '#FFD166' },
      { d: 'M38 78a11 11 0 0 1 -1 -22 16 16 0 0 1 30 -3 12 12 0 0 1 2 25z', fill: '#FFFFFF' },
    ],
  },
  {
    id: 'Files', label: 'Files', kind: 'notes', bg: '#F09A3E',
    glyph: [{ d: 'M28 40a4 4 0 0 1 4 -4h12l6 6h24a4 4 0 0 1 4 4v28a4 4 0 0 1 -4 4H32a4 4 0 0 1 -4 -4z', fill: '#FFFFFF' }],
  },
  {
    id: 'Compass', label: 'Compass', kind: 'notes', bg: '#2F8F7B',
    glyph: [
      { d: circle(54, 54, 28), stroke: '#FFFFFF', strokeWidth: 4.5 },
      { d: 'M54 34l8 20H46z', fill: '#FF6B5E' },
      { d: 'M62 54l-8 20l-8 -20z', fill: '#FFFFFF' },
    ],
  },
  {
    id: 'Calendar', label: 'Calendar', kind: 'notes', bg: '#EDE7DB',
    glyph: [
      { d: rect(27, 27, 54, 54, 7), fill: '#FFFFFF' },
      { d: 'M34 27h40a7 7 0 0 1 7 7v7H27v-7a7 7 0 0 1 7 -7z', fill: '#E5604D' },
      { d: rect(35, 51, 8, 7, 2) + rect(50, 51, 8, 7, 2) + rect(65, 51, 8, 7, 2) + rect(35, 64, 8, 7, 2) + rect(50, 64, 8, 7, 2), fill: '#5B6475' },
    ],
  },
  {
    id: 'Music', label: 'Music', kind: 'notes', bg: '#7C5CD6',
    glyph: [
      { d: circle(45, 71, 9), fill: '#FFFFFF' },
      { d: rect(52, 32, 5, 39), fill: '#FFFFFF' },
      { d: 'M57 32l18 -5v11l-18 5z', fill: '#FF8A65' },
    ],
  },
  {
    // Used when "cover" is switched off: an honest chat app icon. Not shown in the disguise picker.
    id: 'Chat', label: 'Chat', kind: 'chat', bg: '#7C5CD6',
    glyph: [
      { d: rect(28, 30, 52, 36, 12), fill: '#FFFFFF' },
      { d: 'M40 66l-4 14l16 -14z', fill: '#FFFFFF' },
      { d: circle(44, 48, 3.2) + circle(54, 48, 3.2) + circle(64, 48, 3.2), fill: '#7C5CD6' },
    ],
  },
];
