import React, { useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Body, Button, Clay } from '../ui/Clay';
import { whileSystemUi } from '../core/lockGuard';
import { fonts, useTheme } from '../theme';

/** Scan a QR code with the camera, or pick a picture of one from the gallery. */
export function ScanQr({ onText, onCancel, hint }: { onText: (text: string) => void; onCancel?: () => void; hint?: string }) {
  const t = useTheme();
  const [perm, askPerm] = useCameraPermissions();
  const [err, setErr] = useState('');
  const done = useRef(false);

  const give = (text: string) => {
    if (done.current) return;
    done.current = true;
    onText(text);
    setTimeout(() => (done.current = false), 1500); // allow another try if the caller rejects it
  };

  async function fromGallery() {
    setErr('');
    const r = await whileSystemUi(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 }));
    if (r.canceled || !r.assets[0]) return;
    try {
      const found = await scanFromURLAsync(r.assets[0].uri, ['qr']);
      if (found.length && found[0].data) give(found[0].data);
      else setErr('No code found in that picture. Try a clearer screenshot.');
    } catch {
      setErr('Could not read that picture.');
    }
  }

  return (
    <View style={{ flex: 1, gap: 16 }}>
      {hint ? <Body dim>{hint}</Body> : null}
      <Clay radius={28} style={{ height: 320, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {perm?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(r) => r.data && give(r.data)}
          />
        ) : (
          <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
            <Body style={{ textAlign: 'center' }} dim>The camera is needed to scan the code.</Body>
            <Button title="Allow camera" onPress={() => void whileSystemUi(() => askPerm())} />
          </View>
        )}
        {perm?.granted && (
          <View pointerEvents="none" style={{ width: 200, height: 200, borderRadius: 28, borderWidth: 3, borderColor: t.accent }} />
        )}
      </Clay>
      <Button title="Choose picture from gallery" kind="plain" onPress={() => void fromGallery()} />
      {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium }}>{err}</Text> : null}
      {onCancel ? <Button title="Back" kind="plain" onPress={onCancel} /> : null}
    </View>
  );
}
