import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import * as ScreenCapture from 'expo-screen-capture';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ThemeProvider, resolveTheme, useTheme } from './src/theme';
import { Vault, defaultSettings, type Codes, type Settings } from './src/core/storage';
import { getCrypto } from './src/core/sodium';
import { session } from './src/core/session';
import { wipeDb } from './src/core/db';
import disguises from './config/disguises';
import { Calculator } from './src/disguise/Calculator';
import { Notes } from './src/disguise/Notes';
import { Setup } from './src/screens/Setup';
import { Chat } from './src/screens/Chat';
import { DecoyChat } from './src/screens/DecoyChat';
import { SettingsScreen } from './src/screens/Settings';
import { SharedNotesScreen } from './src/screens/SharedNotes';
import { StarredScreen } from './src/screens/Starred';
import { ImportWhatsApp } from './src/screens/ImportWhatsApp';
import { DaysScreen } from './src/screens/DaysScreen';
import { PhotosScreen } from './src/screens/Albums';
import { CallScreen } from './src/screens/CallScreen';
import { Disguise } from './modules/disguise';
import { lockGuard } from './src/core/lockGuard';
import { handleBack } from './src/core/backStack';
import { askFingerprint } from './src/core/fingerprint';

type Mode = 'loading' | 'setup' | 'disguise' | 'chat' | 'decoy' | 'settings' | 'notes' | 'starred' | 'import' | 'days' | 'photos';

export default function App() {
  const [fontsReady] = useFonts({ Anton_400Regular, Inter_400Regular, Inter_500Medium, Inter_700Bold });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [mode, setMode] = useState<Mode>('loading');
  const [from, setFrom] = useState<'chat' | 'decoy'>('chat');
  const codes = useRef<Codes>({});
  const leftAt = useRef(0);
  const hiddenSetup = useRef(false); // setup was opened with the hidden gesture

  const [bootError, setBootError] = useState('');
  const [isReady, setIsReady] = useState(false); // paired, with codes: the app is set up
  const [setupStart, setSetupStart] = useState<'codes' | undefined>(undefined);
  const boot = useCallback(async () => {
    try {
      setBootError('');
      const [s, p, c] = await Promise.all([Vault.settings(), Vault.pairing(), Vault.codes()]);
      setSettings(s);
      codes.current = c;
      const ready = !!p?.peerSignPk && !!c.calc;
      setIsReady(ready);
      if (ready) {
        await Vault.clearWiped();
        setMode(s.cover ? 'disguise' : 'chat'); // no cover: straight into the chat
        // connecting must never block opening the app
        session.start().catch(() => {});
        return;
      }
      if (p?.peerSignPk) { // paired or restored, but no codes yet: finish that
        setSetupStart('codes');
        return setMode('setup');
      }
      // Nothing set up. A fresh install goes straight to setup. After a wipe the app must look like a plain
      // calculator, so setup is only reachable by a hidden gesture (hold the = key).
      if (await Vault.wasWiped()) return setMode('disguise');
      setSetupStart(undefined);
      setMode('setup');
    } catch (e) {
      setBootError(e instanceof Error ? e.message : String(e));
      setMode('setup');
    }
  }, []);

  useEffect(() => { void boot(); }, [boot]);

  // screenshots and screen recording are blocked, and the recents thumbnail is blank, while anything private is open
  const secret = mode === 'chat' || mode === 'decoy' || mode === 'settings' || mode === 'setup' || mode === 'notes' || mode === 'starred' || mode === 'import' || mode === 'days' || mode === 'photos';
  // Screenshots are allowed (you can share your pairing code that way). Only view-once pictures block them.
  // What stays hidden is the preview picture in Android's recent-apps list.
  useEffect(() => {
    Disguise.hideRecents(secret);
    if (!secret) return;
    // older Android versions cannot hide just the preview, so the window is shielded while the app is not in front
    const off = AppState.addEventListener('blur', () => { void ScreenCapture.preventScreenCaptureAsync('recents').catch(() => {}); });
    const on = AppState.addEventListener('focus', () => { void ScreenCapture.allowScreenCaptureAsync('recents').catch(() => {}); });
    return () => { off.remove(); on.remove(); void ScreenCapture.allowScreenCaptureAsync('recents').catch(() => {}); };
  }, [secret]);

  // lock when the app goes to the background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        session.networkChanged();
        if ((settings.cover || hiddenSetup.current) && settings.autoLockSeconds > 0 && Date.now() - leftAt.current > settings.autoLockSeconds * 1000) lock();
      } else {
        leftAt.current = Date.now();
        if ((settings.cover || hiddenSetup.current) && settings.autoLockSeconds === 0) lock();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoLockSeconds, settings.cover, mode, isReady]);
  function lock() {
    if (lockGuard.active || session.call.busy) return; // a photo picker or a call is open: not really leaving // a photo picker, camera or share sheet is open: not really leaving
    // setup opened by the hidden gesture goes back to the calculator too
    if (!isReady && hiddenSetup.current) { hiddenSetup.current = false; setMode((m) => (m === 'setup' ? 'disguise' : m)); return; }
    if (!settings.cover) return; // no cover, nothing to hide behind
    session.viewing = false;
    setMode((m) => (['chat', 'decoy', 'settings', 'notes', 'starred', 'import', 'days', 'photos'].includes(m) ? 'disguise' : m));
  }

  // a call kept the app from locking while it was out of sight: lock as soon as the call is over
  const lockRef = useRef(lock);
  lockRef.current = lock;
  useEffect(() => {
    let was = false;
    return session.call.subscribe(() => {
      const busy = session.call.busy;
      if (was && !busy && AppState.currentState !== 'active') lockRef.current();
      was = busy;
    });
  }, []);

  // the phone's back button goes back one screen instead of closing the app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (handleBack()) return true; // something inside the screen (a search, an editor, a step) closes first
      if (mode === 'settings' || mode === 'notes' || mode === 'starred' || mode === 'import' || mode === 'days' || mode === 'photos') { setMode(mode === 'settings' ? from : 'chat'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [mode, from]);

  // quick reconnect when the network changes (Wi-Fi to mobile data etc.)
  useEffect(() => {
    let first = true;
    const un = NetInfo.addEventListener(() => {
      if (first) { first = false; return; }
      session.networkChanged();
    });
    return un;
  }, []);

  // keep the real launcher entry in step with the chosen disguise
  useEffect(() => {
    if (isReady && mode !== 'loading' && mode !== 'setup' && Disguise.available) {
      const ids = disguises.map((d) => d.id);
      const want = settings.cover ? settings.disguise : 'Chat';
      if (Disguise.currentAlias(ids) !== want) Disguise.setAlias(want, ids);
    }
  }, [isReady, mode, settings.disguise, settings.cover]);

  async function tryUnlock(code: string, kind: 'calc' | 'notes'): Promise<boolean> {
    try {
      // after 5 wrong codes in a row the app stops listening for a while, so codes cannot be guessed quickly
      const tr = await Vault.tries();
      if (Date.now() < tr.until) return false;
      const ok = await tryUnlockInner(code, kind);
      if (ok) await Vault.saveTries({ n: 0, until: 0 });
      else {
        const n = tr.n + 1;
        const wait = n >= 5 ? Math.min(15 * 60_000, 30_000 * 2 ** Math.floor((n - 5) / 5)) : 0;
        await Vault.saveTries({ n, until: wait ? Date.now() + wait : 0 });
      }
      return ok;
    } catch {
      return false;
    }
  }
  async function tryUnlockInner(code: string, kind: 'calc' | 'notes'): Promise<boolean> {
    const c = await getCrypto();
    const k = codes.current;
    if (k.panic && c.verifyPasscode(k.panic, code)) { await doPanic(); return true; }
    if (k.decoy && c.verifyPasscode(k.decoy, code)) { setFrom('decoy'); setMode('decoy'); return true; }
    const main = kind === 'calc' ? k.calc : k.notes;
    if (main && c.verifyPasscode(main, code)) {
      openChat();
      return true;
    }
    return false;
  }

  function openChat() {
    session.viewing = true;
    session.start().catch(() => {}); // already running in most cases; makes sure it is
    setFrom('chat');
    setMode('chat');
  }

  /** Hold = (or the Notes title), touch the sensor: the same as typing your code. */
  async function unlockWithFingerprint() {
    if (!isReady || !settings.biometric) return;
    if (await askFingerprint()) openChat();
  }

  async function doPanic() {
    await session.panic();
    await wipeDb();
    await Vault.markWiped();
    codes.current = {};
    setIsReady(false);
    if (Disguise.available) Disguise.setAlias(defaultSettings.disguise, disguises.map((d) => d.id));
    setSettings(defaultSettings);
    setMode('disguise'); // after a wipe the app looks like a calculator again
  }

  // register for notifications the first time the chat opens (and again if the disguise kind changes)
  const kindNow = !settings.cover ? 'chat' : (disguises.find((d) => d.id === settings.disguise)?.kind === 'notes' ? 'notes' : 'calculator');
  useEffect(() => {
    if (mode === 'chat' && settings.notifications) void session.enablePush(kindNow);
  }, [mode, settings.notifications, kindNow]);

  // your partner set or changed the day you started: take it
  useEffect(() => {
    session.hooks.since = (d) => setSettings((prev) => { const n = { ...prev, since: d }; void Vault.saveSettings(n); return n; });
    return () => { session.hooks.since = undefined; };
  }, []);

  useEffect(() => {
    session.config = { ttlSeconds: settings.disappear, saveToGallery: settings.saveToGallery };
  }, [settings.disappear, settings.saveToGallery]);

  async function changeSettings(s: Settings) {
    setSettings(s);
    await Vault.saveSettings(s);
  }

  const bg = resolveTheme(settings.theme, false, settings.accent).bg;
  if (!fontsReady || mode === 'loading') return <View style={{ flex: 1, backgroundColor: bg }} />;

  const kind = disguises.find((d) => d.id === settings.disguise)?.kind === 'notes' ? 'notes' : 'calculator';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider choice={settings.theme} accent={settings.accent}>
          <Inner>
            <Animated.View key={mode} entering={FadeIn.duration(220)} style={{ flex: 1 }}>
              {mode === 'setup' && <Setup onDone={() => void boot()} startError={bootError} initialStep={setupStart} onExit={isReady ? undefined : () => setMode('disguise')} />}
              {mode === 'disguise' && (kind === 'calculator'
                ? <Calculator tryUnlock={(c) => tryUnlock(c, 'calc')} onSecret={isReady ? undefined : () => { hiddenSetup.current = true; setSetupStart(undefined); setMode('setup'); }} onBiometric={isReady && settings.biometric ? () => void unlockWithFingerprint() : undefined} />
                : <Notes tryUnlock={(c) => tryUnlock(c, 'notes')} titleUnlock={settings.notesUnlock === 'title'} onBiometric={isReady && settings.biometric ? () => void unlockWithFingerprint() : undefined} onSecret={isReady ? undefined : () => { hiddenSetup.current = true; setSetupStart(undefined); setMode('setup'); }} />)}
              {mode === 'chat' && <Chat nickname={settings.nickname} ttlSeconds={settings.disappear} since={settings.since} onSettings={() => setMode('settings')} onNotes={() => setMode('notes')} onStarred={() => setMode('starred')} onImport={() => setMode('import')} onDays={() => setMode('days')} onPhotos={() => setMode('photos')} />}
              {mode === 'days' && <DaysScreen since={settings.since} nickname={settings.nickname} onBack={() => setMode('chat')} onSave={(d) => { void changeSettings({ ...settings, since: d }); session.shareSince(d); }} />}
              {mode === 'photos' && <PhotosScreen onBack={() => setMode('chat')} />}
              {mode === 'starred' && <StarredScreen nickname={settings.nickname} onBack={() => setMode('chat')} />}
              {mode === 'import' && <ImportWhatsApp onBack={() => setMode('chat')} />}
              {mode === 'notes' && <SharedNotesScreen onBack={() => setMode('chat')} />}
              {mode === 'decoy' && <DecoyChat nickname={settings.nickname} />}
              {mode === 'settings' && (
                <SettingsScreen settings={settings} onChange={(s) => void changeSettings(s)} onBack={() => setMode(from)} onLock={lock} onPanic={() => void doPanic()}
                  onRestored={() => { session.stop(); void boot(); }}
                  onRepair={async () => { session.stop(); await Vault.clearPairing(); void boot(); }} />
              )}
            </Animated.View>
            {secret && mode !== 'decoy' && mode !== 'setup' && <CallScreen />}
          </Inner>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {children}
    </View>
  );
}
