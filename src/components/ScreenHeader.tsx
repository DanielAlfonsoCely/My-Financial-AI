import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface Props {
  title: string;
  subtitle?: string;
  /** Extra buttons left of the ✕ (e.g. "+"). */
  actions?: ReactNode;
  onClose?: () => void;
}

/** MonAi sheet header: big bold title on the left, ✕ in a white circle on the right. */
export function ScreenHeader({ title, subtitle, actions, onClose }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <AppText weight="extrabold" size={28} style={styles.title}>
          {title}
        </AppText>
        <View style={styles.actions}>
          {actions}
          <IconButton icon="x" label="Cerrar" background={colors.surface} style={styles.shadow} onPress={onClose ?? (() => router.back())} />
        </View>
      </View>
      {subtitle && (
        <AppText size={14} color={colors.textMuted} style={styles.subtitle}>
          {subtitle}
        </AppText>
      )}
    </View>
  );
}

export const headerButtonShadow = {
  elevation: 2,
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  shadow: headerButtonShadow,
  subtitle: {
    paddingRight: 40,
  },
});
