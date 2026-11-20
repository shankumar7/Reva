import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Body, Button, Clay, H1, Label, Switch } from '../ui/Clay';
import { Backdrop } from '../ui/Backdrop';
import { fonts, useTheme } from '../theme';
import type { Settings } from '../core/storage';
import { createBackup, exportText, restoreBackup, shareBackup } from '../core/backup';

function Field({ v, set, ph }: { v: string; set: (s: string) => void; ph: string }) {
  const t = useTheme();
  return (
    <Clay radius={18} style={{ paddingHorizontal: 16 }}>
      <TextInput value={v} onChangeText={set} placeholder={ph} placeholderTextColor={t.textDim} secureTextEntry autoCapitalize="none" autoCorrect={false}
        style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.body, fontSize: 16 }} />
    </Clay>
  );
}

/** Create a backup (to save on Google Drive) or restore one. */
export function BackupScreen({ settings, onSettings, onBack, restoreOnly, onRestored, nickname }: {
  nickname?: string; settings: Settings; onSettings: (s: Settings) => void; onBack: () => void; restoreOnly?: boolean; onRestored?: () => void;
}) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [rpass, setRpass] = useState('');

  async function make() {
    setErr(''); setMsg('');
    if (pass.length < 8) return setErr('Use a passphrase of at least 8 characters.');
    if (pass !== pass2) return setErr('The two passphrases are not the same.');
    try {
      const uri = await createBackup(pass, photos, settings, setBusy);
      setBusy('');
      onSettings({ ...settings, lastBackup: Date.now() });
      const shared = await shareBackup(uri);
      setMsg(shared ? 'In the list that opened, choose Drive and a folder. Keep your passphrase safe: there is no way to recover it.' : 'Sharing is not available on this phone. The file is in the app cache.');
    } catch (e) {
      setErr('Backup failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy('');
    }
  }

  async function restore() {
    setErr(''); setMsg('');
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (r.canceled || !r.assets[0]) return;
      if (!rpass) return setErr('Type the passphrase first, then choose the file.');
      await restoreBackup(r.assets[0].uri, rpass, setBusy);
      setBusy('');
      setMsg('Restored. Now set your codes.');
      onRestored?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: ins.top + 14, paddingBottom: ins.bottom + 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <H1 style={{ fontSize: 40 }}>{restoreOnly ? 'Restore' : 'Backup'}</H1>
          <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>{restoreOnly ? 'Back' : 'Done'}</Text></Pressable>
        </View>

        {!restoreOnly && (
          <>
            <Body dim>Makes one encrypted file with your messages, notes and keys. Save it to your own Google Drive, so a lost or broken phone does not lose the chat. Free, and only you can open it.</Body>
            <Body dim>{settings.lastBackup ? 'Last backup: ' + new Date(settings.lastBackup).toLocaleString() : 'No backup yet.'}</Body>
            <Label>Passphrase for the file</Label>
            <Field v={pass} set={setPass} ph="At least 8 characters" />
            <Field v={pass2} set={setPass2} ph="Type it again" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Body style={{ flex: 1 }}>Include pictures (newest 200, makes the file bigger)</Body>
              <Switch value={photos} onChange={setPhotos} />
            </View>
            <Button title={busy || 'Create backup and save to Drive'} onPress={() => void make()} disabled={!!busy} />
          </>
        )}

        {!restoreOnly && (
          <>
            <Label style={{ marginTop: 10 }}>Export as plain text</Label>
            <Body dim>A readable copy of the chat, like WhatsApp's export. It is NOT encrypted, so anyone who gets the file can read it.</Body>
            <Button title="Export as text" kind="plain" disabled={!!busy} onPress={async () => {
              try { setErr(''); await shareBackup(await exportText(nickname ?? '')); } catch (e) { setErr('Export failed: ' + (e instanceof Error ? e.message : String(e))); }
            }} />
          </>
        )}

        <Label style={{ marginTop: 10 }}>{restoreOnly ? 'Restore from a backup file' : 'Restore (replaces everything on this phone)'}</Label>
        <Field v={rpass} set={setRpass} ph="Backup passphrase" />
        <Button title={busy && restoreOnly ? busy : 'Choose the backup file'} kind="plain" onPress={() => void restore()} disabled={!!busy} />

        {busy ? <Body dim>{busy}</Body> : null}
        {msg ? <Body>{msg}</Body> : null}
        {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium }}>{err}</Text> : null}
      </ScrollView>
    </View>
  );
}
