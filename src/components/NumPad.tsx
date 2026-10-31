import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';
import { AppText } from './AppText';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'] as const;
const MAX_DIGITS = 12;

interface Props {
  /** Digits typed so far, without separators. */
  value: string;
  onChange: (value: string) => void;
}

/** Big on-screen keypad so amounts never need the system keyboard. */
export function NumPad({ value, onChange }: Props) {
  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'back') {
      onChange(value.slice(0, -1));
      return;
    }
    const next = (value + key).replace(/^0+/, '');
    if (next.length <= MAX_DIGITS) onChange(next);
  };

  return (
    <View style={styles.grid}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          onPress={() => press(key)}
          onLongPress={key === 'back' ? () => onChange('') : undefined}
          style={({ pressed }) => [styles.key, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={key === 'back' ? 'Borrar' : key}
        >
          {key === 'back' ? (
            <Feather name="delete" size={22} color={colors.text} />
          ) : (
            <AppText weight="semibold" size={24}>
              {key}
            </AppText>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  key: {
    width: '33.333%',
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
});
