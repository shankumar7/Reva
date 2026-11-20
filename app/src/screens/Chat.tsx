import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Animated as RNAnimated, FlatList, KeyboardAvoidingView, Modal, PanResponder, Pressable, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Body, Clay, ClayPress, H1, Label } from '../ui/Clay';
import { fonts, useTheme } from '../theme';
import { session } from '../core/session';
import type { Msg } from '../core/db';

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

function useChat() {
  return useSyncExternalStore(session.subscribe, session.getState);
}

const tick = (m: Msg) => (m.state === 0 ? '○' : m.state === 1 ? '✓' : '✓✓');

export function Chat({ nickname, onSettings }: { nickname: string; onSettings: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const chat = useChat();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [menu, setMenu] = useState<Msg | null>(null);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Msg[]>([]);

  useEffect(() => {
    session.viewing = true;
    void session.markRead();
    return () => { session.viewing = false; };
  }, []);
  useEffect(() => {
    // a new message arrived while looking at the chat: it counts as read
    if (chat.messages.some((m) => !m.mine && !m.seen)) void session.markRead();
  }, [chat.messages]);
  useEffect(() => {
    if (searching) void session.search(q).then(setFound);
  }, [q, searching, chat.messages]);

  const byId = useMemo(() => new Map(chat.messages.map((m) => [m.id, m])), [chat.messages]);
  const data = useMemo(() => (searching && q.trim() ? found : [...chat.messages].reverse()), [chat.messages, searching, q, found]);

  function send() {
    if (!text.trim()) return;
    if (editing) void session.editMine(editing.id, text);
    else void session.sendText(text, replyTo?.id);
    setText(''); setReplyTo(null); setEditing(null);
    session.typing(false);
  }

  const status = chat.peerTyping ? 'typing…' : chat.status !== 'online' ? (chat.status === 'connecting' ? 'connecting…' : 'offline') : chat.peerOnline ? 'online' : 'last seen recently';

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingTop: ins.top + 8, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <H1 style={{ fontSize: 34, lineHeight: 38 }}>{nickname}</H1>
          <Label style={{ color: chat.peerTyping || chat.peerOnline ? t.good : t.textDim }}>{status}</Label>
        </View>
        <IconBtn glyph="⌕" label="Search" onPress={() => { setSearching((s) => !s); setQ(''); }} />
        <IconBtn glyph="♥" label="Thinking of you" onPress={() => { session.thinkingOfYou(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }} />
        <IconBtn glyph="⚙" label="Settings" onPress={onSettings} />
      </View>

      {searching && (
        <Animated.View entering={FadeInDown.duration(180)} style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Clay radius={18} style={{ paddingHorizontal: 16 }}>
            <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search messages" placeholderTextColor={t.textDim}
              style={{ paddingVertical: 12, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
          </Clay>
        </Animated.View>
      )}

      {(chat.status !== 'online' || chat.pending > 0) && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ marginHorizontal: 20, marginBottom: 8 }}>
          <Clay radius={14} style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
            <Text style={{ color: t.textDim, fontFamily: fonts.medium, fontSize: 12 }}>
              {chat.status !== 'online' ? 'No connection. ' : ''}{chat.pending > 0 ? `${chat.pending} waiting to send.` : 'Reconnecting…'}
            </Text>
          </Clay>
        </Animated.View>
      )}

      <FlatList
        data={data}
        inverted={!(searching && q.trim())}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Body dim style={{ textAlign: 'center', marginTop: 40 }}>{searching ? 'Nothing found' : 'Say hello'}</Body>}
        renderItem={({ item }) => (
          <Bubble m={item} quoted={item.replyTo ? byId.get(item.replyTo) : undefined}
            onReply={() => setReplyTo(item)} onMenu={() => setMenu(item)} />
        )}
      />

      {(replyTo || editing) && (
        <Animated.View entering={FadeInDown.duration(160)} style={{ marginHorizontal: 16, marginBottom: 6 }}>
          <Clay radius={16} style={{ padding: 10, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Label>{editing ? 'Editing' : 'Replying'}</Label>
              <Text numberOfLines={1} style={{ color: t.text, fontFamily: fonts.body }}>{(editing ?? replyTo)!.text}</Text>
            </View>
            <Pressable hitSlop={12} onPress={() => { setReplyTo(null); setEditing(null); if (editing) setText(''); }}><Text style={{ color: t.textDim, fontSize: 20 }}>✕</Text></Pressable>
          </Clay>
        </Animated.View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingBottom: ins.bottom + 10, paddingTop: 4 }}>
        <Clay radius={26} style={{ flex: 1, paddingHorizontal: 18 }}>
          <TextInput value={text} multiline placeholder="Message" placeholderTextColor={t.textDim}
            onChangeText={(v) => { setText(v); if (v) session.typing(true); }}
            style={{ color: t.text, fontFamily: fonts.body, fontSize: 16, paddingVertical: 13, maxHeight: 130 }} />
        </Clay>
        <ClayPress onPress={send} radius={26} color={t.accent} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }} label="Send">
          <Text style={{ color: t.onAccent, fontSize: 22, fontFamily: fonts.bold }}>{editing ? '✓' : '↑'}</Text>
        </ClayPress>
      </View>

      <ActionMenu m={menu} onClose={() => setMenu(null)}
        onReply={(m) => { setReplyTo(m); setEditing(null); }}
        onEdit={(m) => { setEditing(m); setReplyTo(null); setText(m.text); }} />
      <Hearts at={chat.hiAt} />
    </KeyboardAvoidingView>
  );
}

function IconBtn({ glyph, onPress, label }: { glyph: string; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <ClayPress onPress={onPress} radius={20} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }} label={label}>
      <Text style={{ color: t.text, fontSize: 19 }}>{glyph}</Text>
    </ClayPress>
  );
}

function Bubble({ m, quoted, onReply, onMenu }: { m: Msg; quoted?: Msg; onReply: () => void; onMenu: () => void }) {
  const t = useTheme();
  const x = useRef(new RNAnimated.Value(0)).current;
  const fired = useRef(false);
  const pan = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_, g) => {
        const dx = Math.max(0, Math.min(g.dx, 70));
        x.setValue(dx);
        if (dx > 56 && !fired.current) { fired.current = true; Haptics.selectionAsync().catch(() => {}); }
      },
      onPanResponderRelease: () => {
        if (fired.current) onReply();
        fired.current = false;
        RNAnimated.spring(x, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => { fired.current = false; RNAnimated.spring(x, { toValue: 0, useNativeDriver: true }).start(); },
    }),
    [onReply, x],
  );

  const mine = m.mine;
  const bg = mine ? t.bubbleMine : t.bubbleTheirs;
  const fg = mine ? t.onMine : t.onTheirs;
  const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <RNAnimated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }], maxWidth: '82%' }}>
        <Pressable onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); if (!m.deleted) onMenu(); }} delayLongPress={280}>
          <Clay radius={22} color={bg} depth={0.55} style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
            {quoted && !m.deleted && (
              <View style={{ borderLeftWidth: 3, borderLeftColor: t.accent, paddingLeft: 8, marginBottom: 6, opacity: 0.85 }}>
                <Text numberOfLines={2} style={{ color: fg, fontFamily: fonts.body, fontSize: 13 }}>{quoted.deleted ? 'Deleted message' : quoted.text}</Text>
              </View>
            )}
            {m.deleted ? (
              <Text style={{ color: fg, opacity: 0.6, fontFamily: fonts.body, fontStyle: 'italic', fontSize: 15 }}>Message deleted</Text>
            ) : (
              <Text style={{ color: fg, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{m.text}</Text>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginTop: 3 }}>
              {m.edited && !m.deleted && <Text style={{ color: fg, opacity: 0.55, fontSize: 10, fontFamily: fonts.body }}>edited</Text>}
              <Text style={{ color: fg, opacity: 0.55, fontSize: 10, fontFamily: fonts.body }}>{time}</Text>
              {mine && !m.deleted && (
                <Text style={{ color: m.state === 3 ? t.accent : fg, opacity: m.state === 3 ? 1 : 0.55, fontSize: 11, fontFamily: fonts.bold }}>{tick(m)}</Text>
              )}
            </View>
          </Clay>
          {(m.rMine || m.rTheirs) && !m.deleted && (
            <Animated.View entering={FadeIn.duration(160)} style={{ position: 'absolute', bottom: -12, [mine ? 'left' : 'right']: 8 }}>
              <Clay radius={12} depth={0.4} style={{ paddingHorizontal: 6, paddingVertical: 1, flexDirection: 'row' }}>
                <Text style={{ fontSize: 13 }}>{[m.rMine, m.rTheirs].filter(Boolean).join('')}</Text>
              </Clay>
            </Animated.View>
          )}
        </Pressable>
      </RNAnimated.View>
      {(m.rMine || m.rTheirs) && <View style={{ height: 10 }} />}
    </Animated.View>
  );
}

function ActionMenu({ m, onClose, onReply, onEdit }: { m: Msg | null; onClose: () => void; onReply: (m: Msg) => void; onEdit: (m: Msg) => void }) {
  const t = useTheme();
  if (!m) return null;
  const row = (label: string, run: () => void, danger?: boolean) => (
    <ClayPress key={label} onPress={() => { onClose(); run(); }} radius={18} style={{ paddingVertical: 14, paddingHorizontal: 18 }} label={label}>
      <Text style={{ color: danger ? t.danger : t.text, fontFamily: fonts.bold, fontSize: 16 }}>{label}</Text>
    </ClayPress>
  );
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 28 }}>
        <Animated.View entering={FadeInDown.duration(180)} style={{ gap: 12 }}>
          <Clay radius={28} style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 }}>
            {REACTIONS.map((e) => (
              <Pressable key={e} hitSlop={6} onPress={() => { onClose(); void session.react(m.id, m.rMine === e ? null : e); }}>
                <Text style={{ fontSize: 28 }}>{e}</Text>
              </Pressable>
            ))}
          </Clay>
          {row('Reply', () => onReply(m))}
          {m.mine && row('Edit', () => onEdit(m))}
          {m.mine && row('Delete for both', () => void session.deleteMine(m.id), true)}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Floating heart when your partner taps "thinking of you". */
function Hearts({ at }: { at: number }) {
  const t = useTheme();
  const y = useSharedValue(0);
  const o = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!at) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    y.value = 0; o.value = 1;
    y.value = withTiming(-260, { duration: 1500, easing: Easing.out(Easing.cubic) });
    o.value = withSequence(withTiming(1, { duration: 100 }), withDelay(900, withTiming(0, { duration: 500 })));
  }, [at, y, o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }, { scale: 1 + (-y.value / 260) * 0.6 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', bottom: 120, alignSelf: 'center' }, s]}>
      <Text style={{ fontSize: 64, color: t.accent }}>♥</Text>
    </Animated.View>
  );
}
