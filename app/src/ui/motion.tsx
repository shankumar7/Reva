// One easing curve and one entrance for the whole app: things arrive once, in order, without bounce.
import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

export const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
export const ENTER = Easing.bezier(0.22, 1, 0.36, 1);

/** Fades and rises 14px into place, once, after `delay` ms. Reads fine with no motion at all. */
export function Enter({ delay = 0, children, style }: { delay?: number; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 520, easing: ENTER, reduceMotion: ReduceMotion.System }));
  }, [delay, v]);
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 14 }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}
