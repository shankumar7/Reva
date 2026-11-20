import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Clay, H1, Label } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { Backdrop } from '../ui/Backdrop';
import { Enter } from '../ui/motion';
import { fonts, useTheme } from '../theme';
import { MILESTONES, breakdown, daysTogether, milestones, nextAnniversary, parseDate } from '../core/days';

/** Days together: a big counter, the years-months-days, the next milestone and anniversary. */
export function DaysScreen({ since, nickname, onSave, onBack }: { since: string; nickname: string; onSave: (date: string) => void; onBack: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [draft, setDraft] = useState(since);
  const [err, setErr] = useState('');
  const n = daysTogether(since);
  const b = breakdown(since);
  const ms = milestones(n);
  const ann = nextAnniversary(since);
  const toNext = ms.next - n;
  const progress = n > 0 ? Math.min(1, (n - ms.prev) / Math.max(1, ms.next - ms.prev)) : 0;

  const R = 112, C = 2 * Math.PI * R;
  const save = () => {
    if (!parseDate(draft)) return setErr('Use the format YYYY-MM-DD, like 2023-02-14, and a real date.');
    setErr('');
    onSave(draft.trim());
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: ins.top + 14, paddingBottom: ins.bottom + 40, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <H1 style={{ fontSize: 46 }}>Our days</H1>
            <Label>You and {nickname}</Label>
          </View>
          <Pressable onPress={onBack} hitSlop={14}><Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 16 }}>Done</Text></Pressable>
        </View>

        {n > 0 ? (
          <>
            <Enter style={{ alignItems: 'center', marginTop: 4 }}>
              <View style={{ width: 260, height: 260, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={260} height={260} style={{ position: 'absolute' }}>
                  <Circle cx={130} cy={130} r={R} stroke={t.surfaceLo} strokeOpacity={t.dark ? 0.6 : 0.35} strokeWidth={14} fill="none" />
                  <Circle cx={130} cy={130} r={R} stroke={t.accent} strokeWidth={14} fill="none" strokeLinecap="round"
                    strokeDasharray={`${C * progress} ${C}`} rotation={-90} origin="130,130" />
                </Svg>
                <Text style={{ color: t.text, fontFamily: fonts.display, fontSize: n > 999 ? 76 : 92, lineHeight: n > 999 ? 82 : 98 }}>{n.toLocaleString()}</Text>
                <Label>days together</Label>
              </View>
            </Enter>

            <Enter delay={120} style={{ alignItems: 'center' }}>
              <Body bold style={{ textAlign: 'center' }}>
                {[b && b.years ? `${b.years} year${b.years > 1 ? 's' : ''}` : '', b && b.months ? `${b.months} month${b.months > 1 ? 's' : ''}` : '', b ? `${b.days} day${b.days === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
              </Body>
              <Body dim style={{ textAlign: 'center', marginTop: 4 }}>{toNext > 0 ? `${toNext} day${toNext === 1 ? '' : 's'} to day ${ms.next.toLocaleString()}` : 'A milestone day'}</Body>
            </Enter>

            {ann && (
              <Enter delay={200}>
                <Clay radius={26} color={ann.inDays === 0 ? t.accent : undefined} style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: (ann.inDays === 0 ? t.onAccent : t.accent) + '30' }}>
                    <Icon name="heart" size={22} color={ann.inDays === 0 ? t.onAccent : t.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: ann.inDays === 0 ? t.onAccent : t.text, fontFamily: fonts.bold, fontSize: 17 }}>
                      {ann.inDays === 0 ? `Happy anniversary! Year ${ann.year} 🎉` : `Anniversary ${ann.year} in ${ann.inDays} day${ann.inDays === 1 ? '' : 's'}`}
                    </Text>
                    <Text style={{ color: ann.inDays === 0 ? t.onAccent : t.textDim, fontFamily: fonts.body, fontSize: 13 }}>Since {since}</Text>
                  </View>
                </Clay>
              </Enter>
            )}

            <Enter delay={280}>
              <Label style={{ marginBottom: 10 }}>Milestones</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {MILESTONES.filter((m) => m <= Math.max(ms.next, 1000)).map((m) => {
                  const done = m <= n;
                  const isNext = m === ms.next;
                  return (
                    <Clay key={m} radius={18} color={done ? t.accent : undefined} depth={0.6}
                      style={{ paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: isNext ? 2 : 0, borderColor: t.accent }}>
                      {done && <Icon name="check" size={14} color={t.onAccent} stroke={3} />}
                      <Text style={{ color: done ? t.onAccent : t.text, fontFamily: fonts.bold, fontSize: 14 }}>{m.toLocaleString()}</Text>
                    </Clay>
                  );
                })}
              </View>
            </Enter>
          </>
        ) : (
          <Enter>
            <Clay radius={28} style={{ padding: 22, gap: 8 }}>
              <Text style={{ color: t.text, fontFamily: fonts.display, fontSize: 30, textTransform: 'uppercase' }}>When did it start?</Text>
              <Body dim>Set the day you two began. It is shared, so both phones count the same days.</Body>
            </Clay>
          </Enter>
        )}

        <Enter delay={n > 0 ? 340 : 120}>
          <Label style={{ marginBottom: 8 }}>{n > 0 ? 'Change the start date' : 'Start date'}</Label>
          <Clay radius={18} style={{ paddingHorizontal: 16 }}>
            <TextInput value={draft} onChangeText={(v) => setDraft(v.replace(/[^0-9-]/g, '').slice(0, 10))} placeholder="YYYY-MM-DD" placeholderTextColor={t.textDim}
              keyboardType="numbers-and-punctuation" style={{ paddingVertical: 14, color: t.text, fontFamily: fonts.bold, fontSize: 18, letterSpacing: 1 }} />
          </Clay>
          {err ? <Text style={{ color: t.danger, fontFamily: fonts.medium, marginTop: 8 }}>{err}</Text> : null}
          <View style={{ marginTop: 12 }}><Button title="Save and share with my partner" onPress={save} /></View>
        </Enter>
      </ScrollView>
    </View>
  );
}
