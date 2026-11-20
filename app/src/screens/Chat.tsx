import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator, Animated as RNAnimated, FlatList, Image, KeyboardAvoidingView, Modal, PanResponder, Pressable, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { RecordingPresets, createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type AudioPlayer } from 'expo-audio';
import { Body, Button, Clay, ClayPress, H1, Label, Switch } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { Backdrop } from '../ui/Backdrop';
import { fonts, useTheme } from '../theme';
import { session } from '../core/session';
import { dataUri } from '../core/images';
import type { Msg } from '../core/db';
import { ImageViewer } from './ImageViewer';

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const useChat = () => useSyncExternalStore(session.subscribe, session.getState);
const tick = (m: Msg) => (m.state === 0 ? '○' : m.state === 1 ? '✓' : '✓✓');

type Item = { t: 'day'; id: string; label: string } | { t: 'msg'; id: string; m: Msg; first: boolean; last: boolean };

function dayLabel(ts: number) {
  const d = new Date(ts), now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, now)) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

function buildItems(messages: Msg[]): Item[] {
  const now = Date.now();
  const list = messages.filter((m) => !(m.exp > 0 && m.exp <= now));
  const out: Item[] = [];
  list.forEach((m, i) => {
    const prev = list[i - 1], next = list[i + 1];
    if (!prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString()) out.push({ t: 'day', id: 'd' + m.ts, label: dayLabel(m.ts) });
    const first = !prev || prev.mine !== m.mine || m.ts - prev.ts > 5 * 60_000 || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
    const last = !next || next.mine !== m.mine || next.ts - m.ts > 5 * 60_000 || new Date(next.ts).toDateString() !== new Date(m.ts).toDateString();
    out.push({ t: 'msg', id: m.id, m, first, last });
  });
  return out;
}

export function Chat({ nickname, ttlSeconds, onSettings, onNotes, onStarred, onImport }: {
  nickname: string; ttlSeconds: number; onSettings: () => void; onNotes: () => void; onStarred: () => void; onImport: () => void;
}) {
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
  const [attach, setAttach] = useState(false);
  const [once, setOnce] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [viewer, setViewer] = useState<Msg | null>(null);
  const [more, setMore] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const [recStart, setRecStart] = useState<number | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  const [, tickNow] = useState(0);

  useEffect(() => {
    session.viewing = true;
    void session.markRead();
    return () => { session.viewing = false; };
  }, []);
  useEffect(() => {
    if (chat.messages.some((m) => !m.mine && !m.seen)) void session.markRead();
  }, [chat.messages]);
  useEffect(() => {
    if (searching) void session.search(q).then(setFound);
  }, [q, searching, chat.messages]);
  useEffect(() => {
    // hide disappearing messages right when their time is up
    const iv = setInterval(() => tickNow((n) => n + 1), 15_000);
    return () => clearInterval(iv);
  }, []);

  const byId = useMemo(() => new Map(chat.messages.map((m) => [m.id, m])), [chat.messages]);
  const searchMode = searching && q.trim().length > 0;
  const data: Item[] = useMemo(
    () => (searchMode ? found.map((m) => ({ t: 'msg' as const, id: m.id, m, first: true, last: true })) : buildItems(chat.messages).reverse()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat.messages, searchMode, found, tickNow],
  );
  const pinned = useMemo(() => [...chat.messages].reverse().find((m) => m.pinned && !m.deleted), [chat.messages]);

  useEffect(() => {
    if (recStart === null) return;
    const iv = setInterval(() => {
      const secs = Math.floor((Date.now() - recStart) / 1000);
      setRecSecs(secs);
      if (secs >= 120) void stopRec(true); // voice notes are at most 2 minutes
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recStart]);

  async function startRec() {
    setErr('');
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return setErr('The microphone is not allowed. You can allow it in Android settings.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecSecs(0); setRecStart(Date.now());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (e) {
      setErr('Could not start recording: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function stopRec(sendIt: boolean) {
    const started = recStart;
    setRecStart(null);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      const secs = started ? (Date.now() - started) / 1000 : 0;
      if (uri && sendIt && secs >= 1) await session.sendVoice(uri, secs, replyTo?.id), setReplyTo(null);
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    } catch (e) {
      setErr('Voice note failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function send() {
    if (!text.trim()) return;
    if (editing) void session.editMine(editing.id, text);
    else void session.sendText(text, replyTo?.id);
    setText(''); setReplyTo(null); setEditing(null);
    session.typing(false);
  }

  async function pick(source: 'gallery' | 'camera') {
    setAttach(false); setErr('');
    try {
      let r: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setErr('The camera is not allowed. You can allow it in Android settings.');
        r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      }
      if (r.canceled || !r.assets[0]) return;
      setSending(true);
      await session.sendImage({ uri: r.assets[0].uri, width: r.assets[0].width }, once, replyTo?.id);
      setReplyTo(null); setOnce(false);
    } catch (e) {
      setErr('Could not send the picture: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  }

  const connected = chat.status === 'online';
  const status = chat.peerTyping ? '' : !connected ? (chat.status === 'connecting' ? 'connecting…' : 'offline') : chat.peerOnline ? 'online' : 'last seen recently';
  const initial = (nickname.trim()[0] ?? 'U').toUpperCase();

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      <View style={{ paddingTop: ins.top + 8, paddingHorizontal: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Clay radius={24} color={t.accent} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.onAccent, fontFamily: fonts.display, fontSize: 24 }}>{initial}</Text>
        </Clay>
        <View style={{ flex: 1 }}>
          <H1 style={{ fontSize: 30, lineHeight: 34 }}>{nickname}</H1>
          {chat.peerTyping ? <TypingDots /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Label style={{ color: chat.peerOnline && connected ? t.good : t.textDim }}>{status}</Label>
              {ttlSeconds > 0 && <Icon name="timer" size={12} color={t.textDim} />}
            </View>
          )}
        </View>
        <IconBtn icon="heart" label="Thinking of you" onPress={() => { session.thinkingOfYou(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }} />
        <IconBtn icon="more" label="More" onPress={() => setMore(true)} />
      </View>

      {searching && (
        <Animated.View entering={FadeInDown.duration(180)} style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
          <Clay radius={18} style={{ paddingHorizontal: 16 }}>
            <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search messages" placeholderTextColor={t.textDim}
              style={{ paddingVertical: 12, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
          </Clay>
        </Animated.View>
      )}

      {pinned && !searching && (
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut} style={{ marginHorizontal: 18, marginBottom: 8 }}>
          <Clay radius={16} style={{ paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="pin" size={16} color={t.accent} />
            <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontFamily: fonts.medium, fontSize: 13 }}>{pinned.kind === 'img' ? 'Photo' : pinned.kind === 'aud' ? 'Voice note' : pinned.text}</Text>
            <Pressable hitSlop={10} onPress={() => void session.pinMessage(pinned.id, false)}><Icon name="x" size={16} color={t.textDim} /></Pressable>
          </Clay>
        </Animated.View>
      )}

      {(!connected || chat.pending > 0) && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ marginHorizontal: 18, marginBottom: 8 }}>
          <Clay radius={14} style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
            <Text style={{ color: t.textDim, fontFamily: fonts.medium, fontSize: 12 }}>
              {!connected ? 'No connection. ' : ''}{chat.pending > 0 ? `${chat.pending} waiting to send.` : 'Reconnecting…'}
            </Text>
          </Clay>
        </Animated.View>
      )}

      <FlatList
        data={data}
        inverted={!searchMode}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Body dim style={{ textAlign: 'center', marginTop: 40 }}>{searching ? 'Nothing found' : 'Say hello'}</Body>}
        renderItem={({ item }) =>
          item.t === 'day' ? (
            <View style={{ alignItems: 'center', marginVertical: 10 }}>
              <Clay radius={12} depth={0.4} style={{ paddingHorizontal: 12, paddingVertical: 4 }}><Label>{item.label}</Label></Clay>
            </View>
          ) : (
            <Bubble m={item.m} first={item.first} last={item.last} quoted={item.m.replyTo ? byId.get(item.m.replyTo) : undefined}
              onReply={() => setReplyTo(item.m)} onMenu={() => setMenu(item.m)} onOpen={() => setViewer(item.m)} />
          )
        }
      />

      {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium, marginHorizontal: 18, marginBottom: 6 }}>{err}</Text> : null}
      {(replyTo || editing) && (
        <Animated.View entering={FadeInDown.duration(160)} style={{ marginHorizontal: 16, marginBottom: 6 }}>
          <Clay radius={16} style={{ padding: 10, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Label>{editing ? 'Editing' : 'Replying'}</Label>
              <Text numberOfLines={1} style={{ color: t.text, fontFamily: fonts.body }}>{(editing ?? replyTo)!.kind === 'img' ? 'Photo' : (editing ?? replyTo)!.text}</Text>
            </View>
            <Pressable hitSlop={12} onPress={() => { setReplyTo(null); setEditing(null); if (editing) setText(''); }}><Icon name="x" size={18} color={t.textDim} /></Pressable>
          </Clay>
        </Animated.View>
      )}

      {recStart !== null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: ins.bottom + 10, paddingTop: 4 }}>
          <ClayPress onPress={() => void stopRec(false)} radius={26} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }} label="Cancel recording">
            <Icon name="trash" size={22} color={t.danger} />
          </ClayPress>
          <Clay radius={26} style={{ flex: 1, paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <RecDot />
            <Text style={{ color: t.text, fontFamily: fonts.bold, fontSize: 16 }}>{Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}</Text>
            <Text style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 13 }}>Recording…</Text>
          </Clay>
          <ClayPress onPress={() => void stopRec(true)} radius={26} color={t.accent} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }} label="Send voice note">
            <Icon name="send" size={24} color={t.onAccent} />
          </ClayPress>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingBottom: ins.bottom + 10, paddingTop: 4 }}>
          <ClayPress onPress={() => setAttach(true)} radius={26} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }} label="Add a picture" disabled={sending}>
            {sending ? <ActivityIndicator color={t.accent} /> : <Icon name="plus" size={24} />}
          </ClayPress>
          <Clay radius={26} style={{ flex: 1, paddingHorizontal: 18 }}>
            <TextInput value={text} multiline placeholder="Message" placeholderTextColor={t.textDim}
              onChangeText={(v) => { setText(v); if (v) session.typing(true); }}
              style={{ color: t.text, fontFamily: fonts.body, fontSize: 16, paddingVertical: 13, maxHeight: 130 }} />
          </Clay>
          {text.trim() ? (
            <ClayPress onPress={send} radius={26} color={t.accent} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }} label="Send">
              <Icon name={editing ? 'check' : 'send'} size={24} color={t.onAccent} />
            </ClayPress>
          ) : (
            <ClayPress onPress={() => void startRec()} radius={26} color={t.accent} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }} label="Record a voice note">
              <Icon name="mic" size={24} color={t.onAccent} />
            </ClayPress>
          )}
        </View>
      )}

      <MoreSheet open={more} onClose={() => setMore(false)} items={[
        { icon: 'search', label: 'Search messages', run: () => { setSearching(true); setQ(''); } },
        { icon: 'star', label: 'Starred messages', run: onStarred },
        { icon: 'note', label: 'Shared notes', run: onNotes },
        { icon: 'upload', label: 'Import a WhatsApp chat', run: onImport },
        { icon: 'settings', label: 'Settings', run: onSettings },
      ]} />
      <AttachSheet open={attach} once={once} setOnce={setOnce} onClose={() => setAttach(false)} onPick={(s) => void pick(s)} />
      <ActionMenu m={menu} onClose={() => setMenu(null)}
        onReply={(m) => { setReplyTo(m); setEditing(null); }}
        onEdit={(m) => { setEditing(m); setReplyTo(null); setText(m.text); }} />
      <ImageViewer id={viewer?.id ?? null} once={!!viewer?.once} mine={!!viewer?.mine} onClose={() => setViewer(null)} />
      <Hearts at={chat.hiAt} />
    </KeyboardAvoidingView>
  );
}

function MoreSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: { icon: React.ComponentProps<typeof Icon>['name']; label: string; run: () => void }[] }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  if (!open) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Animated.View entering={FadeInDown.duration(200)} style={{ margin: 12, marginBottom: ins.bottom + 12, gap: 10 }}>
          {items.map((it) => (
            <ClayPress key={it.label} onPress={() => { onClose(); it.run(); }} radius={20} style={{ paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }} label={it.label}>
              <Icon name={it.icon} size={22} color={t.accent} />
              <Text style={{ color: t.text, fontFamily: fonts.bold, fontSize: 16 }}>{it.label}</Text>
            </ClayPress>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function IconBtn({ icon, onPress, label }: { icon: React.ComponentProps<typeof Icon>['name']; onPress: () => void; label: string }) {
  return (
    <ClayPress onPress={onPress} radius={18} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }} label={label}>
      <Icon name={icon} size={18} />
    </ClayPress>
  );
}

function TypingDots() {
  const t = useTheme();
  const dot = (delay: number) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const o = useSharedValue(0.3);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 350 }), withTiming(0.3, { duration: 350 })), -1));
    }, [o]);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const s = useAnimatedStyle(() => ({ opacity: o.value }));
    return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.good }, s]} />;
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 14 }}>
      {dot(0)}{dot(150)}{dot(300)}
      <Label style={{ color: t.good, marginLeft: 4 }}>typing</Label>
    </View>
  );
}

function Bubble({ m, first, last, quoted, onReply, onMenu, onOpen }: {
  m: Msg; first: boolean; last: boolean; quoted?: Msg; onReply: () => void; onMenu: () => void; onOpen: () => void;
}) {
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
  const isImg = m.kind === 'img';
  const ratio = m.w && m.h ? m.w / m.h : 1;
  const iw = ratio >= 1 ? 240 : Math.max(150, 240 * ratio), ih = Math.min(320, iw / ratio);

  const tail = mine ? { borderBottomRightRadius: last ? 6 : 22, borderTopRightRadius: first ? 22 : 8 } : { borderBottomLeftRadius: last ? 6 : 22, borderTopLeftRadius: first ? 22 : 8 };

  const imageBody = () => {
    if (m.once) {
      const label = m.viewed ? 'Opened' : mine ? 'View-once photo sent' : 'Photo · view once';
      return (
        <Pressable disabled={m.viewed || mine || m.deleted} onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Icon name="eye" size={22} color={fg} />
          <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: 15 }}>{label}</Text>
        </Pressable>
      );
    }
    if (!m.thumb) return <Text style={{ color: fg, opacity: 0.6, fontFamily: fonts.body }}>Photo not available</Text>;
    return (
      <Pressable onPress={onOpen}>
        <Image source={{ uri: dataUri(m.thumb) }} style={{ width: iw, height: ih, borderRadius: 16 }} resizeMode="cover" />
        {m.text ? <Text style={{ color: fg, fontFamily: fonts.body, fontSize: 15, padding: 8, maxWidth: iw }}>{m.text}</Text> : null}
      </Pressable>
    );
  };

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginTop: first ? 8 : 2 }}>
      <RNAnimated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }], maxWidth: '84%' }}>
        <Pressable onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); if (!m.deleted) onMenu(); }} delayLongPress={280}>
          <Clay radius={22} color={bg} depth={0.55} style={[{ paddingHorizontal: isImg && !m.once && !m.deleted ? 6 : 14, paddingVertical: isImg && !m.once && !m.deleted ? 6 : 9 }, tail]}>
            {m.pinned && !m.deleted && <View style={{ position: 'absolute', top: 6, [mine ? 'left' : 'right']: 8 }}><Icon name="pin" size={12} color={fg} /></View>}
            {quoted && !m.deleted && (
              <View style={{ borderLeftWidth: 3, borderLeftColor: t.accent, paddingLeft: 8, marginBottom: 6, marginHorizontal: isImg ? 8 : 0, opacity: 0.85 }}>
                <Text numberOfLines={2} style={{ color: fg, fontFamily: fonts.body, fontSize: 13 }}>{quoted.deleted ? 'Deleted message' : quoted.kind === 'img' ? 'Photo' : quoted.text}</Text>
              </View>
            )}
            {m.deleted ? (
              <Text style={{ color: fg, opacity: 0.6, fontFamily: fonts.body, fontStyle: 'italic', fontSize: 15 }}>Message deleted</Text>
            ) : m.kind === 'aud' ? <VoiceBody m={m} color={fg} /> : isImg ? imageBody() : (
              <Text style={{ color: fg, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 }}>{m.text}</Text>
            )}
            {(last || m.deleted || isImg) && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginTop: 3, paddingRight: isImg && !m.once ? 6 : 0 }}>
                {m.edited && !m.deleted && <Text style={{ color: fg, opacity: 0.55, fontSize: 10, fontFamily: fonts.body }}>edited</Text>}
                {m.starred && <Icon name="star" size={10} color={fg} />}
                {m.exp > 0 && <Icon name="timer" size={10} color={fg} />}
                <Text style={{ color: fg, opacity: 0.55, fontSize: 10, fontFamily: fonts.body }}>{time}</Text>
                {mine && !m.deleted && (
                  <Text style={{ color: m.state === 3 ? t.accent : fg, opacity: m.state === 3 ? 1 : 0.55, fontSize: 11, fontFamily: fonts.bold }}>{tick(m)}</Text>
                )}
              </View>
            )}
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

function RecDot() {
  const o = useSharedValue(1);
  useEffect(() => { o.value = withRepeat(withSequence(withTiming(0.2, { duration: 500 }), withTiming(1, { duration: 500 })), -1); }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5484D' }, st]} />;
}

let currentPlayer: { player: AudioPlayer; stop: () => void } | null = null;

/** Play button, bar and length for a voice note. Decrypts to a temporary file only while playing. */
function VoiceBody({ m, color }: { m: Msg; color: string }) {
  const t = useTheme();
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), []);

  async function toggle() {
    if (playing) { stopRef.current(); return; }
    currentPlayer?.stop();
    setLoading(true);
    let tmp = '';
    try {
      const b64 = await session.imageData(m.id);
      if (!b64) return;
      tmp = (FileSystem.cacheDirectory ?? '') + 'v-' + m.id + '.m4a';
      await FileSystem.writeAsStringAsync(tmp, b64, { encoding: FileSystem.EncodingType.Base64 });
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const player = createAudioPlayer({ uri: tmp });
      let iv: ReturnType<typeof setInterval> | null = null;
      const stop = () => {
        if (iv) clearInterval(iv);
        try { player.pause(); player.remove(); } catch { /* already released */ }
        FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
        setPlaying(false); setPos(0);
        if (currentPlayer?.player === player) currentPlayer = null;
      };
      stopRef.current = stop;
      currentPlayer = { player, stop };
      player.play();
      setPlaying(true);
      iv = setInterval(() => {
        setPos(player.currentTime ?? 0);
        if (!player.playing && (player.currentTime ?? 0) > 0.2 && (player.currentTime ?? 0) >= (player.duration || m.w) - 0.3) stop();
      }, 200);
    } catch {
      if (tmp) FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  const total = Math.max(1, m.w);
  const pct = Math.min(1, pos / total);
  const label = playing ? Math.floor(pos) : total;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190, paddingVertical: 2 }}>
      <Pressable onPress={() => void toggle()} hitSlop={8} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color, opacity: 0.9, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator size="small" color={t.bg} /> : <Icon name={playing ? 'stop' : 'play'} size={16} color={t.bg} />}
      </Pressable>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: color + '33', overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: color }} />
      </View>
      <Text style={{ color, fontFamily: fonts.medium, fontSize: 12, width: 34, textAlign: 'right' }}>{Math.floor(label / 60)}:{String(label % 60).padStart(2, '0')}</Text>
    </View>
  );
}

function AttachSheet({ open, once, setOnce, onClose, onPick }: { open: boolean; once: boolean; setOnce: (v: boolean) => void; onClose: () => void; onPick: (s: 'gallery' | 'camera') => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  if (!open) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <Animated.View entering={FadeInDown.duration(200)}>
          <Pressable>
            <Clay radius={30} style={{ margin: 12, marginBottom: ins.bottom + 12, padding: 18, gap: 14 }}>
              <Label>Send a picture</Label>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <ClayPress onPress={() => onPick('gallery')} radius={22} color={t.accent} style={{ flex: 1, paddingVertical: 18, alignItems: 'center', gap: 6 }} label="From gallery">
                  <Icon name="image" size={26} color={t.onAccent} />
                  <Text style={{ color: t.onAccent, fontFamily: fonts.bold }}>Gallery</Text>
                </ClayPress>
                <ClayPress onPress={() => onPick('camera')} radius={22} color={t.accent2} style={{ flex: 1, paddingVertical: 18, alignItems: 'center', gap: 6 }} label="Take a photo">
                  <Icon name="camera" size={26} color={t.dark ? '#1c1730' : '#FFFFFF'} />
                  <Text style={{ color: t.dark ? '#1c1730' : '#FFFFFF', fontFamily: fonts.bold }}>Camera</Text>
                </ClayPress>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="eye" size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontFamily: fonts.bold }}>View once</Text>
                  <Text style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 12 }}>Disappears after your partner opens it.</Text>
                </View>
                <Switch value={once} onChange={setOnce} />
              </View>
              <Text style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 12 }}>Pictures are shrunk, stripped of location, and encrypted before they leave your phone.</Text>
            </Clay>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function ActionMenu({ m, onClose, onReply, onEdit }: { m: Msg | null; onClose: () => void; onReply: (m: Msg) => void; onEdit: (m: Msg) => void }) {
  const t = useTheme();
  if (!m) return null;
  const row = (label: string, icon: React.ComponentProps<typeof Icon>['name'], run: () => void, danger?: boolean) => (
    <ClayPress key={label} onPress={() => { onClose(); run(); }} radius={18} style={{ paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }} label={label}>
      <Icon name={icon} size={20} color={danger ? t.danger : t.text} />
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
          {row('Reply', 'reply', () => onReply(m))}
          {row(m.pinned ? 'Unpin' : 'Pin', 'pin', () => void session.pinMessage(m.id, !m.pinned))}
          {row(m.starred ? 'Remove star' : 'Star', 'star', () => void session.starMessage(m.id, !m.starred))}
          {m.mine && m.kind === 'text' && row('Edit', 'edit', () => onEdit(m))}
          {m.kind === 'img' && !m.once && m.imgKey ? row('Save to gallery', 'download', () => void session.saveImage(m.id)) : null}
          {m.mine && row('Delete for both', 'trash', () => void session.deleteMine(m.id), true)}
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
      <Icon name="heart" size={72} color={t.accent} stroke={2.4} />
    </Animated.View>
  );
}
