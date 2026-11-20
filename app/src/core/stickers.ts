// The sticker library. Both phones have the same list, so a sticker travels as a tiny id, never as a picture.
export interface Sticker { id: string; emoji: string; label: string }
export interface Pack { name: string; stickers: Sticker[] }

const mk = (pack: string, items: [string, string][]): Sticker[] => items.map(([emoji, label], i) => ({ id: `${pack}${i}`, emoji, label }));

export const PACKS: Pack[] = [
  { name: 'Love', stickers: mk('l', [['❤️', 'Love you'], ['😘', 'Kiss'], ['🤗', 'Hug'], ['💞', 'Missing you'], ['🥰', 'So cute'], ['💌', 'Love letter'], ['🌹', 'For you'], ['💑', 'Us'], ['😍', 'Wow'], ['🫶', 'Always']]) },
  { name: 'Daily', stickers: mk('d', [['☀️', 'Good morning'], ['🌙', 'Good night'], ['☕', 'Coffee?'], ['🍽️', 'Dinner?'], ['🏠', 'Home soon'], ['🚗', 'On my way'], ['📞', 'Call me'], ['⏰', 'Running late'], ['🙏', 'Please'], ['👍', 'Okay']]) },
  { name: 'Moods', stickers: mk('m', [['😂', 'LOL'], ['😭', 'Crying'], ['😴', 'Sleepy'], ['😡', 'Angry'], ['🥺', 'Sorry'], ['😎', 'Cool'], ['🤔', 'Hmm'], ['😅', 'Oops'], ['🤒', 'Unwell'], ['🥳', 'Yay']]) },
  { name: 'Fun', stickers: mk('f', [['🎉', 'Party'], ['🍕', 'Pizza'], ['🍫', 'Treat'], ['🎬', 'Movie?'], ['🎶', 'Dance'], ['🌧️', 'Rainy day'], ['🌈', 'Smile'], ['🐻', 'Bear hug'], ['🦋', 'Butterflies'], ['✨', 'Magic']]) },
];

const ALL = new Map(PACKS.flatMap((p) => p.stickers).map((s) => [s.id, s]));
export const stickerById = (id: string): Sticker | undefined => ALL.get(id);
export const stickerIndex = (id: string): number => [...ALL.keys()].indexOf(id);
