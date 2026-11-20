// Browser preview of the real screens with sample data, so the design can be checked in a real browser.
// Open with ?screen=chat|settings|themes|calc|notes|setup|starred&theme=nocturne&accent=%23F7C948
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { ThemeProvider, useTheme } from '../src/theme';
import { defaultSettings } from '../src/core/storage';
import { session } from '../src/core/session';
import type { Msg } from '../src/core/db';
import { Calculator } from '../src/disguise/Calculator';
import { Notes } from '../src/disguise/Notes';
import { Chat } from '../src/screens/Chat';
import { SettingsScreen } from '../src/screens/Settings';
import { ThemeGallery } from '../src/screens/ThemeGallery';
import { Setup } from '../src/screens/Setup';
import { StarredScreen } from '../src/screens/Starred';
import { SharedNotesScreen } from '../src/screens/SharedNotes';
import { SAMPLE_THUMB } from './sampleThumb';
import { ImportWhatsApp } from '../src/screens/ImportWhatsApp';
import { BackupScreen } from '../src/screens/Backup';

const now = Date.now();
const m = (o: Partial<Msg> & { id: string; mine: boolean; ago: number }): Msg => ({
  ts: now - o.ago * 60_000, kind: 'text', text: '', replyTo: null, state: 3, edited: false, deleted: false, rMine: null, rTheirs: null,
  once: false, viewed: false, seen: true, pinned: false, exp: 0, thumb: '', w: 0, h: 0, imgKey: '', starred: false, ...o,
});
const SAMPLE: Msg[] = [
  m({ id: '1', mine: false, ago: 60 * 26, text: 'Did you remember the tickets?' }),
  m({ id: '2', mine: true, ago: 60 * 26 - 2, text: 'Yes! Saved them in our notes.' }),
  m({ id: '3', mine: false, ago: 95, text: 'Good morning ☀️' }),
  m({ id: '4', mine: false, ago: 94, text: 'Slept so well. You?' }),
  m({ id: '5', mine: true, ago: 90, text: 'Like a rock. Coffee later?', rTheirs: '❤️', pinned: true }),
  m({ id: '6', mine: false, ago: 40, kind: 'img', thumb: SAMPLE_THUMB, w: 240, h: 160, text: 'Look at this view' }),
  m({ id: '7', mine: true, ago: 38, text: 'Wow. Take me there', replyTo: '6', state: 2 }),
  m({ id: '8', mine: false, ago: 20, kind: 'aud', w: 23 }),
  m({ id: '9', mine: true, ago: 5, text: 'On my way', state: 1, starred: true }),
  m({ id: '10', mine: true, ago: 1, text: 'Almost there…', state: 0 }),
];

function Inner() {
  const q = useMemo(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''), []);
  const t = useTheme();
  const screen = q.get('screen') ?? 'chat';
  React.useEffect(() => {
    session.seedForPreview({ messages: SAMPLE, pending: 1, peerTyping: q.get('typing') === '1', notes: [{ id: 'n1', title: 'Shopping', body: 'Milk, bread, flowers', ts: now }, { id: 'n2', title: 'Trip ideas', body: 'Hampi, Gokarna, Coorg', ts: now - 86400000 }] });
  }, [q]);
  const noop = () => {};
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {screen === 'chat' && <Chat nickname="Asha" ttlSeconds={q.get('ttl') ? 86400 : 0} onSettings={noop} onNotes={noop} onStarred={noop} onImport={noop} />}
      {screen === 'settings' && <SettingsScreen settings={{ ...defaultSettings, theme: q.get('theme') ?? 'auto' }} onChange={noop} onBack={noop} onLock={noop} onPanic={noop} />}
      {screen === 'themes' && <ThemeGallery theme={q.get('theme') ?? 'auto'} accent={q.get('accent') ?? ''} onTheme={noop} onAccent={noop} onBack={noop} />}
      {screen === 'calc' && <Calculator tryUnlock={async () => false} initialSci={q.get('sci') === '1'} initialExpr={q.get('expr') ?? ''} />}
      {screen === 'notes' && <Notes tryUnlock={async () => false} titleUnlock={false} />}
      {screen === 'setup' && <Setup onDone={noop} />}
      {screen === 'setupcodes' && <Setup onDone={noop} initialStep="codes" />}
      {screen === 'import' && <ImportWhatsApp onBack={noop} />}
      {screen === 'backup' && <BackupScreen settings={defaultSettings} onSettings={noop} onBack={noop} nickname="Asha" />}
      {screen === 'starred' && <StarredScreen nickname="Asha" onBack={noop} />}
      {screen === 'sharednotes' && <SharedNotesScreen onBack={noop} />}
    </View>
  );
}

export default function Preview() {
  const [ready] = useFonts({ Anton_400Regular, Inter_400Regular, Inter_500Medium, Inter_700Bold });
  const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 28, left: 0, right: 0, bottom: 16 } }}>
        <ThemeProvider choice={q.get('theme') ?? 'auto'} accent={q.get('accent') ?? ''}>
          <Inner />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
