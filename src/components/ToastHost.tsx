import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onToast, type ToastMessage } from '../lib/toast';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

const VISIBLE_MS = 2600;

/** Renders the toasts sent with showToast(). Mounted once in the root layout, above every screen. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      onToast((next) => {
        if (timer.current) clearTimeout(timer.current);
        setToast(next);
        anim.setValue(0);
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 6, speed: 14 }).start();
        timer.current = setTimeout(() => {
          Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
        }, VISIBLE_MS);
      }),
    [anim],
  );

  if (!toast) return null;
  const top = toast.kind === 'success';
  const offset = anim.interpolate({ inputRange: [0, 1], outputRange: [top ? -80 : 80, 0] });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: top ? 'flex-start' : 'flex-end' }]}>
      <Animated.View
        style={[
          styles.toast,
          top ? { marginTop: insets.top + 8 } : { marginBottom: insets.bottom + 24 },
          top ? styles.pill : styles.card,
          { opacity: anim, transform: [{ translateY: offset }] },
        ]}
      >
        {top ? (
          <>
            {toast.emoji && (
              <View style={[styles.emojiBubble, toast.color ? { backgroundColor: toast.color } : null]}>
                <AppText size={16}>{toast.emoji}</AppText>
              </View>
            )}
            <AppText weight="bold" size={15} numberOfLines={1} style={styles.flexShrink}>
              {toast.title}
            </AppText>
            {toast.chip && (
              <View style={styles.chip}>
                <AppText weight="bold" size={14}>
                  {toast.chip}
                </AppText>
              </View>
            )}
          </>
        ) : (
          <>
            <Feather name="x-circle" size={22} color={colors.danger} />
            <View style={styles.flexShrink}>
              <AppText weight="bold" size={15}>
                {toast.title}
              </AppText>
              {toast.subtitle && (
                <AppText size={13} color={colors.textMuted}>
                  {toast.subtitle}
                </AppText>
              )}
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  pill: {
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: radius.pill,
    maxWidth: '86%',
  },
  card: {
    marginHorizontal: 12,
    alignSelf: 'stretch',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  emojiBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  flexShrink: {
    flexShrink: 1,
  },
});
