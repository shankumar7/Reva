import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, TextInput, View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Button, Clay, ClayPress, H1, Label } from '../ui/Clay';
import { fonts, useTheme } from '../theme';
import { useBackHandler } from '../core/backStack';

interface Note { id: number; title: string; body: string; ts: number }

let ndb: SQLite.SQLiteDatabase | null = null;
async function notesDb() {
  if (!ndb) {
    ndb = await SQLite.openDatabaseAsync('notes-plain.db');
    await ndb.execAsync('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL)');
  }
  return ndb;
}

export function Notes({ tryUnlock, titleUnlock, onSecret }: { tryUnlock: (code: string) => Promise<boolean>; titleUnlock: boolean; onSecret?: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  useBackHandler(!!editing, () => setEditing(null), 1);

  const load = useCallback(async () => {
    const d = await notesDb();
    const like = '%' + q.replace(/[%_\\]/g, (c) => '\\' + c) + '%';
    setNotes(await d.getAllAsync<Note>("SELECT * FROM notes WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' ORDER BY ts DESC", like, like));
  }, [q]);
  useEffect(() => { void load(); }, [load]);

  async function save(n: Note | 'new', title: string, body: string) {
    // optional second way in: save a note whose title is the passcode
    if (titleUnlock && title.trim().length >= 6 && (await tryUnlock(title.trim()))) { setEditing(null); return; }
    const d = await notesDb();
    if (!title.trim() && !body.trim()) { setEditing(null); return; }
    if (n === 'new') await d.runAsync('INSERT INTO notes (title, body, ts) VALUES (?,?,?)', title.trim() || 'Untitled', body, Date.now());
    else await d.runAsync('UPDATE notes SET title=?, body=?, ts=? WHERE id=?', title.trim() || 'Untitled', body, Date.now(), n.id);
    setEditing(null);
    await load();
  }
  async function remove(n: Note) {
    const d = await notesDb();
    await d.runAsync('DELETE FROM notes WHERE id=?', n.id);
    setEditing(null);
    await load();
  }

  if (editing) return <Editor note={editing} onSave={save} onDelete={remove} onBack={() => setEditing(null)} />;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 10 }}>
      <View style={{ paddingHorizontal: 22, paddingBottom: 14 }}>
        <H1 style={{ fontSize: 52, lineHeight: 56 }}>Notes</H1>
        <Clay radius={20} style={{ marginTop: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: t.textDim, fontSize: 16, marginRight: 8 }}>⌕</Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search notes"
            placeholderTextColor={t.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={async () => {
              const v = q.trim();
              if (onSecret && v === '::setup') { setQ(''); onSecret(); return; }
              if (v.length >= 4 && (await tryUnlock(v))) setQ('');
            }}
            style={{ flex: 1, paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 16 }}
          />
        </Clay>
      </View>
      <FlatList
        data={notes}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 140, gap: 14 }}
        ListEmptyComponent={<Text style={{ color: t.textDim, fontFamily: fonts.body, textAlign: 'center', marginTop: 60 }}>{q ? 'No matching notes' : 'No notes yet. Tap + to write one.'}</Text>}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(260)} layout={LinearTransition.duration(200)}>
            <ClayPress onPress={() => setEditing(item)} radius={24} style={{ padding: 18 }} label={item.title}>
              <Text numberOfLines={1} style={{ color: t.text, fontFamily: fonts.bold, fontSize: 18 }}>{item.title}</Text>
              <Text numberOfLines={2} style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 14, marginTop: 4 }}>{item.body || 'No text'}</Text>
              <Label style={{ marginTop: 10 }}>{new Date(item.ts).toLocaleDateString()}</Label>
            </ClayPress>
          </Animated.View>
        )}
      />
      <View style={{ position: 'absolute', right: 24, bottom: ins.bottom + 24 }}>
        <ClayPress onPress={() => setEditing('new')} radius={32} color={t.accent} style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }} label="New note">
          <Text style={{ color: t.onAccent, fontSize: 34, marginTop: -3, fontFamily: fonts.medium }}>+</Text>
        </ClayPress>
      </View>
    </View>
  );
}

function Editor({ note, onSave, onDelete, onBack }: { note: Note | 'new'; onSave: (n: Note | 'new', title: string, body: string) => void; onDelete: (n: Note) => void; onBack: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [title, setTitle] = useState(note === 'new' ? '' : note.title);
  const [body, setBody] = useState(note === 'new' ? '' : note.body);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 10, paddingHorizontal: 22, paddingBottom: ins.bottom + 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Pressable onPress={onBack} hitSlop={12}><Text style={{ color: t.textDim, fontFamily: fonts.medium, fontSize: 16 }}>Cancel</Text></Pressable>
        {note !== 'new' && <Pressable onPress={() => onDelete(note)} hitSlop={12}><Text style={{ color: t.danger, fontFamily: fonts.medium, fontSize: 16 }}>Delete</Text></Pressable>}
      </View>
      <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={t.textDim} autoCapitalize="none"
        style={{ color: t.text, fontFamily: fonts.display, fontSize: 34, paddingVertical: 8, textTransform: 'uppercase' }} />
      <TextInput value={body} onChangeText={setBody} placeholder="Write something" placeholderTextColor={t.textDim} multiline textAlignVertical="top"
        style={{ flex: 1, color: t.text, fontFamily: fonts.body, fontSize: 17, lineHeight: 25 }} />
      <Button title="Save" onPress={() => onSave(note, title, body)} />
    </KeyboardAvoidingView>
  );
}
