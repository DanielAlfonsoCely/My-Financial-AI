import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius } from '../theme';
import { AppText } from './AppText';

interface Props {
  label: string;
  onPress: () => void;
  icon?: ComponentProps<typeof Feather>['name'];
  disabled?: boolean;
}

/** Small dark centered button of the onboarding ("→ Guardar", "→ Continuar", "→ Siguiente"). */
export function PillButton({ label, onPress, icon = 'arrow-right', disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Feather name={icon} size={16} color={disabled ? colors.textMuted : colors.surface} />
      <AppText weight="bold" size={15} color={disabled ? colors.textMuted : colors.surface}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: '#2C2C2E',
  },
  disabled: {
    backgroundColor: '#E6E6E9',
  },
  pressed: {
    opacity: 0.8,
  },
});
