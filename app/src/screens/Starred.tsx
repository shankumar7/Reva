import React, { useMemo, useSyncExternalStore } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Clay, ClayPress, H1, Label } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { Backdrop } from '../ui/Backdrop';
import { fonts, useTheme } from '../theme';
import { session } from '../core/session';
import { dataUri } from '../core/images';

/** Messages you starred. Stars are private to this phone. */
export function StarredScreen({ onBack, nickname }: { onBack: () => void; nickname: string }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const chat = useSyncExternalStore(session.subscribe, session.getState);
  const list = useMemo(() => [...chat.messages].filter((m) => m.starred && !m.deleted).reverse(), [chat.messages]);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 12 }}>
      <Backdrop />
      <View style={{ paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <H1 style={{ fontSize: 46 }}>Starred</H1>
          <Label>{list.length} saved</Label>
        </View>
        <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>Done</Text></Pressable>
      </View>
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 22, paddingBottom: 60, gap: 12 }}
        ListEmptyComponent={<Text style={{ color: t.textDim, fontFamily: fonts.body, textAlign: 'center', marginTop: 60 }}>Nothing starred yet. Press and hold a message, then choose Star.</Text>}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(240)}>
            <ClayPress onPress={() => void session.starMessage(item.id, false)} radius={22} style={{ padding: 16, gap: 6 }} label="Tap to remove the star">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label>{item.mine ? 'You' : nickname} · {new Date(item.ts).toLocaleString()}</Label>
                <Icon name="star" size={16} color={t.accent} />
              </View>
              {item.kind === 'img' && item.thumb ? (
                <Image source={{ uri: dataUri(item.thumb) }} style={{ width: 140, height: 140, borderRadius: 14 }} />
              ) : null}
              {item.kind === 'aud' ? <Text style={{ color: t.text, fontFamily: fonts.medium }}>Voice note · {item.w}s</Text> : null}
              {item.kind === 'stk' ? <Text style={{ color: t.text, fontFamily: fonts.medium }}>Sticker</Text> : null}
              {item.text && item.kind !== 'stk' ? <Text style={{ color: t.text, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{item.text}</Text> : null}
            </ClayPress>
          </Animated.View>
        )}
      />
    </View>
  );
}
