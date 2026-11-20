import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Clay, ClayPress, H1, Label, Body } from '../ui/Clay';
import { fonts, useTheme } from '../theme';

/** The fake chat opened by the decoy code. Looks real, stays on the phone, sends nothing. */
export function DecoyChat({ nickname }: { nickname: string }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<{ id: number; text: string }[]>([]);
  const [text, setText] = useState('');
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: ins.top + 8, paddingHorizontal: 20, paddingBottom: 12 }}>
        <H1 style={{ fontSize: 34, lineHeight: 38 }}>{nickname}</H1>
        <Label>last seen recently</Label>
      </View>
      <FlatList
        data={[...msgs].reverse()} inverted keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 10 }}
        ListEmptyComponent={<Body dim style={{ textAlign: 'center', marginTop: 40 }}>Say hello</Body>}
        renderItem={({ item }) => (
          <Animated.View entering={FadeInDown.duration(200)} style={{ alignItems: 'flex-end' }}>
            <Clay radius={22} color={t.bubbleMine} depth={0.55} style={{ paddingHorizontal: 14, paddingVertical: 9, maxWidth: '82%' }}>
              <Text style={{ color: t.onMine, fontFamily: fonts.body, fontSize: 16 }}>{item.text}</Text>
            </Clay>
          </Animated.View>
        )}
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingBottom: ins.bottom + 10 }}>
        <Clay radius={26} style={{ flex: 1, paddingHorizontal: 18 }}>
          <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={t.textDim} multiline
            style={{ color: t.text, fontFamily: fonts.body, fontSize: 16, paddingVertical: 13, maxHeight: 130 }} />
        </Clay>
        <ClayPress radius={26} color={t.accent} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => { if (text.trim()) { setMsgs((m) => [...m, { id: Date.now(), text: text.trim() }]); setText(''); } }}>
          <Text style={{ color: t.onAccent, fontSize: 22, fontFamily: fonts.bold }}>↑</Text>
        </ClayPress>
      </View>
    </KeyboardAvoidingView>
  );
}
