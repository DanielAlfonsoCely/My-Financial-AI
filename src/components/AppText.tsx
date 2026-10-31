import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '../theme';

type Weight = keyof typeof fonts;

interface Props extends TextProps {
  weight?: Weight;
  size?: number;
  color?: string;
}

/** Text with the app font. React Native does not inherit fonts, so every label goes through here. */
export function AppText({ weight = 'regular', size = 15, color = colors.text, style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      style={[styles.base, { fontFamily: fonts[weight], fontSize: size, color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
