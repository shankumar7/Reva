import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
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
import { Disguise } from './modules/disguise';

type Mode = 'loading' | 'setup' | 'disguise' | 'chat' | 'decoy' | 'settings' | 'notes' | 'starred' | 'import';

export default function App() {
  const [fontsReady] = useFonts({ Anton_400Regular, Inter_400Regular, Inter_500Medium, Inter_700Bold });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [mode, setMode] = useState<Mode>('loading');
  const [from, setFrom] = useState<'chat' | 'decoy'>('chat');
  const codes = useRef<Codes>({});
  const leftAt = useRef(0);

  const [bootError, setBootError] = useState('');
  const [setupStart, setSetupStart] = useState<'codes' | undefined>(undefined);
  const boot = useCallback(async () => {
    try {
      setBootError('');
      const [s, p, c] = await Promise.all([Vault.settings(), Vault.pairing(), Vault.codes()]);
      setSettings(s);
      codes.current = c;
      const ready = !!p?.peerSignPk && !!c.calc;
      if (!ready) {
        setSetupStart(p?.peerSignPk ? 'codes' : undefined); // paired or restored, but no codes yet
        return setMode('setup'); // new, or a half-finished setup: continue it
      }
      setMode(s.cover ? 'disguise' : 'chat'); // no cover: straight into the chat
      // connecting must never block opening the app
      session.start().catch(() => {});
    } catch (e) {
      setBootError(e instanceof Error ? e.message : String(e));
      setMode('setup');
    }
  }, []);
  useEffect(() => { void boot(); }, [boot]);

  // screenshots and screen recording are blocked, and the recents thumbnail is blank, while anything private is open
  const secret = mode === 'chat' || mode === 'decoy' || mode === 'settings' || mode === 'setup' || mode === 'notes' || mode === 'starred' || mode === 'import';
  useEffect(() => {
    if (secret) void ScreenCapture.preventScreenCaptureAsync('private').catch(() => {});
    else void ScreenCapture.allowScreenCaptureAsync('private').catch(() => {});
  }, [secret]);

  // lock when the app goes to the background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        session.networkChanged();
        if (settings.cover && settings.autoLockSeconds > 0 && Date.now() - leftAt.current > settings.autoLockSeconds * 1000) lock();
      } else {
        leftAt.current = Date.now();
        if (settings.cover && settings.autoLockSeconds === 0) lock();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoLockSeconds, settings.cover, mode]);
  function lock() {
    if (!settings.cover) return; // no cover, nothing to hide behind
    session.viewing = false;
    setMode((m) => (['chat', 'decoy', 'settings', 'notes', 'starred', 'import'].includes(m) ? 'disguise' : m));
  }

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
    if (mode !== 'loading' && mode !== 'setup' && Disguise.available) {
      const ids = disguises.map((d) => d.id);
      const want = settings.cover ? settings.disguise : 'Chat';
      if (Disguise.currentAlias(ids) !== want) Disguise.setAlias(want, ids);
    }
  }, [mode, settings.disguise, settings.cover]);

  async function tryUnlock(code: string, kind: 'calc' | 'notes'): Promise<boolean> {
    try {
      return await tryUnlockInner(code, kind);
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
      session.viewing = true;
      setFrom('chat');
      setMode('chat');
      return true;
    }
    return false;
  }

  async function doPanic() {
    await session.panic();
    await wipeDb();
    codes.current = {};
    setSettings(defaultSettings);
    setMode('disguise'); // after a wipe the app looks like a calculator again
  }

  // register for notifications the first time the chat opens (and again if the disguise kind changes)
  const kindNow = !settings.cover ? 'chat' : (disguises.find((d) => d.id === settings.disguise)?.kind === 'notes' ? 'notes' : 'calculator');
  useEffect(() => {
    if (mode === 'chat' && settings.notifications) void session.enablePush(kindNow);
  }, [mode, settings.notifications, kindNow]);

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
              {mode === 'setup' && <Setup onDone={() => void boot()} startError={bootError} initialStep={setupStart} />}
              {mode === 'disguise' && (kind === 'calculator'
                ? <Calculator tryUnlock={(c) => tryUnlock(c, 'calc')} />
                : <Notes tryUnlock={(c) => tryUnlock(c, 'notes')} titleUnlock={settings.notesUnlock === 'title'} />)}
              {mode === 'chat' && <Chat nickname={settings.nickname} ttlSeconds={settings.disappear} onSettings={() => setMode('settings')} onNotes={() => setMode('notes')} onStarred={() => setMode('starred')} onImport={() => setMode('import')} />}
              {mode === 'starred' && <StarredScreen nickname={settings.nickname} onBack={() => setMode('chat')} />}
              {mode === 'import' && <ImportWhatsApp onBack={() => setMode('chat')} />}
              {mode === 'notes' && <SharedNotesScreen onBack={() => setMode('chat')} />}
              {mode === 'decoy' && <DecoyChat nickname={settings.nickname} />}
              {mode === 'settings' && (
                <SettingsScreen settings={settings} onChange={(s) => void changeSettings(s)} onBack={() => setMode(from)} onLock={lock} onPanic={() => void doPanic()} />
              )}
            </Animated.View>
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
