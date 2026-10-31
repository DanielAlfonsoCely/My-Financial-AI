import { Pressable, StyleSheet, View } from 'react-native';

import type { TransactionWithCategory } from '../db/types';
import { formatMoney } from '../lib/money';
import { colors } from '../theme';
import { AppText } from './AppText';

interface Props {
  transaction: TransactionWithCategory;
  onPress: () => void;
}

export function TransactionRow({ transaction: t, onPress }: Props) {
  const isIncome = t.kind === 'income';
  const categoryName = t.category_name ?? 'Sin categoría';
  const title = t.title || categoryName;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={[styles.bubble, { backgroundColor: t.category_color ?? colors.chip }]}>
        <AppText size={20}>{t.category_emoji ?? '❔'}</AppText>
      </View>
      <View style={styles.texts}>
        <AppText size={12} color={colors.textMuted} numberOfLines={1}>
          {categoryName}
        </AppText>
        <AppText weight="semibold" size={16} numberOfLines={1}>
          {title}
        </AppText>
      </View>
      <AppText weight="bold" size={16} color={isIncome ? colors.income : colors.text}>
        {isIncome ? '+ ' : '- '}
        {formatMoney(t.amount, t.currency)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
  bubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
});
