import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { AppText } from './AppText';
import { PillButton } from './PillButton';

interface Props {
  onRetry: () => void;
  message?: string;
}

/** Shown when a screen could not read its data, instead of leaving it empty without a word. */
export function LoadError({ onRetry, message = 'No se pudieron cargar tus datos.' }: Props) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <AppText size={26}>😵‍💫</AppText>
      <AppText weight="bold" size={15} style={styles.text}>
        {message}
      </AppText>
      <AppText size={13} color={colors.textMuted} style={styles.text}>
        Tus datos siguen guardados en el celular.
      </AppText>
      <PillButton label="Reintentar" icon="refresh-cw" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 28,
  },
  text: {
    textAlign: 'center',
  },
});
