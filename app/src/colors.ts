// Small colour helpers, so every theme is built from a few base colours and stays readable.
export type RGB = [number, number, number];
export const hexToRgb = (h: string): RGB => {
  const s = h.replace('#', '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
export const rgbToHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** Mix colour a toward colour b by t (0 = a, 1 = b). */
export const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};
export const lighten = (c: string, t: number) => mix(c, '#FFFFFF', t);
export const darken = (c: string, t: number) => mix(c, '#000000', t);
export const luminance = (c: string) => {
  const [r, g, b] = hexToRgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** Dark or white text, whichever reads better on `bg`. */
export const readableOn = (bg: string, dark = '#1A1A1F', light = '#FFFFFF') => {
  // prefer the soft dark or white; fall back to pure black or white when a mid-tone needs it
  const best = contrast(bg, dark) >= contrast(bg, light) ? dark : light;
  if (contrast(bg, best) >= 4.5) return best;
  return contrast(bg, '#000000') >= contrast(bg, '#FFFFFF') ? '#000000' : '#FFFFFF';
};
