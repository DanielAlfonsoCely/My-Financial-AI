import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';
import { AppText } from './AppText';

interface Props {
  emoji: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** Switch, badge... When missing and the row is pressable, a chevron is shown. */
  right?: ReactNode;
  disabled?: boolean;
}

/** MonAi-style settings row: emoji in a light gray circle, title and gray subtitle. */
export function SettingsRow({ emoji, title, subtitle, onPress, right, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.bubble}>
        <AppText size={22}>{emoji}</AppText>
      </View>
      <View style={styles.texts}>
        <AppText weight="bold" size={16}>
          {title}
        </AppText>
        {subtitle && (
          <AppText size={12} color={colors.textMuted}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right ?? (onPress && <Feather name="chevron-right" size={18} color={colors.textFaint} />)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
  disabled: {
    opacity: 0.5,
  },
  bubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
});
