import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Body, Button, Clay, ClayPress, H1, Label, Switch } from '../ui/Clay';
import { Backdrop } from '../ui/Backdrop';
import { fonts, useTheme } from '../theme';
import { parseWhatsApp, IMAGE_EXT, type WaParse } from '../core/whatsapp';
import { session } from '../core/session';
import { whileSystemUi } from '../core/lockGuard';

type Loaded = { raw: string; zip: JSZip | null; name: string };

export function ImportWhatsApp({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [order, setOrder] = useState<'auto' | 'dmy' | 'mdy'>('auto');
  const [me, setMe] = useState('');
  const [photos, setPhotos] = useState(true);
  const [share, setShare] = useState(true);
  const [sharePhotos, setSharePhotos] = useState(true);
  const [phase, setPhase] = useState('Importing');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ added: number; photos: number; skipped: number; shared: number } | null>(null);

  const parsed: WaParse | null = useMemo(() => (loaded ? parseWhatsApp(loaded.raw, order === 'auto' ? undefined : order) : null), [loaded, order]);
  const photoCount = useMemo(() => (parsed ? parsed.messages.filter((m) => m.attachment && IMAGE_EXT.test(m.attachment)).length : 0), [parsed]);

  async function choose() {
    setErr(''); setDone(null);
    try {
      const r = await whileSystemUi(() => DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }));
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      setBusy('Reading the file…');
      const isZip = /\.zip$/i.test(a.name) || a.mimeType === 'application/zip' || a.mimeType === 'application/x-zip-compressed';
      let raw: string, zip: JSZip | null = null;
      if (isZip) {
        const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
        zip = await JSZip.loadAsync(b64, { base64: true });
        const txt = zip.file(/\.txt$/i).sort((x, y) => (/_chat\.txt$/i.test(y.name) ? 1 : 0) - (/_chat\.txt$/i.test(x.name) ? 1 : 0))[0];
        if (!txt) throw new Error('No chat text file inside that zip.');
        raw = await txt.async('string');
      } else {
        raw = await FileSystem.readAsStringAsync(a.uri);
      }
      const p = parseWhatsApp(raw);
      if (!p.messages.length) throw new Error('No WhatsApp messages found in that file.');
      setLoaded({ raw, zip, name: a.name });
      setMe(p.senders[0] ?? '');
      setOrder('auto');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  async function run() {
    if (!parsed || !loaded) return;
    if (!session.getState().ready) return setErr('The chat is still starting. Wait a moment and try again.');
    setErr(''); setBusy('Importing…'); setProgress([0, parsed.messages.length]);
    try {
      const r = await session.importWhatsApp(parsed.messages, me, loaded.zip, { photos, share, sharePhotos: share && sharePhotos }, (d, tot, ph) => { setProgress([d, tot]); setPhase(ph); });
      setDone(r);
    } catch (e) {
      setErr('Import stopped: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(''); setProgress(null);
    }
  }

  const first = parsed?.messages[0], last = parsed?.messages[parsed.messages.length - 1];
  const fmt = (ts?: number) => (ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: ins.top + 14, paddingBottom: ins.bottom + 40, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <H1 style={{ fontSize: 40 }}>Import chat</H1>
          <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>Done</Text></Pressable>
        </View>

        {!loaded && (
          <Animated.View entering={FadeIn} style={{ gap: 14 }}>
            <Body dim>Bring an old WhatsApp conversation into this app. It stays on this phone, encrypted. Nothing is sent to anyone.</Body>
            <Clay radius={22} style={{ padding: 16, gap: 8 }}>
              <Label>In WhatsApp</Label>
              <Body>1. Open the chat, tap the three dots, then More, then Export chat.</Body>
              <Body>2. Choose Without media, or Include media for pictures.</Body>
              <Body>3. Save it to Files or Google Drive (not straight to this app).</Body>
              <Body>4. Come back here and choose that file (a .txt or .zip).</Body>
            </Clay>
            <Button title="Choose the export file" onPress={() => void choose()} disabled={!!busy} />
          </Animated.View>
        )}

        {loaded && parsed && !done && (
          <Animated.View entering={FadeIn} style={{ gap: 16 }}>
            <Clay radius={22} style={{ padding: 16, gap: 4 }}>
              <Label>Found</Label>
              <Text style={{ color: t.text, fontFamily: fonts.display, fontSize: 36 }}>{parsed.messages.length.toLocaleString()} MESSAGES</Text>
              <Body dim>{fmt(first?.ts)} to {fmt(last?.ts)}{photoCount ? ` · ${photoCount} photos` : ''}</Body>
            </Clay>

            <Label>Which one is you?</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {parsed.senders.slice(0, 8).map((s) => (
                <ClayPress key={s} onPress={() => setMe(s)} radius={16} color={me === s ? t.accent : undefined} style={{ paddingVertical: 10, paddingHorizontal: 16 }} label={s}>
                  <Text style={{ color: me === s ? t.onAccent : t.text, fontFamily: fonts.bold }}>{s}</Text>
                </ClayPress>
              ))}
            </View>

            {parsed.ambiguous && (
              <Clay radius={18} style={{ padding: 14, gap: 8 }}>
                <Body>The first message reads as <Text style={{ fontFamily: fonts.bold }}>{fmt(first?.ts)}</Text>. If that looks wrong (day and month swapped), switch it.</Body>
                <Button title={parsed.dateOrder === 'dmy' ? 'Read as month first' : 'Read as day first'} kind="plain" onPress={() => setOrder(parsed.dateOrder === 'dmy' ? 'mdy' : 'dmy')} />
              </Clay>
            )}

            {loaded.zip && photoCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Body style={{ flex: 1 }}>Include photos (up to 400, shrunk and encrypted)</Body>
                <Switch value={photos} onChange={setPhotos} />
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Body style={{ flex: 1 }}>Also add this history to my partner's phone (sent encrypted)</Body>
              <Switch value={share} onChange={setShare} />
            </View>
            {share && loaded.zip && photos && photoCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Body style={{ flex: 1 }}>Send the photos too (uses mobile data and takes longer)</Body>
                <Switch value={sharePhotos} onChange={setSharePhotos} />
              </View>
            )}
            <Body dim>Videos, voice messages and files are noted as text only. Importing the same file twice, on one phone or on both, will not make duplicates.</Body>
            <Button title={busy ? 'Importing…' : 'Import into this chat'} onPress={() => void run()} disabled={!!busy || !me} />
            <Button title="Choose a different file" kind="plain" onPress={() => { setLoaded(null); setErr(''); }} disabled={!!busy} />
          </Animated.View>
        )}

        {progress && (
          <Clay radius={18} style={{ padding: 14, gap: 8 }}>
            <Body>{phase} {progress[0].toLocaleString()} of {progress[1].toLocaleString()}…</Body>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceLo, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${Math.round((progress[0] / Math.max(1, progress[1])) * 100)}%`, backgroundColor: t.accent }} />
            </View>
          </Clay>
        )}

        {done && (
          <Animated.View entering={FadeIn} style={{ gap: 14 }}>
            <Clay radius={22} style={{ padding: 18, gap: 6 }}>
              <Label>Done</Label>
              <Text style={{ color: t.text, fontFamily: fonts.display, fontSize: 36 }}>{done.added.toLocaleString()} ADDED</Text>
              <Body dim>{done.photos} photos · {done.skipped} skipped (already there or empty){done.shared ? ` · ${done.shared} sent to your partner` : ''}</Body>
            </Clay>
            <Button title="Back to the chat" onPress={onBack} />
          </Animated.View>
        )}

        {busy && !progress ? <View style={{ alignItems: 'center', gap: 8 }}><ActivityIndicator color={t.accent} /><Body dim>{busy}</Body></View> : null}
        {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium }}>{err}</Text> : null}
      </ScrollView>
    </View>
  );
}
