export interface GlyphPart { d: string; fill?: string; stroke?: string; strokeWidth?: number; cap?: 'round' }
export interface Disguise { id: string; label: string; kind: 'calculator' | 'notes' | 'chat'; bg: string; glyph: GlyphPart[] }
declare const list: Disguise[];
export = list;
