import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';

/** Big soft circles behind a screen, like the sun and moon in the reference pictures. */
export function Backdrop() {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: -120, right: -140, width: 380, height: 380, borderRadius: 190, backgroundColor: t.accent, opacity: t.dark ? 0.1 : 0.16 }} />
      <View style={{ position: 'absolute', bottom: -160, left: -150, width: 360, height: 360, borderRadius: 180, backgroundColor: t.accent2, opacity: t.dark ? 0.12 : 0.1 }} />
    </View>
  );
}
