import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { PIN_LENGTH } from '../lib/security';
import { colors } from '../theme';
import { AppText } from './AppText';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'back'] as const;
type Key = (typeof KEYS)[number];

interface Props {
  title: string;
  subtitle?: string;
  /** Shown in red under the dots. */
  error?: string | null;
  /** Called when all digits are typed. Return false to shake and clear. */
  onComplete: (pin: string) => Promise<boolean> | boolean;
  onBiometric?: () => void;
  disabled?: boolean;
}

/** Dots + big keypad. Used by the lock screen and by the PIN setup in Seguridad. */
export function PinPad({ title, subtitle, error, onComplete, onBiometric, disabled }: Props) {
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  // A new title means a new step (e.g. "Confirma tu PIN"): start empty.
  useEffect(() => setPin(''), [title]);

  const runShake = () => {
    shake.setValue(0);
    Animated.sequence(
      [10, -10, 8, -8, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true }),
      ),
    ).start();
  };

  const press = async (key: Key) => {
    if (disabled || checking) return;
    if (key === 'bio') {
      onBiometric?.();
      return;
    }
    if (key === 'back') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = pin + key;
    if (next.length > PIN_LENGTH) return;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      setChecking(true);
      const ok = await onComplete(next);
      setChecking(false);
      if (!ok) runShake();
      setPin('');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <AppText weight="extrabold" size={24} style={styles.center}>
          {title}
        </AppText>
        {subtitle && (
          <AppText size={14} color={colors.textMuted} style={styles.center}>
            {subtitle}
          </AppText>
        )}
        <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </Animated.View>
        <AppText size={13} color={colors.danger} style={[styles.center, styles.error]}>
          {error ?? ' '}
        </AppText>
      </View>

      <View style={[styles.grid, disabled && styles.disabled]}>
        {KEYS.map((key) => {
          if (key === 'bio' && !onBiometric) return <View key={key} style={styles.key} />;
          return (
            <Pressable
              key={key}
              onPress={() => press(key)}
              onLongPress={key === 'back' ? () => setPin('') : undefined}
              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              accessibilityRole="button"
              accessibilityLabel={key === 'back' ? 'Borrar' : key === 'bio' ? 'Usar huella' : key}
            >
              {key === 'back' ? (
                <Feather name="delete" size={24} color={colors.text} />
              ) : key === 'bio' ? (
                <MaterialCommunityIcons name="fingerprint" size={32} color={colors.text} />
              ) : (
                <AppText weight="semibold" size={28}>
                  {key}
                </AppText>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const KEY_SIZE = 76;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  center: {
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.text,
  },
  dotFilled: {
    backgroundColor: colors.text,
  },
  error: {
    minHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 40,
    rowGap: 14,
    columnGap: 22,
    paddingBottom: 24,
  },
  disabled: {
    opacity: 0.35,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    backgroundColor: colors.chip,
  },
});
