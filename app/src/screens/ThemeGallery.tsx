import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { ClayPress, H1, Label } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { Backdrop } from '../ui/Backdrop';
import { ACCENTS, THEMES, fonts, resolveTheme, useTheme, type Theme } from '../theme';

type Filter = 'all' | 'dark' | 'light';

/** A tiny picture of the chat in a theme's own colours. */
function Mini({ th, scale = 1 }: { th: Theme; scale?: number }) {
  const w = 132 * scale;
  return (
    <View style={{ width: '100%', height: 128, borderRadius: 18, backgroundColor: th.bg, overflow: 'hidden', padding: 10, borderWidth: 1, borderColor: th.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
      <View style={{ position: 'absolute', top: -30, right: -30, width: 90, height: 90, borderRadius: 45, backgroundColor: th.accent, opacity: th.dark ? 0.16 : 0.22 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: th.accent }} />
        <View style={{ width: 44, height: 7, borderRadius: 4, backgroundColor: th.text, opacity: 0.85 }} />
      </View>
      <View style={{ marginTop: 10, alignSelf: 'flex-start', maxWidth: w, backgroundColor: th.bubbleTheirs, borderRadius: 10, borderBottomLeftRadius: 3, paddingHorizontal: 8, paddingVertical: 5 }}>
        <View style={{ width: 52, height: 5, borderRadius: 3, backgroundColor: th.onTheirs, opacity: 0.7 }} />
      </View>
      <View style={{ marginTop: 5, alignSelf: 'flex-end', backgroundColor: th.bubbleMine, borderRadius: 10, borderBottomRightRadius: 3, paddingHorizontal: 8, paddingVertical: 5 }}>
        <View style={{ width: 66, height: 5, borderRadius: 3, backgroundColor: th.onMine, opacity: 0.8 }} />
      </View>
      <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <View style={{ flex: 1, height: 16, borderRadius: 8, backgroundColor: th.surface }} />
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: th.accent }} />
      </View>
    </View>
  );
}

export function ThemeGallery({ theme, accent, onTheme, onAccent, onBack }: {
  theme: string; accent: string; onTheme: (id: string) => void; onAccent: (hex: string) => void; onBack: () => void;
}) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');
  const list = useMemo(() => THEMES.filter((x) => filter === 'all' || (filter === 'dark') === x.dark), [filter]);
  const autoPreview = resolveTheme('auto', t.dark);

  const card = (th: Theme, id: string, name: string, mood: string, i: number) => {
    const on = theme === id;
    return (
      <Animated.View key={id} entering={FadeInDown.delay(Math.min(i, 10) * 35).duration(240)} layout={LinearTransition.duration(200)} style={{ width: '48%' }}>
        <ClayPress onPress={() => onTheme(id)} radius={24} style={{ padding: 10, width: '100%', borderWidth: on ? 2 : 0, borderColor: t.accent }} label={name + ' theme'}>
          <Mini th={accent && on ? resolveTheme(id, t.dark, accent) : th} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: t.text, fontFamily: fonts.bold, fontSize: 15 }}>{name}</Text>
              <Text numberOfLines={2} style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 11, lineHeight: 15 }}>{mood}</Text>
            </View>
            {on && <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color={t.onAccent} stroke={3} /></View>}
          </View>
        </ClayPress>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: ins.top + 14, paddingBottom: ins.bottom + 40, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <H1 style={{ fontSize: 46 }}>Themes</H1>
            <Label>{THEMES.length} to choose from</Label>
          </View>
          <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>Done</Text></Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['all', 'dark', 'light'] as Filter[]).map((f) => (
            <ClayPress key={f} onPress={() => setFilter(f)} radius={16} color={filter === f ? t.accent : undefined} style={{ paddingVertical: 9, paddingHorizontal: 16 }} label={f}>
              <Text style={{ color: filter === f ? t.onAccent : t.text, fontFamily: fonts.bold, textTransform: 'capitalize' }}>{f}</Text>
            </ClayPress>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' }}>
          {filter === 'all' && card(autoPreview, 'auto', 'Auto', 'Follows your phone: dark at night, light by day', 0)}
          {list.map((th, i) => card(th, th.id, th.name, th.mood, i + 1))}
        </View>

        <View style={{ gap: 10 }}>
          <Label>Accent colour (on top of any theme)</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <ClayPress onPress={() => onAccent('')} radius={22} color={!accent ? t.accent : undefined} style={{ paddingHorizontal: 14, height: 44, alignItems: 'center', justifyContent: 'center' }} label="Theme default">
              <Text style={{ color: !accent ? t.onAccent : t.text, fontFamily: fonts.bold, fontSize: 13 }}>Theme default</Text>
            </ClayPress>
            {ACCENTS.map((c) => (
              <ClayPress key={c} onPress={() => onAccent(c)} radius={22} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: accent === c ? 2 : 0, borderColor: t.text }} label={'Accent ' + c}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c }} />
              </ClayPress>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
