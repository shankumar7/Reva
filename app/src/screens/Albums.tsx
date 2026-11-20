import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Clay, ClayPress, H1, Label } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { Backdrop } from '../ui/Backdrop';
import { fonts, useTheme } from '../theme';
import { session } from '../core/session';
import { dataUri } from '../core/images';
import type { Msg } from '../core/db';
import { ImageViewer } from './ImageViewer';

const useChat = () => useSyncExternalStore(session.subscribe, session.getState);

/** Pick which albums a photo is in, or start a new album. Albums are shared with your partner. */
export function AlbumSheet({ msgId, onClose }: { msgId: string | null; onClose: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const chat = useChat();
  const [name, setName] = useState('');
  if (!msgId) return null;
  const create = () => {
    const n = name.trim();
    if (!n) return;
    void session.addToAlbum(msgId, n);
    setName('');
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <Animated.View entering={FadeInDown.duration(200)}>
          <Pressable>
            <Clay radius={30} style={{ margin: 12, marginBottom: ins.bottom + 12, padding: 18, gap: 12, maxHeight: 520 }}>
              <Label>Add to an album</Label>
              <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
                {chat.albums.length === 0 ? (
                  <Text style={{ color: t.textDim, fontFamily: fonts.body, paddingVertical: 8 }}>No albums yet. Make the first one below, like "Trips" or "Us".</Text>
                ) : chat.albums.map((a) => {
                  const inIt = a.ids.includes(msgId);
                  return (
                    <Pressable key={a.name} onPress={() => void (inIt ? session.removeFromAlbum(msgId, a.name) : session.addToAlbum(msgId, a.name))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: t.accent, backgroundColor: inIt ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {inIt && <Icon name="check" size={14} color={t.onAccent} stroke={3} />}
                      </View>
                      <Text style={{ flex: 1, color: t.text, fontFamily: fonts.bold, fontSize: 16 }}>{a.name}</Text>
                      <Text style={{ color: t.textDim, fontFamily: fonts.medium }}>{a.ids.length}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Clay radius={18} style={{ flex: 1, paddingHorizontal: 14 }}>
                  <TextInput value={name} onChangeText={setName} placeholder="New album name" placeholderTextColor={t.textDim} onSubmitEditing={create}
                    style={{ paddingVertical: 12, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
                </Clay>
                <ClayPress onPress={create} radius={22} color={t.accent} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} label="Create album">
                  <Icon name="plus" size={22} color={t.onAccent} />
                </ClayPress>
              </View>
            </Clay>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Every photo from the chat in one grid, plus the albums you and your partner made. */
export function PhotosScreen({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chat = useChat();
  const [tab, setTab] = useState<string>('All');
  const [viewer, setViewer] = useState<Msg | null>(null);
  const [albumFor, setAlbumFor] = useState<string | null>(null);

  const photos = useMemo(() => chat.messages.filter((m) => m.kind === 'img' && !m.once && !m.deleted && m.thumb), [chat.messages]);
  const shown = useMemo(() => {
    if (tab === 'All') return [...photos].reverse();
    const ids = new Set(chat.albums.find((a) => a.name === tab)?.ids ?? []);
    return photos.filter((p) => ids.has(p.id)).reverse();
  }, [photos, tab, chat.albums]);

  const gap = 8, pad = 18, cols = 3;
  const size = Math.floor((width - pad * 2 - gap * (cols - 1)) / cols);
  const tabs = ['All', ...chat.albums.map((a) => a.name)];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      <View style={{ paddingTop: ins.top + 14, paddingHorizontal: pad, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <H1 style={{ fontSize: 46 }}>Photos</H1>
          <Label>{photos.length} in the chat · {chat.albums.length} albums</Label>
        </View>
        <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>Done</Text></Pressable>
      </View>

      <View style={{ height: 56 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: 10, alignItems: 'center' }}>
          {tabs.map((n) => (
            <ClayPress key={n} onPress={() => setTab(n)} radius={16} color={tab === n ? t.accent : undefined} style={{ paddingVertical: 9, paddingHorizontal: 16 }} label={n}>
              <Text style={{ color: tab === n ? t.onAccent : t.text, fontFamily: fonts.bold }}>{n}</Text>
            </ClayPress>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={shown}
        key={cols}
        numColumns={cols}
        keyExtractor={(m) => m.id}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: ins.bottom + 30, gap }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 30 }}>
            <Icon name="image" size={34} color={t.textDim} />
            <Text style={{ color: t.textDim, fontFamily: fonts.body, textAlign: 'center' }}>
              {tab === 'All' ? 'Photos you send and receive show up here.' : 'Nothing in this album yet. Press and hold a photo, then choose its albums.'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 25).duration(220)}>
            <Pressable onPress={() => setViewer(item)} onLongPress={() => setAlbumFor(item.id)} delayLongPress={300}>
              <Image source={{ uri: dataUri(item.thumb) }} style={{ width: size, height: size, borderRadius: 16 }} resizeMode="cover" />
              {chat.albums.some((a) => a.ids.includes(item.id)) && (
                <View style={{ position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 4 }}>
                  <Icon name="image" size={12} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          </Animated.View>
        )}
      />

      <ImageViewer id={viewer?.id ?? null} once={false} mine={!!viewer?.mine} onClose={() => setViewer(null)} />
      <AlbumSheet msgId={albumFor} onClose={() => setAlbumFor(null)} />
    </View>
  );
}
