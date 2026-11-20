import React, { useState, useSyncExternalStore } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Button, ClayPress, H1, Label } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { Backdrop } from '../ui/Backdrop';
import { fonts, useTheme } from '../theme';
import { useBackHandler } from '../core/backStack';
import { session } from '../core/session';
import type { SharedNote } from '../core/db';

/** Notes you and your partner both see. Changes sync; the newest edit wins. */
export function SharedNotesScreen({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const chat = useSyncExternalStore(session.subscribe, session.getState);
  const [editing, setEditing] = useState<SharedNote | 'new' | null>(null);
  useBackHandler(!!editing, () => setEditing(null), 1);

  if (editing) return <Editor note={editing} onClose={() => setEditing(null)} />;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 12 }}>
      <Backdrop />
      <View style={{ paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <H1 style={{ fontSize: 46 }}>Our notes</H1>
          <Label>Shared, end-to-end encrypted</Label>
        </View>
        <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>Done</Text></Pressable>
      </View>
      <FlatList
        data={chat.notes}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 22, paddingBottom: 130, gap: 14 }}
        ListEmptyComponent={<Text style={{ color: t.textDim, fontFamily: fonts.body, textAlign: 'center', marginTop: 60 }}>Nothing yet. Tap + for a shopping list, plans, anything you share.</Text>}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(260)} layout={LinearTransition.duration(200)}>
            <ClayPress onPress={() => setEditing(item)} radius={24} style={{ padding: 18 }} label={item.title}>
              <Text numberOfLines={1} style={{ color: t.text, fontFamily: fonts.bold, fontSize: 18 }}>{item.title}</Text>
              <Text numberOfLines={3} style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 14, marginTop: 4 }}>{item.body || 'No text'}</Text>
              <Label style={{ marginTop: 10 }}>{new Date(item.ts).toLocaleString()}</Label>
            </ClayPress>
          </Animated.View>
        )}
      />
      <View style={{ position: 'absolute', right: 24, bottom: ins.bottom + 24 }}>
        <ClayPress onPress={() => setEditing('new')} radius={32} color={t.accent} style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }} label="New note">
          <Icon name="plus" color={t.onAccent} size={28} />
        </ClayPress>
      </View>
    </View>
  );
}

function Editor({ note, onClose }: { note: SharedNote | 'new'; onClose: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [title, setTitle] = useState(note === 'new' ? '' : note.title);
  const [body, setBody] = useState(note === 'new' ? '' : note.body);
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 12, paddingHorizontal: 22, paddingBottom: ins.bottom + 12 }}>
      <Backdrop />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <Pressable onPress={onClose} hitSlop={12}><Text style={{ color: t.textDim, fontFamily: fonts.medium, fontSize: 16 }}>Cancel</Text></Pressable>
        {note !== 'new' && (
          <Pressable hitSlop={12} onPress={() => { void session.deleteNote(note.id); onClose(); }}>
            <Text style={{ color: t.danger, fontFamily: fonts.medium, fontSize: 16 }}>Delete for both</Text>
          </Pressable>
        )}
      </View>
      <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={t.textDim}
        style={{ color: t.text, fontFamily: fonts.display, fontSize: 34, paddingVertical: 8, textTransform: 'uppercase' }} />
      <TextInput value={body} onChangeText={setBody} placeholder="Write together" placeholderTextColor={t.textDim} multiline textAlignVertical="top"
        style={{ flex: 1, color: t.text, fontFamily: fonts.body, fontSize: 17, lineHeight: 25 }} />
      <Button title="Save and share" onPress={() => { void session.saveNote(note === 'new' ? null : note.id, title, body); onClose(); }} />
    </KeyboardAvoidingView>
  );
}
