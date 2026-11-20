import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clay, ClayPress } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { fonts, useTheme } from '../theme';
import { evaluate, formatNumber } from './calcEngine';

const MAIN: string[][] = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];
const SCI: string[][] = [
  ['sin', 'cos', 'tan', 'ln'],
  ['log', '√', '^', '!'],
  ['(', ')', 'π', 'e'],
  ['MC', 'MR', 'M+', 'M−'],
];

const OPS = '+−×÷^';
const FUNCS = ['sin', 'cos', 'tan', 'ln', 'log', '√'];
const isOp = (c: string) => OPS.includes(c);

interface Entry { expr: string; result: string }

export function Calculator({ tryUnlock, onSecret }: { tryUnlock: (code: string) => Promise<boolean>; onSecret?: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [expr, setExpr] = useState('');
  const [shown, setShown] = useState<string | null>(null); // the sum, after pressing =
  const [sci, setSci] = useState(false);
  const [deg, setDeg] = useState(true);
  const [mem, setMem] = useState(0);
  const [history, setHistory] = useState<Entry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const gap = sci ? 8 : 12;
  const pad = 20;
  const size = Math.floor((width - pad * 2 - gap * 3) / 4);
  const keyH = sci ? size * 0.5 : size * 0.82;
  const mainH = sci ? size * 0.58 : size * 0.82;

  const hasMath = /[+−×÷^%!()πe]|sin|cos|tan|ln|log|√/.test(expr.slice(1));
  const live = expr && hasMath ? evaluate(expr, { deg }) : null;
  const current = () => evaluate(expr, { deg });

  async function press(k: string) {
    if (k === 'C') { setExpr(''); setShown(null); return; }
    if (k === '⌫') { setExpr((e) => (FUNCS.some((f) => e.endsWith(f + '(')) ? e.slice(0, e.lastIndexOf(FUNCS.find((f) => e.endsWith(f + '('))!)) : e.slice(0, -1))); setShown(null); return; }
    if (k === '=') {
      // typing a passcode and pressing = opens the hidden app; anything else is a normal sum
      if (/^[0-9]{4,12}$/.test(expr) && (await tryUnlock(expr))) { setExpr(''); setShown(null); return; }
      const r = current();
      if (r !== null) {
        const out = formatNumber(r);
        setHistory((h) => [{ expr, result: out }, ...h].slice(0, 30));
        setShown(expr);
        setExpr(out);
      }
      return;
    }
    if (k === 'MC') { setMem(0); return; }
    if (k === 'MR') { setShown(null); setExpr((e) => e + formatNumber(mem)); return; }
    if (k === 'M+' || k === 'M−') {
      const r = current();
      if (r !== null) setMem((m) => (k === 'M+' ? m + r : m - r));
      return;
    }
    setShown(null);
    setExpr((e) => {
      const last = e[e.length - 1] ?? '';
      if (isOp(k)) {
        if (!e) return k === '−' ? '−' : '';
        if (last === '(' && k !== '−') return e;
        if (isOp(last)) return e.slice(0, -1) + k;
        return e + k;
      }
      if (k === '%' || k === '!') return e && /[0-9)πe!%]$/.test(e) ? e + k : e;
      if (k === '.') {
        const seg = e.split(/[^0-9.]/).pop() ?? '';
        return seg.includes('.') ? e : e + (seg === '' ? '0.' : '.');
      }
      if (k === ')') {
        const open = (e.match(/\(/g) ?? []).length - (e.match(/\)/g) ?? []).length;
        return open > 0 && /[0-9)πe!%]$/.test(e) ? e + k : e;
      }
      if (FUNCS.includes(k)) return e + k + '(';
      if (e.length >= 40) return e;
      return e + k;
    });
  }

  const tone = (k: string) => {
    if (k === '=') return { bg: t.accent, fg: t.onAccent };
    if ('+−×÷'.includes(k) && k.length === 1) return { bg: t.accent2, fg: t.dark ? '#1c1730' : '#FFFFFF' };
    if (['C', '⌫', '%'].includes(k) || SCI.flat().includes(k)) return { bg: t.surface, fg: t.accent };
    return { bg: t.surface, fg: t.text };
  };

  const key = (k: string, w: number, h: number, small: boolean) => {
    const c = tone(k);
    return (
      <ClayPress
        key={k}
        onPress={() => void press(k)}
        onLongPress={k === '⌫' ? () => { setExpr(''); setShown(null); } : k === '=' && onSecret ? onSecret : undefined}
        holdMs={k === '=' ? 1500 : 450}
        radius={h / 2.4}
        color={c.bg}
        depth={small ? 0.6 : 1}
        style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}
        label={k}
      >
        <Text style={{ fontFamily: fonts.medium, fontSize: small ? 17 : 28, color: c.fg }}>{k === 'MC' || k === 'MR' ? k : k}</Text>
      </ClayPress>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top, paddingBottom: ins.bottom + 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingHorizontal: pad, paddingTop: 10 }}>
        {mem !== 0 && <Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 12, marginRight: 'auto' }}>M</Text>}
        {sci && (
          <ClayPress onPress={() => setDeg((d) => !d)} radius={16} depth={0.6} style={{ paddingHorizontal: 12, height: 34, alignItems: 'center', justifyContent: 'center' }} label="Degrees or radians">
            <Text style={{ color: t.text, fontFamily: fonts.bold, fontSize: 12 }}>{deg ? 'DEG' : 'RAD'}</Text>
          </ClayPress>
        )}
        <ClayPress onPress={() => setSci((s) => !s)} radius={16} depth={0.6} color={sci ? t.accent : undefined} style={{ paddingHorizontal: 12, height: 34, alignItems: 'center', justifyContent: 'center' }} label="Scientific keys">
          <Text style={{ color: sci ? t.onAccent : t.text, fontFamily: fonts.bold, fontSize: 12 }}>SCI</Text>
        </ClayPress>
        <ClayPress onPress={() => setShowHistory(true)} radius={17} depth={0.6} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }} label="History">
          <Icon name="timer" size={16} />
        </ClayPress>
      </View>

      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: pad, paddingBottom: 14 }}>
        <Text numberOfLines={1} style={{ color: t.textDim, fontFamily: fonts.medium, fontSize: 20, textAlign: 'right', minHeight: 26 }}>
          {shown ? shown + ' =' : live !== null ? '= ' + formatNumber(live) : ' '}
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: t.text, fontFamily: fonts.display, fontSize: sci ? 56 : 76, textAlign: 'right', lineHeight: sci ? 68 : 92 }}>
          {expr || '0'}
        </Text>
      </View>

      <View style={{ paddingHorizontal: pad, gap }}>
        {sci && SCI.map((row, ri) => (
          <View key={'s' + ri} style={{ flexDirection: 'row', gap }}>{row.map((k) => key(k, size, keyH, true))}</View>
        ))}
        {MAIN.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap }}>
            {row.map((k) => key(k, k === '0' ? size * 2 + gap : size, mainH, false))}
          </View>
        ))}
      </View>

      <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)} statusBarTranslucent>
        <Pressable onPress={() => setShowHistory(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <Pressable>
            <Clay radius={30} style={{ margin: 12, marginBottom: ins.bottom + 12, padding: 18, maxHeight: 420 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ color: t.text, fontFamily: fonts.display, fontSize: 28, textTransform: 'uppercase' }}>History</Text>
                {history.length > 0 && <Pressable onPress={() => setHistory([])} hitSlop={10}><Text style={{ color: t.accent, fontFamily: fonts.bold }}>Clear</Text></Pressable>}
              </View>
              <ScrollView>
                {history.length === 0 ? (
                  <Text style={{ color: t.textDim, fontFamily: fonts.body, paddingVertical: 20, textAlign: 'center' }}>Your sums will show up here.</Text>
                ) : history.map((h, i) => (
                  <Pressable key={i} onPress={() => { setExpr(h.result); setShown(null); setShowHistory(false); }} style={{ paddingVertical: 10 }}>
                    <Text numberOfLines={1} style={{ color: t.textDim, fontFamily: fonts.body, fontSize: 14, textAlign: 'right' }}>{h.expr}</Text>
                    <Text numberOfLines={1} style={{ color: t.text, fontFamily: fonts.bold, fontSize: 22, textAlign: 'right' }}>= {h.result}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Clay>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
