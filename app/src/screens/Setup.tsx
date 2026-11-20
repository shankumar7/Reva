import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Body, Button, Clay, H1, Label } from '../ui/Clay';
import { fonts, useTheme } from '../theme';
import { ScanQr } from './ScanQr';
import { ShowQr } from './ShowQr';
import { finishAsFirst, joinAsSecond, parseQr, startAsFirst } from '../core/pairing';
import { getCrypto } from '../core/sodium';
import { Vault, defaultSettings } from '../core/storage';
import { BackupScreen } from './Backup';

type Step = 'role' | 'server' | 'showFirst' | 'scanReply' | 'scanPartner' | 'showSecond' | 'codes' | 'restore';

export function Setup({ onDone, startError, initialStep }: { onDone: () => void; startError?: string; initialStep?: 'codes' }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(initialStep ?? 'role');
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
      setStep('showFirst');
    });

  if (step === 'restore') {
    return <BackupScreen restoreOnly settings={defaultSettings} onSettings={() => {}} onBack={() => setStep('role')} onRestored={() => setStep('codes')} />;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 22, paddingTop: ins.top + 24, paddingBottom: ins.bottom + 30, gap: 18 }} keyboardShouldPersistTaps="handled">
      <Animated.View key={step} entering={FadeIn.duration(240)} exiting={FadeOut.duration(120)} style={{ gap: 18 }}>
        {step === 'role' && (
          <>
            <H1>Set up</H1>
            <Body dim>Two phones, one private space. One of you starts, the other joins by scanning.</Body>
            <Button title="I am starting" onPress={() => setStep('server')} />
            <Button title="My partner already started" kind="plain" onPress={() => setStep('scanPartner')} />
            <Button title="Restore from a backup" kind="plain" onPress={() => setStep('restore')} />
          </>
        )}

        {step === 'server' && (
          <>
            <H1>Your server</H1>
            <Body dim>Scan the setup code your server printed, or choose a picture of it. You can also type it.</Body>
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
            <Button title="Back" kind="plain" onPress={() => setStep('role')} />
          </>
        )}

        {step === 'showFirst' && (
          <>
            <H1>Show your partner</H1>
            <Body dim>On the other phone, choose "My partner already started" and scan this.</Body>
            <ShowQr value={qr} />
            <Button title="They scanned it" onPress={() => { setErr(''); setStep('scanReply'); }} />
          </>
        )}

        {step === 'scanReply' && (
          <>
            <H1>Scan theirs</H1>
            <ScanQr hint="Their phone now shows a code. Scan it here, together." onText={(txt) => void guard(async () => {
              const p = parseQr(txt);
              if (p.kind !== 'reply') return setErr('That is not the reply code.');
              await finishAsFirst(p.signPk);
              setStep('codes');
            })} />
          </>
        )}

        {step === 'scanPartner' && (
          <>
            <H1>Scan the code</H1>
            <ScanQr hint="Scan the code shown on your partner's phone, or choose a picture of it." onText={(txt) => void guard(async () => {
              const p = parseQr(txt);
              if (p.kind !== 'partner') return setErr('That is not a pairing code.');
              const r = await joinAsSecond(p);
              if (!r.ok) return setErr(r.error);
              setQr(JSON.stringify(r.qr));
              setStep('showSecond');
            })} onCancel={() => setStep('role')} />
          </>
        )}

        {step === 'showSecond' && (
          <>
            <H1>Show them back</H1>
            <Body dim>Your partner scans this on their phone to finish. Then press Next.</Body>
            <ShowQr value={qr} />
            <Button title="Next" onPress={() => setStep('codes')} />
          </>
        )}

        {step === 'codes' && <Codes onDone={onDone} />}

        {busy && <ActivityIndicator color={t.accent} />}
        {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium }}>{err}</Text> : null}
      </Animated.View>
    </ScrollView>
  );
}

/** Choose the secret codes. Used in setup and again from Settings. */
export function Codes({ onDone, change }: { onDone: () => void; change?: boolean }) {
  const t = useTheme();
  const [calc, setCalc] = useState('');
  const [notes, setNotes] = useState('');
  const [decoy, setDecoy] = useState('');
  const [panic, setPanic] = useState('');
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

  const field = (label: string, v: string, set: (s: string) => void, ph: string, numeric: boolean) => (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <Clay radius={18} style={{ paddingHorizontal: 16 }}>
        <TextInput value={v} onChangeText={set} placeholder={ph} placeholderTextColor={t.textDim} keyboardType={numeric ? 'number-pad' : 'default'}
          autoCapitalize="none" autoCorrect={false} style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 18, letterSpacing: 2 }} />
      </Clay>
    </View>
  );

  return (
    <>
      <H1>{change ? 'New codes' : 'Your codes'}</H1>
      <Body dim>Type a code in the disguise app to open the chat. The codes are never stored, only a scrambled check of them.</Body>
      {field('Calculator code (type it, then press =)', calc, setCalc, '6 digits or more', true)}
      {field('Notes code (type it into the search box)', notes, setNotes, 'letters and digits, e.g. 482913ab', false)}
      {field('Decoy code (opens an empty fake chat)', decoy, setDecoy, 'digits', true)}
      {field('Wipe code, optional (erases this phone)', panic, setPanic, 'digits', true)}
      {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium }}>{err}</Text> : null}
      <Button title={busy ? 'Saving…' : 'Save codes'} disabled={busy} onPress={() => void save()} />
    </>
  );
}
