import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme';

interface Props {
  icon: ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  label: string;
  size?: number;
  color?: string;
  background?: string;
  diameter?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 20,
  color = colors.text,
  background = 'transparent',
  diameter = 40,
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: background },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Feather name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
