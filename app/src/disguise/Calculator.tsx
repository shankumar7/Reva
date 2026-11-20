import React, { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClayPress } from '../ui/Clay';
import { fonts, useTheme } from '../theme';
import { evaluate, formatNumber } from './calcEngine';

const ROWS: string[][] = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

export function Calculator({ tryUnlock }: { tryUnlock: (code: string) => Promise<boolean> }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [expr, setExpr] = useState('');
  const [shown, setShown] = useState<string | null>(null); // result after pressing =

  const gap = 12;
  const pad = 20;
  const size = Math.floor((width - pad * 2 - gap * 3) / 4);

  const live = expr && /[−+×÷%]/.test(expr.slice(1)) ? evaluate(expr) : null;

  async function press(k: string) {
    if (k === 'C') { setExpr(''); setShown(null); return; }
    if (k === '⌫') { setExpr((e) => e.slice(0, -1)); setShown(null); return; }
    if (k === '=') {
      // typing a passcode and pressing = opens the hidden app; anything else is a normal sum
      if (/^[0-9]{4,12}$/.test(expr) && (await tryUnlock(expr))) { setExpr(''); setShown(null); return; }
      const r = evaluate(expr);
      if (r !== null) { setShown(expr); setExpr(formatNumber(r)); }
      return;
    }
    setShown(null);
    setExpr((e) => {
      const isOp = '+−×÷'.includes(k);
      if (isOp) {
        if (!e) return k === '−' ? '−' : '';
        if ('+−×÷'.includes(e[e.length - 1])) return e.slice(0, -1) + k;
        return e + k;
      }
      if (k === '%') return e && /[0-9]$/.test(e) ? e + k : e;
      if (k === '.') {
        const last = e.split(/[+−×÷]/).pop() ?? '';
        return last.includes('.') ? e : e + (last === '' ? '0.' : '.');
      }
      if (e.length >= 24) return e;
      return e + k;
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top, paddingBottom: ins.bottom + 16 }}>
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: pad, paddingBottom: 18 }}>
        <Text numberOfLines={1} style={{ color: t.textDim, fontFamily: fonts.medium, fontSize: 20, textAlign: 'right', minHeight: 26 }}>
          {shown ? shown + ' =' : live !== null ? '= ' + formatNumber(live) : ' '}
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: t.text, fontFamily: fonts.display, fontSize: 76, textAlign: 'right', lineHeight: 92 }}>
          {expr || '0'}
        </Text>
      </View>
      <View style={{ paddingHorizontal: pad, gap }}>
        {ROWS.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap }}>
            {row.map((k) => {
              const isOp = '+−×÷'.includes(k);
              const isEq = k === '=';
              const isFn = k === 'C' || k === '⌫' || k === '%';
              const wide = k === '0';
              return (
                <ClayPress
                  key={k}
                  onPress={() => void press(k)}
                  radius={size / 2.6}
                  color={isEq ? t.accent : isOp ? t.accent2 : t.surface}
                  style={{ width: wide ? size * 2 + gap : size, height: size * 0.82, alignItems: 'center', justifyContent: 'center' }}
                  label={k}
                >
                  <Text style={{ fontFamily: fonts.medium, fontSize: 28, color: isEq ? t.onAccent : isOp ? (t.dark ? '#1c1730' : '#FFFFFF') : isFn ? t.accent : t.text }}>{k}</Text>
                </ClayPress>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
