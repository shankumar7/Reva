// The call screens are dressed up as a clock app, so a glance at your phone never shows "a call":
//   someone is calling  -> a ringing alarm.  Snooze = answer, Off = decline.
//   you are calling / in a call -> a timer.   Stop = hang up.
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Clay, ClayPress } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { fonts, useTheme } from '../theme';
import { session } from '../core/session';
import { Disguise } from '../../modules/disguise';

export function useCallState() {
  return useSyncExternalStore(session.call.subscribe, () => session.call.state);
}

function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return now;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CallScreen() {
  const call = useCallState();
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const now = useClock();
  const ringing = call.phase === 'ringing';

  // where the sound is going: Bluetooth, headset, speaker or earpiece
  const [route, setRoute] = useState('');
  useEffect(() => {
    if (call.phase === 'idle' || call.phase === 'ringing') return setRoute('');
    const read = () => setRoute(Disguise.callRoute());
    read();
    const i = setInterval(read, 1500);
    return () => clearInterval(i);
  }, [call.phase]);

  // buzz like an alarm while it rings
  useEffect(() => {
    if (!ringing) return;
    Vibration.vibrate([0, 700, 500], true);
    return () => Vibration.cancel();
  }, [ringing]);

  // the bell shakes, and a soft ring swells out of it
  const shake = useSharedValue(0);
  const wave = useSharedValue(0);
  useEffect(() => {
    if (ringing) {
      shake.value = withRepeat(withSequence(withTiming(1, { duration: 130 }), withTiming(-1, { duration: 260 }), withTiming(0, { duration: 130 }), withTiming(0, { duration: 700 })), -1);
      wave.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1);
    } else {
      shake.value = 0;
      wave.value = 0;
    }
  }, [ringing, shake, wave]);
  const bellStyle = useAnimatedStyle(() => ({ transform: [{ rotate: shake.value * 16 + 'deg' }] }));
  const waveStyle = useAnimatedStyle(() => ({ opacity: ringing ? 0.5 * (1 - wave.value) : 0, transform: [{ scale: 1 + wave.value * 0.7 }] }));

  if (call.phase === 'idle') return null;

  const clock = new Date(now);
  const hhmm = `${clock.getHours() % 12 || 12}:${String(clock.getMinutes()).padStart(2, '0')}`;
  const ampm = clock.getHours() < 12 ? 'AM' : 'PM';
  const secs = call.startedAt ? Math.max(0, Math.floor((now - call.startedAt) / 1000)) : 0;
  const timer = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const sweep = (secs % 60) / 60;
  const R = 112, C = 2 * Math.PI * R;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.bg, paddingTop: ins.top + 28, paddingBottom: ins.bottom + 28, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'space-between' }}>
      {/* the round puffy badge at the top */}
      <View style={{ alignItems: 'center', gap: 14 }}>
        <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: t.accent }, waveStyle]} />
          <Clay radius={48} depth={1.3} color={t.accent} style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={bellStyle}>
              <Icon name={ringing ? 'bell' : 'timer'} size={42} color={t.onAccent} stroke={2.2} />
            </Animated.View>
          </Clay>
        </View>
        <Text style={{ color: t.textDim, fontFamily: fonts.bold, fontSize: 14, letterSpacing: 2.4, textTransform: 'uppercase' }}>{ringing ? 'Alarm' : 'Timer'}</Text>
      </View>

      {/* the big raised card */}
      {ringing ? (
        <Clay radius={48} depth={1.4} style={{ width: '100%', paddingVertical: 34, paddingHorizontal: 18, alignItems: 'center', gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Text style={{ color: t.text, fontFamily: fonts.display, fontSize: 104, lineHeight: 112 }}>{hhmm}</Text>
            <Text style={{ color: t.textDim, fontFamily: fonts.bold, fontSize: 22, marginBottom: 18, marginLeft: 6 }}>{ampm}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DAYS.map((d, i) => {
              const today = i === clock.getDay();
              return (
                <Clay key={i} radius={17} depth={today ? 0.7 : 0.35} color={today ? t.accent : t.bg} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: today ? t.onAccent : t.textDim, fontFamily: fonts.bold, fontSize: 13 }}>{d}</Text>
                </Clay>
              );
            })}
          </View>
          <Text style={{ color: t.accent, fontFamily: fonts.bold, fontSize: 18 }}>Alarm</Text>
        </Clay>
      ) : (
        <Clay radius={140} depth={1.4} style={{ width: 280, height: 280, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={280} height={280} style={{ position: 'absolute' }}>
            <Circle cx={140} cy={140} r={R} stroke={t.surfaceLo} strokeWidth={10} fill="none" opacity={0.6} />
            <Circle cx={140} cy={140} r={R} stroke={t.accent} strokeWidth={10} fill="none" strokeLinecap="round"
              strokeDasharray={`${C * (call.phase === 'live' ? Math.max(sweep, 0.02) : 0.02)} ${C}`} transform="rotate(-90 140 140)" />
          </Svg>
          <Text style={{ color: t.text, fontFamily: fonts.display, fontSize: 70, lineHeight: 80 }}>{timer}</Text>
          <Text style={{ color: t.textDim, fontFamily: fonts.medium, fontSize: 15, marginTop: 2 }}>
            {call.phase === 'live' ? 'Running' : call.phase === 'connecting' ? 'Starting…' : 'Waiting…'}{route === 'bluetooth' ? ' · Bluetooth' : route === 'headset' ? ' · Headset' : ''}
          </Text>
        </Clay>
      )}

      {/* squishy buttons */}
      {ringing ? (
        <View style={{ flexDirection: 'row', gap: 18, width: '100%' }}>
          <ClayPress onPress={() => session.call.decline()} radius={38} depth={1.3} style={{ flex: 1, height: 76, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }} label="Off">
            <Icon name="x" size={22} color={t.danger} stroke={2.4} />
            <Text style={{ color: t.danger, fontFamily: fonts.bold, fontSize: 21 }}>Off</Text>
          </ClayPress>
          <ClayPress onPress={() => void session.call.accept()} radius={38} depth={1.3} color={t.accent} style={{ flex: 1.2, height: 76, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }} label="Snooze">
            <Icon name="timer" size={22} color={t.onAccent} stroke={2.4} />
            <Text style={{ color: t.onAccent, fontFamily: fonts.bold, fontSize: 21 }}>Snooze</Text>
          </ClayPress>
        </View>
      ) : (
        <View style={{ width: '100%', gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <ClayPress onPress={() => session.call.toggleMute()} radius={32} depth={1.1} color={call.muted ? t.accent : undefined} style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }} label="Mute">
              <Icon name="mic" size={20} color={call.muted ? t.onAccent : t.text} />
              <Text style={{ color: call.muted ? t.onAccent : t.text, fontFamily: fonts.bold, fontSize: 16 }}>{call.muted ? 'Muted' : 'Mute'}</Text>
            </ClayPress>
            <ClayPress onPress={() => session.call.toggleSpeaker()} radius={32} depth={1.1} color={call.speaker ? t.accent : undefined} style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }} label="Speaker">
              <Icon name="speaker" size={20} color={call.speaker ? t.onAccent : t.text} />
              <Text style={{ color: call.speaker ? t.onAccent : t.text, fontFamily: fonts.bold, fontSize: 16 }}>Speaker</Text>
            </ClayPress>
          </View>
          <ClayPress onPress={() => session.call.hangup()} radius={38} depth={1.3} color={t.danger} style={{ height: 76, alignItems: 'center', justifyContent: 'center' }} label="Stop">
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 21 }}>Stop</Text>
          </ClayPress>
        </View>
      )}
    </View>
  );
}
