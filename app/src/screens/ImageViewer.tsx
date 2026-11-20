import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/Clay';
import { Icon } from '../ui/Icon';
import { fonts, useTheme } from '../theme';
import { session } from '../core/session';
import { dataUri } from '../core/images';

/** Full-screen picture: pinch to zoom, drag when zoomed, double-tap to zoom in or out. */
export function ImageViewer({ id, once, mine, onClose }: { id: string | null; once: boolean; mine: boolean; onClose: () => void }) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState('');

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  useEffect(() => {
    scale.value = 1; savedScale.value = 1; tx.value = 0; ty.value = 0; sx.value = 0; sy.value = 0;
    setUri(null); setFailed(false); setNote('');
    if (!id) return;
    let alive = true;
    void session.imageData(id).then((b) => {
      if (!alive) return;
      if (b) setUri(dataUri(b));
      else setFailed(true);
    });
    return () => { alive = false; };
  }, [id, scale, savedScale, tx, ty, sx, sy]);

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(6, savedScale.value * e.scale));
    },
    onDeactivate: () => {
      'worklet';
      savedScale.value = scale.value;
      if (scale.value <= 1.02) { tx.value = withTiming(0); ty.value = withTiming(0); sx.value = 0; sy.value = 0; }
    },
  });
  const pan = usePanGesture({
    onUpdate: (e) => {
      'worklet';
      if (scale.value > 1) { tx.value = sx.value + e.translationX; ty.value = sy.value + e.translationY; }
    },
    onDeactivate: () => {
      'worklet';
      sx.value = tx.value; sy.value = ty.value;
    },
  });
  const dbl = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: () => {
      'worklet';
      const zoomIn = scale.value < 1.5;
      scale.value = withTiming(zoomIn ? 2.5 : 1); savedScale.value = zoomIn ? 2.5 : 1;
      if (!zoomIn) { tx.value = withTiming(0); ty.value = withTiming(0); sx.value = 0; sy.value = 0; }
    },
  });
  const gesture = useSimultaneousGestures(pan, pinch, dbl);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  function close() {
    if (once && !mine && id) void session.finishOnce(id); // a view-once picture is destroyed when closed
    onClose();
  }

  async function save() {
    if (!id) return;
    const ok = await session.saveImage(id);
    setNote(ok ? 'Saved to your gallery.' : 'Could not save. Your phone may not allow it.');
  }

  if (!id) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {uri ? (
            <GestureDetector gesture={gesture}>
              <Animated.View style={[{ width, height: height * 0.8 }, anim]}>
                <Image source={{ uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
              </Animated.View>
            </GestureDetector>
          ) : failed ? (
            <Text style={{ color: '#fff', fontFamily: fonts.medium }}>This picture is not available any more.</Text>
          ) : (
            <ActivityIndicator color={t.accent} />
          )}
        </View>
        <View style={{ position: 'absolute', top: ins.top + 10, right: 16 }}>
          <Button title="Close" kind="plain" onPress={close} style={{ paddingVertical: 10 }} />
        </View>
        <View style={{ position: 'absolute', bottom: ins.bottom + 20, left: 20, right: 20, gap: 10 }}>
          {note ? <Text style={{ color: '#fff', textAlign: 'center', fontFamily: fonts.medium }}>{note}</Text> : null}
          {once ? (
            <Text style={{ color: '#fff', opacity: 0.75, textAlign: 'center', fontFamily: fonts.body }}>
              {mine ? 'You sent this to be seen once.' : 'View once. It is deleted when you close it.'}
            </Text>
          ) : uri ? (
            <Button title="Save to gallery" onPress={() => void save()} />
          ) : null}
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', top: ins.top + 18, left: 20, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name="lock" color="#fff" size={16} />
          <Text style={{ color: '#fff', opacity: 0.7, fontFamily: fonts.medium, fontSize: 12 }}>Private. Screenshots are blocked.</Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
