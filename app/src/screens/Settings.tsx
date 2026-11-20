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

function Section({ title, children, i }: { title: string; children: React.ReactNode; i: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(i * 50).duration(260)} style={{ gap: 12 }}>
      <Label>{title}</Label>
      {children}
    </Animated.View>
  );
}

export function SettingsScreen({
  settings, onChange, onBack, onLock, onPanic,
}: { settings: S; onChange: (s: S) => void; onBack: () => void; onLock: () => void; onPanic: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [safety, setSafety] = useState<string | null>(null);
  const [upd, setUpd] = useState<UpdateResult | null>(null);
  const [updMsg, setUpdMsg] = useState('');
  const [checking, setChecking] = useState(false);
  const [sub, setSub] = useState<'main' | 'codes'>('main');
  const [shortName, setShortName] = useState('');
  const [shortIcon, setShortIcon] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const set = (p: Partial<S>) => onChange({ ...settings, ...p });
  const allIds = disguises.map((d) => d.id);

  useEffect(() => { void safetyNumber().then(setSafety); }, []);

  async function pickDisguise(id: string) {
    set({ disguise: id });
    if (!Disguise.available) return setNote('Icon switching only works in the installed app.');
    Disguise.setAlias(id, allIds);
    setNote('Changed. Some phone home screens take a few seconds, or a restart of the launcher, to show the new name and icon.');
  }

  async function pickShortcutIcon() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    const m = await manipulateAsync(r.assets[0].uri, [{ resize: { width: 192, height: 192 } }], { format: SaveFormat.PNG, base64: true });
    setShortIcon(m.base64 ?? null);
  }

  async function addShortcut() {
    if (!shortName.trim()) return setNote('Type the name you want first.');
    const ok = await Disguise.pinShortcut(shortName.trim(), shortIcon);
    setNote(ok ? 'Your phone will ask to add it to the home screen.' : 'This phone or launcher cannot add home-screen shortcuts.');
  }

  async function onCheck() {
    setChecking(true); setUpdMsg(''); setUpd(null);
    const r = await checkForUpdate();
    setUpd(r); setChecking(false);
  }
  async function onInstall() {
    const err = await downloadAndInstall(setUpdMsg);
    if (err) setUpdMsg(err);
  }

  if (sub === 'codes') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 22, paddingTop: ins.top + 20, paddingBottom: ins.bottom + 30, gap: 18 }} keyboardShouldPersistTaps="handled">
        <Codes change onDone={() => setSub('main')} />
        <Button title="Cancel" kind="plain" onPress={() => setSub('main')} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 22, paddingTop: ins.top + 14, paddingBottom: ins.bottom + 40, gap: 26 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1 style={{ fontSize: 46 }}>Settings</H1>
        <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>Done</Text></Pressable>
      </View>
      {note ? <Clay radius={16} style={{ padding: 12 }}><Body dim>{note}</Body></Clay> : null}

      <Section title="Colours" i={0}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {[{ id: 'auto', name: 'Auto', swatch: [t.bg, t.accent2, t.accent] as [string, string, string] }, ...THEMES].map((th) => {
            const on = settings.theme === th.id;
            return (
              <ClayPress key={th.id} onPress={() => set({ theme: th.id })} radius={20} style={{ padding: 12, width: '47%', borderWidth: on ? 2 : 0, borderColor: t.accent }} label={th.name}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {th.swatch.map((c, i) => <View key={i} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, borderWidth: 1, borderColor: 'rgba(128,128,128,0.35)' }} />)}
                </View>
                <Text style={{ color: t.text, fontFamily: fonts.bold }}>{th.name}</Text>
              </ClayPress>
            );
          })}
        </View>
      </Section>

      <Section title="App icon and name" i={1}>
        <Body dim>What shows on your home screen. Pick any one; you can change it as often as you like.</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {disguises.map((d) => {
            const on = settings.disguise === d.id;
            return (
              <ClayPress key={d.id} onPress={() => void pickDisguise(d.id)} radius={20} style={{ padding: 10, width: '22%', alignItems: 'center', borderWidth: on ? 2 : 0, borderColor: t.accent }} label={d.label}>
                <DisguiseIcon id={d.id} size={44} />
                <Text numberOfLines={1} style={{ color: t.text, fontFamily: fonts.medium, fontSize: 11, marginTop: 6 }}>{d.label}</Text>
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
          <Button title={shortIcon ? 'Picture chosen' : 'Choose picture'} kind="plain" onPress={() => void pickShortcutIcon()} style={{ flex: 1 }} />
          <Button title="Add to home" onPress={() => void addShortcut()} style={{ flex: 1 }} />
        </View>
      </Section>

      <Section title="Notes: how to open" i={2}>
        <Row label="Also open by saving a note titled with the code" value={settings.notesUnlock === 'title'} onChange={(v) => set({ notesUnlock: v ? 'title' : 'search' })} />
        <Body dim>The search box always works: type the notes code, then press the search key.</Body>
      </Section>

      <Section title="Chat" i={3}>
        <Label>What you call your partner</Label>
        <Clay radius={18} style={{ paddingHorizontal: 16 }}>
          <TextInput value={settings.nickname} onChangeText={(v) => set({ nickname: v.slice(0, 20) })} placeholderTextColor={t.textDim}
            style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
        </Clay>
        <Row label="Save received pictures to gallery by default" value={settings.saveToGallery} onChange={(v) => set({ saveToGallery: v })} />
        <Row label="Lock the moment you leave the app" value={settings.autoLockSeconds === 0} onChange={(v) => set({ autoLockSeconds: v ? 0 : 30 })} />
      </Section>

      <Section title="Security" i={4}>
        <Button title="Change codes" kind="plain" onPress={() => setSub('codes')} />
        <Label>Safety number</Label>
        <Clay radius={18} style={{ padding: 14 }}>
          <Text selectable style={{ color: t.text, fontFamily: fonts.bold, fontSize: 18, letterSpacing: 1 }}>{safety ?? '—'}</Text>
          <Body dim style={{ marginTop: 6 }}>You and your partner should see the same number. If it differs, someone has tampered with the pairing.</Body>
        </Clay>
        <Button title="Lock now" kind="plain" onPress={onLock} />
        <Button title="Erase everything on this phone" kind="danger" onPress={() =>
          Alert.alert('Erase this phone?', 'All messages and keys on this phone are deleted for good. Your partner keeps their copy.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Erase', style: 'destructive', onPress: onPanic },
          ])} />
      </Section>

      <Section title="App updates" i={5}>
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
