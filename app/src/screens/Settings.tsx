import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Body, Button, Clay, ClayPress, H1, Label, Switch } from '../ui/Clay';
import { THEMES, fonts, useTheme } from '../theme';
import disguises from '../../config/disguises';
import { Disguise } from '../../modules/disguise';
import type { Settings as S } from '../core/storage';
import { safetyNumber } from '../core/pairing';
import { checkForUpdate, currentVersion, downloadAndInstall, type UpdateResult } from '../core/update';
import { Codes } from './Setup';
import { BackupScreen } from './Backup';
import { ThemeGallery } from './ThemeGallery';
import { Icon, type IconName } from '../ui/Icon';
import { Backdrop } from '../ui/Backdrop';
import { session } from '../core/session';
import { daysTogether, parseDate } from '../core/days';
import { whileSystemUi } from '../core/lockGuard';
import { askFingerprint, fingerprintAvailable } from '../core/fingerprint';
import { useBackHandler } from '../core/backStack';

export function DisguiseIcon({ id, size = 56 }: { id: string; size?: number }) {
  const d = disguises.find((x) => x.id === id) ?? disguises[0];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox="18 18 72 72">
        <Rect x="0" y="0" width="108" height="108" fill={d.bg} />
        {d.glyph.map((g, i) => (
          <Path key={i} d={g.d} fill={g.fill ?? 'none'} stroke={g.stroke} strokeWidth={g.strokeWidth} strokeLinecap={g.cap} strokeLinejoin={g.cap ? 'round' : undefined} />
        ))}
      </Svg>
    </View>
  );
}

/** A group of settings in its own soft card, with a small icon so you can find things at a glance. */
function Section({ title, icon, children, i }: { title: string; icon: IconName; children: React.ReactNode; i: number }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(i * 50).duration(260)}>
      <Clay radius={28} style={{ padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.accent + '33', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={18} color={t.accent} />
          </View>
          <Text style={{ color: t.text, fontFamily: fonts.bold, fontSize: 17 }}>{title}</Text>
        </View>
        {children}
      </Clay>
    </Animated.View>
  );
}

export function SettingsScreen({
  settings, onChange, onBack, onLock, onPanic, onRestored, onRepair,
}: { settings: S; onChange: (s: S) => void; onBack: () => void; onLock: () => void; onPanic: () => void; onRestored?: () => void; onRepair?: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [safety, setSafety] = useState<string | null>(null);
  const [upd, setUpd] = useState<UpdateResult | null>(null);
  const [updMsg, setUpdMsg] = useState('');
  const [checking, setChecking] = useState(false);
  const [sub, setSub] = useState<'main' | 'codes' | 'backup' | 'themes'>('main');
  const [shortName, setShortName] = useState('');
  const [shortIcon, setShortIcon] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const set = (p: Partial<S>) => onChange({ ...settings, ...p });
  const allIds = disguises.map((d) => d.id);

  useEffect(() => { void safetyNumber().then(setSafety); }, []);
  useBackHandler(sub !== 'main', () => setSub('main'), 1); // back from themes, codes or backup returns to Settings

  async function pickDisguise(id: string) {
    set({ disguise: id });
    if (!Disguise.available) return setNote('Icon switching only works in the installed app.');
    Disguise.setAlias(id, allIds);
    setNote('Changed. Some phone home screens take a few seconds, or a restart of the launcher, to show the new name and icon.');
  }

  async function pickShortcutIcon() {
    const r = await whileSystemUi(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 }));
    if (r.canceled || !r.assets[0]) return;
    const m = await manipulateAsync(r.assets[0].uri, [{ resize: { width: 192, height: 192 } }], { format: SaveFormat.PNG, base64: true });
    setShortIcon(m.base64 ?? null);
  }

  async function addShortcut() {
    if (!shortName.trim()) return setNote('Type the name you want first.');
    const ok = await whileSystemUi(() => Disguise.pinShortcut(shortName.trim(), shortIcon));
    setNote(ok ? 'Your phone will ask to add it to the home screen.' : 'This phone or launcher cannot add home-screen shortcuts.');
  }

  async function onCheck() {
    setChecking(true); setUpdMsg(''); setUpd(null);
    const r = await checkForUpdate();
    setUpd(r); setChecking(false);
  }
  async function onInstall() {
    const err = await whileSystemUi(() => downloadAndInstall(setUpdMsg));
    if (err) setUpdMsg(err);
  }

  if (sub === 'themes') return <ThemeGallery theme={settings.theme} accent={settings.accent} onTheme={(id) => set({ theme: id })} onAccent={(a) => set({ accent: a })} onBack={() => setSub('main')} />;
  if (sub === 'backup') return <BackupScreen nickname={settings.nickname} settings={settings} onSettings={onChange} onBack={() => setSub('main')} onRestored={onRestored} />;
  if (sub === 'codes') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 22, paddingTop: ins.top + 20, paddingBottom: ins.bottom + 30, gap: 18 }} keyboardShouldPersistTaps="handled">
        <Codes change onDone={() => setSub('main')} />
        <Button title="Cancel" kind="plain" onPress={() => setSub('main')} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
    <Backdrop />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 22, paddingTop: ins.top + 14, paddingBottom: ins.bottom + 40, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1 style={{ fontSize: 46 }}>Settings</H1>
        <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>Done</Text></Pressable>
      </View>
      <Animated.View entering={FadeInDown.duration(260)}>
        <Clay radius={28} color={t.accent} style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: t.onAccent + '24', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.onAccent, fontFamily: fonts.display, fontSize: 28 }}>{(settings.nickname.trim()[0] ?? 'U').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.onAccent, fontFamily: fonts.display, fontSize: 26, textTransform: 'uppercase' }}>{settings.nickname || 'Us'}</Text>
            <Text style={{ color: t.onAccent, opacity: 0.8, fontFamily: fonts.medium, fontSize: 12 }}>{daysTogether(settings.since) ? `Day ${daysTogether(settings.since)} together ♥` : 'Private and end-to-end encrypted'}</Text>
          </View>
          <Icon name="lock" size={22} color={t.onAccent} />
        </Clay>
      </Animated.View>
      {note ? <Clay radius={16} style={{ padding: 12 }}><Body dim>{note}</Body></Clay> : null}

      <Section icon="star" title="Theme" i={0}>
        <ClayPress onPress={() => setSub('themes')} radius={24} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }} label="Open the theme gallery">
          <View style={{ flexDirection: 'row' }}>
            {t.swatch.map((c, i) => <View key={i} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c, marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: t.surface }} />)}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontFamily: fonts.bold, fontSize: 16 }}>{t.name}</Text>
            <Text style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 12 }}>Open the theme gallery</Text>
          </View>
          <Icon name="more" size={20} color={t.textDim} />
        </ClayPress>
      </Section>

      <Section icon="eye" title="App icon and name" i={1}>
        <Row label="Use a disguise (needs a code to open)" value={settings.cover} onChange={(v) => {
          if (v) set({ cover: true });
          else Alert.alert('Turn the disguise off?', 'The app will open straight into your chat with no code, and show as a plain "Chat" icon. Anyone holding your unlocked phone can open it.', [
            { text: 'Keep the disguise', style: 'cancel' }, { text: 'Turn it off', style: 'destructive', onPress: () => set({ cover: false }) },
          ]);
        }} />
        <Body dim>{settings.cover ? 'What shows on your home screen. Pick any one; you can change it as often as you like.' : 'No cover: the app opens straight into the chat. Turn the disguise back on above any time.'}</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {disguises.filter((d) => d.kind !== 'chat').map((d) => {
            const on = settings.disguise === d.id;
            return (
              <ClayPress key={d.id} onPress={() => void pickDisguise(d.id)} radius={20} style={{ padding: 8, width: '22.5%', alignItems: 'center', borderWidth: on ? 2 : 0, borderColor: t.accent }} label={d.label}>
                <DisguiseIcon id={d.id} size={44} />
                <Text numberOfLines={1} style={{ color: t.text, fontFamily: fonts.medium, fontSize: 10, marginTop: 6 }}>{d.label}</Text>
              </ClayPress>
            );
          })}
        </View>
        <Label style={{ marginTop: 6 }}>Your own name and picture</Label>
        <Body dim>Adds an extra home-screen icon with any name and picture you choose. Pick a ready-made icon above too, so the real app entry also looks ordinary.</Body>
        <Clay radius={18} style={{ paddingHorizontal: 16 }}>
          <TextInput value={shortName} onChangeText={setShortName} placeholder="Name, e.g. Budget" placeholderTextColor={t.textDim}
            style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
        </Clay>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button title={shortIcon ? 'Picture set' : 'Picture'} kind="plain" onPress={() => void pickShortcutIcon()} style={{ flex: 1 }} />
          <Button title="Add to home" onPress={() => void addShortcut()} style={{ flex: 1 }} />
        </View>
      </Section>

      <Section icon="note" title="Notes: how to open" i={2}>
        <Row label="Also open by saving a note titled with the code" value={settings.notesUnlock === 'title'} onChange={(v) => set({ notesUnlock: v ? 'title' : 'search' })} />
        <Body dim>The search box always works: type the notes code, then press the search key.</Body>
      </Section>

      <Section icon="heart" title="Chat" i={3}>
        <Label>What you call your partner</Label>
        <Clay radius={18} style={{ paddingHorizontal: 16 }}>
          <TextInput value={settings.nickname} onChangeText={(v) => set({ nickname: v.slice(0, 20) })} placeholderTextColor={t.textDim}
            style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
        </Clay>
        <Label>Together since (optional, like 2023-02-14)</Label>
        <Clay radius={18} style={{ paddingHorizontal: 16 }}>
          <TextInput value={settings.since} onChangeText={(v) => { const d = v.replace(/[^0-9-]/g, '').slice(0, 10); set({ since: d }); if (parseDate(d)) session.shareSince(d); }} placeholder="YYYY-MM-DD" placeholderTextColor={t.textDim} keyboardType="numbers-and-punctuation"
            style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
        </Clay>
        <Row label="Save received pictures to gallery by default" value={settings.saveToGallery} onChange={(v) => set({ saveToGallery: v })} />
        <Label style={{ marginTop: 6 }}>Disappearing messages</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[{ l: 'Off', v: 0 }, { l: '1 hour', v: 3600 }, { l: '1 day', v: 86400 }, { l: '1 week', v: 604800 }].map((o) => {
            const on = settings.disappear === o.v;
            return (
              <ClayPress key={o.v} onPress={() => set({ disappear: o.v })} radius={16} color={on ? t.accent : undefined} style={{ paddingVertical: 10, paddingHorizontal: 16 }} label={o.l}>
                <Text style={{ color: on ? t.onAccent : t.text, fontFamily: fonts.bold }}>{o.l}</Text>
              </ClayPress>
            );
          })}
        </View>
        <Body dim>Applies to messages you send from now on. Ask your partner to set the same on their phone.</Body>
        <Row label="Notifications (a plain 'something new', never any content)" value={settings.notifications} onChange={(v) => { set({ notifications: v }); if (!v) session.disablePush(); }} />
        <Body dim>{{ on: 'Notifications are on.', denied: 'Android has notifications blocked for this app. Allow them in Android settings.', unavailable: 'Notifications are not set up on this build yet.', unknown: 'Opens on the next unlock.' }[session.getState().push]}</Body>
        <Row label="Lock the moment you leave the app" value={settings.autoLockSeconds === 0} onChange={(v) => set({ autoLockSeconds: v ? 0 : 30 })} />
      </Section>

      <Section icon="lock" title="Security" i={4}>
        <Row label="Fingerprint unlock" value={settings.biometric} onChange={async (v) => {
          if (!v) return set({ biometric: false });
          const a = await fingerprintAvailable();
          if (a === 'no_sensor') return setNote('This phone has no fingerprint sensor.');
          if (a === 'not_enrolled') return setNote('No fingerprint is saved on this phone yet. Add one in Android settings first.');
          if (await askFingerprint()) { set({ biometric: true }); setNote('Fingerprint unlock is on. Hold the = key (or the Notes title) and touch the sensor.'); }
        }} />
        <Body dim>An extra way in besides your code. Anyone whose fingerprint is saved on this phone can open the chat with it.</Body>
        <Button title="Change codes" kind="plain" onPress={() => setSub('codes')} />
        <Label>Safety number</Label>
        <Clay radius={18} style={{ padding: 14 }}>
          <Text selectable style={{ color: t.text, fontFamily: fonts.bold, fontSize: 18, letterSpacing: 1 }}>{safety ?? '—'}</Text>
          <Body dim style={{ marginTop: 6 }}>You and your partner should see the same number. If it differs, someone has tampered with the pairing.</Body>
        </Clay>
        <Button title="Lock now" kind="plain" onPress={onLock} />
        {onRepair && (
          <Button title="Pair with the server again" kind="plain" onPress={() =>
            Alert.alert('Pair again?', 'Use this only if the server was reset. Your messages on this phone stay. You and your partner scan the codes again.', [
              { text: 'Cancel', style: 'cancel' }, { text: 'Pair again', onPress: onRepair },
            ])} />
        )}
        <Button title="Erase everything on this phone" kind="danger" onPress={() =>
          Alert.alert('Erase this phone?', 'All messages and keys on this phone are deleted for good. Your partner keeps their copy. Without a backup you will need to reset the pairing on the server to use this phone again.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Erase', style: 'destructive', onPress: onPanic },
          ])} />
      </Section>

      <Section icon="download" title="Backup" i={5}>
        <Body dim>{settings.lastBackup ? 'Last backup: ' + new Date(settings.lastBackup).toLocaleDateString() : 'You have not made a backup yet.'}</Body>
        <Button title="Backup and restore" onPress={() => setSub('backup')} />
      </Section>

      <Section icon="upload" title="App updates" i={6}>
        <Body dim>Version {currentVersion()}</Body>
        <Button title={checking ? 'Checking…' : 'Check for updates'} disabled={checking} onPress={() => void onCheck()} />
        {upd?.kind === 'latest' && <Body>You have the latest version.</Body>}
        {upd?.kind === 'error' && <Text style={{ color: t.danger, fontFamily: fonts.medium }}>{upd.message}</Text>}
        {upd?.kind === 'available' && (
          <Clay radius={18} style={{ padding: 14, gap: 10 }}>
            <Body bold>Version {upd.info.versionName} is ready</Body>
            {upd.info.notes ? <Body dim>{upd.info.notes}</Body> : null}
            <Button title="Download and install" onPress={() => void onInstall()} />
          </Clay>
        )}
        {updMsg ? <Body dim>{updMsg}</Body> : null}
      </Section>
    </ScrollView>
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Body style={{ flex: 1 }}>{label}</Body>
      <Switch value={value} onChange={onChange} />
    </View>
  );
}
