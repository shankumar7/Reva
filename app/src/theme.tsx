import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { THEMES, resolveTheme, type Theme, type ThemeChoice } from './themes';

export { THEMES, ACCENTS, resolveTheme } from './themes';
export type { Theme, ThemeChoice } from './themes';

const Ctx = createContext<Theme>(THEMES[0]);
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ choice, accent, children }: { choice: ThemeChoice; accent?: string; children: React.ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(() => resolveTheme(choice, scheme === 'dark', accent), [choice, scheme, accent]);
  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}

export const fonts = {
  display: 'Anton_400Regular',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  bold: 'Inter_700Bold',
};
