import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Clay } from '../ui/Clay';

/** A QR code on a white tile so any camera can read it, in any theme. */
export function ShowQr({ value }: { value: string }) {
  return (
    <Clay radius={28} color="#FFFFFF" style={{ alignSelf: 'center', padding: 18 }}>
      <View>
        <QRCode value={value} size={232} backgroundColor="#FFFFFF" color="#111111" ecl="M" />
      </View>
    </Clay>
  );
}
