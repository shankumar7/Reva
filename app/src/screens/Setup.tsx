import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Body, Button, Clay, ClayPress, H1, Label } from '../ui/Clay';
import { Icon, type IconName } from '../ui/Icon';
import { Backdrop } from '../ui/Backdrop';
import { Enter } from '../ui/motion';
import { fonts, useTheme } from '../theme';
import { ScanQr } from './ScanQr';
import { ShowQr } from './ShowQr';
import { finishAsFirst, joinAsSecond, parseQr, startAsFirst } from '../core/pairing';
import { getCrypto } from '../core/sodium';
import { Vault, defaultSettings } from '../core/storage';
import { BackupScreen } from './Backup';

type Step = 'role' | 'server' | 'showFirst' | 'scanReply' | 'scanPartner' | 'showSecond' | 'codes' | 'restore' | 'done';
type Path = 'start' | 'join';

// How many steps each way has, and where a step sits in it.
const ORDER: Record<Path, Step[]> = {
  start: ['server', 'showFirst', 'scanReply', 'codes'],
  join: ['scanPartner', 'showSecond', 'codes'],
};

/** The progress bar at the top of each step. */
function Stepper({ total, current }: { total: number; current: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < current ? t.accent : t.surfaceLo, opacity: i < current ? 1 : t.dark ? 0.5 : 0.35 }} />
      ))}
    </View>
  );
}

/** Title lines (one accent line), arriving in order: the name first, then what to do. */
function Title({ lines, accentLine = 1, size = 54 }: { lines: string[]; accentLine?: number; size?: number }) {
  const t = useTheme();
  return (
    <View>
      {lines.map((l, i) => (
        <Enter key={l + i} delay={i * 90}>
          <H1 style={{ fontSize: size, lineHeight: size * 0.98, color: i === accentLine ? t.accent : t.text }}>{l}</H1>
        </Enter>
      ))}
    </View>
  );
}

export function Setup({ onDone, startError, initialStep, onExit }: { onDone: () => void; startError?: string; initialStep?: 'codes'; onExit?: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(initialStep ?? 'role');
  const [path, setPath] = useState<Path | null>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(startError ? 'Start-up problem: ' + startError : '');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  /** Runs a step, always ends the spinner, and shows the real error text if something breaks. */
  async function guard(fn: () => Promise<void>) {
    setBusy(true); setErr('');
    try {
      await fn();
    } catch (e) {
      setErr('Something went wrong: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  const first = (u: string, tk: string) =>
    guard(async () => {
      const r = await startAsFirst(u, tk);
      if (!r.ok) return setErr(r.error);
      setQr(JSON.stringify(r.qr));
      go('showFirst');
    });

  const go = (s: Step) => { setErr(''); setStep(s); };
  const stepNo = path ? ORDER[path].indexOf(step) + 1 : 0;
  const total = path ? ORDER[path].length : 0;

  if (step === 'restore') {
    return <BackupScreen restoreOnly settings={defaultSettings} onSettings={() => {}} onBack={() => go('role')} onRestored={() => { setPath('start'); go('codes'); }} />;
  }

  const back = (): (() => void) | undefined => {
    if (step === 'role') return onExit;
    if (step === 'server' || step === 'scanPartner') return () => { setPath(null); go('role'); };
    if (step === 'showFirst') return () => go('server');
    if (step === 'scanReply') return () => go('showFirst');
    if (step === 'showSecond') return () => go('scanPartner');
    return undefined;
  };
  const onBack = back();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 22, paddingTop: ins.top + 14, paddingBottom: ins.bottom + 30, gap: 18 }} keyboardShouldPersistTaps="handled">
        {/* top bar: back, and where you are */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 40 }}>
          {onBack ? (
            <ClayPress onPress={onBack} radius={20} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }} label="Back">
              <Icon name={step === 'role' ? 'x' : 'back'} size={20} />
            </ClayPress>
          ) : null}
          {path && step !== 'done' ? <Stepper total={total} current={stepNo} /> : <View style={{ flex: 1 }} />}
          {path && step !== 'done' ? <Label>{stepNo} of {total}</Label> : null}
        </View>

        <Animated.View key={step} entering={FadeIn.duration(200)} exiting={FadeOut.duration(100)} style={{ gap: 18 }}>
          {step === 'role' && (
            <>
              <View style={{ marginTop: 6 }}><Title lines={['Our', 'Private', 'Space']} accentLine={1} size={76} /></View>
              <Enter delay={300}><Body dim>Two phones, one private space. One of you starts, the other joins by scanning.</Body></Enter>
              <View style={{ gap: 14, marginTop: 4 }}>
                {([
                  ['plus', 'I am starting', 'Create the space and show a code to your partner', () => { setPath('start'); go('server'); }],
                  ['camera', 'My partner already started', 'Scan their code to join', () => { setPath('join'); go('scanPartner'); }],
                  ['download', 'Restore from a backup', 'Bring back an earlier chat from a file', () => go('restore')],
                ] as [IconName, string, string, () => void][]).map(([icon, title, sub, fn], i) => (
                  <Enter key={title} delay={380 + i * 80}>
                    <ClayPress onPress={fn} radius={26} color={i === 0 ? t.accent : undefined} style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }} label={title}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: i === 0 ? t.onAccent + '22' : t.accent + '33' }}>
                        <Icon name={icon} size={22} color={i === 0 ? t.onAccent : t.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: i === 0 ? t.onAccent : t.text, fontFamily: fonts.bold, fontSize: 17 }}>{title}</Text>
                        <Text style={{ color: i === 0 ? t.onAccent : t.textDim, opacity: i === 0 ? 0.8 : 1, fontFamily: fonts.body, fontSize: 13, marginTop: 2 }}>{sub}</Text>
                      </View>
                    </ClayPress>
                  </Enter>
                ))}
              </View>
              <Enter delay={700}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 6 }}>
                  <Icon name="lock" size={16} color={t.textDim} />
                  <Text style={{ flex: 1, color: t.textDim, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 }}>Everything is encrypted on your phones. The server only passes sealed messages.</Text>
                </View>
              </Enter>
            </>
          )}

          {step === 'server' && (
            <>
              <Title lines={['Your', 'server']} />
              <Body dim>Scan the setup code your server showed, or choose a picture of it. You can also type it.</Body>
              <ScanQr onText={(txt) => { const p = parseQr(txt); if (p.kind === 'server') void first(p.url, p.token); else setErr('That is not a server setup code.'); }} />
              <Label>Or type it</Label>
              <Clay radius={18} style={{ paddingHorizontal: 16 }}>
                <TextInput value={url} onChangeText={setUrl} placeholder="Server address" placeholderTextColor={t.textDim} autoCapitalize="none" autoCorrect={false}
                  style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
              </Clay>
              <Clay radius={18} style={{ paddingHorizontal: 16 }}>
                <TextInput value={token} onChangeText={setToken} placeholder="Setup code" placeholderTextColor={t.textDim} autoCapitalize="none" autoCorrect={false}
                  style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
              </Clay>
              <Button title="Continue" disabled={!url.trim() || !token.trim() || busy} onPress={() => void first(url, token.trim())} />
            </>
          )}

          {step === 'showFirst' && (
            <>
              <Title lines={['Show', 'your partner']} />
              <Body dim>On the other phone, choose "My partner already started" and scan this.</Body>
              <ShowQr value={qr} />
              <Button title="They scanned it" onPress={() => go('scanReply')} />
            </>
          )}

          {step === 'scanReply' && (
            <>
              <Title lines={['Scan', 'theirs']} />
              <ScanQr hint="Their phone now shows a code. Scan it here, together." onText={(txt) => void guard(async () => {
                const p = parseQr(txt);
                if (p.kind !== 'reply') return setErr('That is not the reply code.');
                await finishAsFirst(p.signPk);
                go('codes');
              })} />
            </>
          )}

          {step === 'scanPartner' && (
            <>
              <Title lines={['Scan the', 'code']} />
              <ScanQr hint="Scan the code shown on your partner's phone, or choose a picture of it." onText={(txt) => void guard(async () => {
                const p = parseQr(txt);
                if (p.kind !== 'partner') return setErr('That is not a pairing code.');
                const r = await joinAsSecond(p);
                if (!r.ok) return setErr(r.error);
                setQr(JSON.stringify(r.qr));
                go('showSecond');
              })} />
            </>
          )}

          {step === 'showSecond' && (
            <>
              <Title lines={['Show', 'them back']} />
              <Body dim>Your partner scans this on their phone to finish. Then press Next.</Body>
              <ShowQr value={qr} />
              <Button title="Next" onPress={() => go('codes')} />
            </>
          )}

          {step === 'codes' && <Codes onDone={() => { void Vault.clearWiped(); go('done'); }} />}

          {step === 'done' && <Done onOpen={onDone} />}
        </Animated.View>

        {busy && <ActivityIndicator color={t.accent} />}
        {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium }}>{err}</Text> : null}
      </ScrollView>
    </View>
  );
}

/** The last screen: a check mark settles, then one clear action. */
function Done({ onOpen }: { onOpen: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 18, marginTop: 20 }}>
      <Enter>
        <Clay radius={50} color={t.accent} style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={48} color={t.onAccent} stroke={3} />
        </Clay>
      </Enter>
      <Title lines={['All', 'set']} accentLine={1} size={76} />
      <Enter delay={260}><Body dim>You are paired and your codes are saved. The app will now look like an ordinary one. Type your code there to open the chat.</Body></Enter>
      <Enter delay={340}><Button title="Open the app" onPress={onOpen} /></Enter>
    </View>
  );
}

/** Choose the secret codes. Used in setup and again from Settings. */
export function Codes({ onDone, change }: { onDone: () => void; change?: boolean }) {
  const t = useTheme();
  const [calc, setCalc] = useState('');
  const [notes, setNotes] = useState('');
  const [decoy, setDecoy] = useState('');
  const [panic, setPanic] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr('');
    if (!/^[0-9]{6,12}$/.test(calc)) return setErr('The calculator code needs 6 to 12 digits.');
    if (!/^[A-Za-z0-9]{6,32}$/.test(notes) || !/[0-9]/.test(notes) || !/[A-Za-z]/.test(notes)) return setErr('The notes code needs 6 or more letters and digits, with at least one of each.');
    if (!/^[0-9]{4,12}$/.test(decoy)) return setErr('The decoy code needs 4 to 12 digits.');
    if (panic && !/^[0-9]{4,12}$/.test(panic)) return setErr('The wipe code needs 4 to 12 digits, or leave it empty.');
    const all = [calc, notes, decoy, panic].filter(Boolean);
    if (new Set(all).size !== all.length) return setErr('Every code must be different.');
    setBusy(true);
    try {
      // let the screen show "Saving…" before the (slow) hashing starts
      await new Promise((r) => setTimeout(r, 50));
      const c = await getCrypto();
      await Vault.saveCodes({
        calc: c.hashPasscode(calc), notes: c.hashPasscode(notes), decoy: c.hashPasscode(decoy), panic: panic ? c.hashPasscode(panic) : undefined,
      });
      onDone();
    } catch (e) {
      setErr('Something went wrong: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  const field = (icon: IconName, label: string, how: string, v: string, set: (s: string) => void, ph: string, numeric: boolean, delay: number) => (
    <Enter delay={delay}>
      <Clay radius={24} style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.accent + '33', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={16} color={t.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontFamily: fonts.bold, fontSize: 15 }}>{label}</Text>
            <Text style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 12 }}>{how}</Text>
          </View>
        </View>
        <TextInput value={v} onChangeText={set} placeholder={ph} placeholderTextColor={t.textDim} keyboardType={numeric ? 'number-pad' : 'default'}
          secureTextEntry={!show} autoCapitalize="none" autoCorrect={false}
          style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: t.bg, color: t.text, fontFamily: fonts.bold, fontSize: 18, letterSpacing: 3 }} />
      </Clay>
    </Enter>
  );

  return (
    <View style={{ gap: 16 }}>
      <Title lines={change ? ['New', 'codes'] : ['Your', 'codes']} />
      <Body dim>Type a code in the ordinary-looking app to open the chat. They are never stored, only a scrambled check of them.</Body>
      {field('lock', 'Calculator code', 'Type it, then press =', calc, setCalc, '6 digits or more', true, 120)}
      {field('lock', 'Notes code', 'Type it into the search box and press search', notes, setNotes, 'e.g. 482913ab', false, 190)}
      {field('eye', 'Decoy code', 'Opens an empty, fake chat', decoy, setDecoy, 'digits', true, 260)}
      {field('trash', 'Wipe code (optional)', 'Erases this phone at once', panic, setPanic, 'digits', true, 330)}
      <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="eye" size={16} color={t.textDim} />
        <Text style={{ color: t.textDim, fontFamily: fonts.medium, fontSize: 13 }}>{show ? 'Hide the codes' : 'Show the codes while I type'}</Text>
      </Pressable>
      {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium }}>{err}</Text> : null}
      <Button title={busy ? 'Saving…' : 'Save codes'} disabled={busy} onPress={() => void save()} />
    </View>
  );
}
