// Claymorphism building blocks: soft, puffy surfaces with a light edge on one side and a soft shadow on the other.
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle, AccessibilityInfo } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { fonts, useTheme } from '../theme';

export function clayShadow(t: ReturnType<typeof useTheme>, depth = 1): ViewStyle {
  const d = 6 * depth;
  return {
    boxShadow: [
      { offsetX: d, offsetY: d * 1.3, blurRadius: d * 2.4, color: t.dark ? 'rgba(0,0,0,0.55)' : t.surfaceLo + 'AA' },
      { offsetX: -d * 0.8, offsetY: -d * 0.8, blurRadius: d * 1.8, color: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)' },
      { offsetX: -2, offsetY: -2, blurRadius: 5, color: t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)', inset: true },
      { offsetX: 3, offsetY: 4, blurRadius: 8, color: t.dark ? 'rgba(0,0,0,0.35)' : t.surfaceLo + '66', inset: true },
    ],
  };
}

export function Clay({
  children, style, radius = 24, color, depth = 1,
}: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; color?: string; depth?: number }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: color ?? t.surface, borderRadius: radius }, clayShadow(t, depth), style]}>{children}</View>;
}

/** A pressable clay surface that squishes when touched. */
export function ClayPress({
  children, onPress, onLongPress, style, radius = 24, color, disabled, depth = 1, haptic = true, label,
}: {
  children?: React.ReactNode; onPress?: () => void; onLongPress?: () => void; style?: StyleProp<ViewStyle>;
  radius?: number; color?: string; disabled?: boolean; depth?: number; haptic?: boolean; label?: string;
}) {
  const t = useTheme();
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  // Size and position belong to the outer touch area; looks belong to the inner puffy surface.
  const { outer, inner } = splitLayout(style);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      style={outer}
      onPressIn={() => (s.value = withTiming(0.96, { duration: 90 }))}
      onPressOut={() => (s.value = withSpring(1, { damping: 14, stiffness: 260 }))}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      onLongPress={onLongPress}
    >
      <Animated.View
        style={[
          { backgroundColor: color ?? t.surface, borderRadius: radius, opacity: disabled ? 0.5 : 1, flexGrow: 1 },
          clayShadow(t, depth),
          inner,
          a,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

const LAYOUT_KEYS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'margin', 'marginHorizontal', 'marginVertical', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'alignSelf', 'position', 'top', 'left', 'right', 'bottom', 'zIndex',
]);
function splitLayout(style?: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) (LAYOUT_KEYS.has(k) ? outer : inner)[k] = flat[k];
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

export function Button({
  title, onPress, kind = 'primary', disabled, style,
}: { title: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger'; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'danger' ? t.danger : t.surface;
  const fg = kind === 'primary' ? t.onAccent : kind === 'danger' ? '#FFFFFF' : t.text;
  return (
    <ClayPress onPress={onPress} disabled={disabled} color={bg} radius={22} style={[{ paddingVertical: 15, paddingHorizontal: 22, alignItems: 'center' }, style]} label={title}>
      <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: 16, letterSpacing: 0.2 }}>{title}</Text>
    </ClayPress>
  );
}

export function H1({ children, style, color }: { children: React.ReactNode; style?: StyleProp<TextStyle>; color?: string }) {
  const t = useTheme();
  return <Text style={[{ fontFamily: fonts.display, fontSize: 44, lineHeight: 48, color: color ?? t.text, textTransform: 'uppercase' }, style]}>{children}</Text>;
}

export function Body({ children, style, dim, bold }: { children: React.ReactNode; style?: StyleProp<TextStyle>; dim?: boolean; bold?: boolean }) {
  const t = useTheme();
  return <Text style={[{ fontFamily: bold ? fonts.bold : fonts.body, fontSize: 15, lineHeight: 21, color: dim ? t.textDim : t.text }, style]}>{children}</Text>;
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.6, color: t.textDim, textTransform: 'uppercase' }, style]}>{children}</Text>;
}

export function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  const x = useSharedValue(value ? 1 : 0);
  React.useEffect(() => {
    x.value = withSpring(value ? 1 : 0, { damping: 16, stiffness: 240 });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 22 }] }));
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} hitSlop={8}>
      <View style={[{ width: 56, height: 34, borderRadius: 17, backgroundColor: value ? t.accent : t.surfaceLo + (t.dark ? '' : '88'), padding: 4 }, clayShadow(t, 0.4)]}>
        <Animated.View style={[{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.surfaceHi }, knob]} />
      </View>
    </Pressable>
  );
}

export const reduceMotionHint = () => AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
