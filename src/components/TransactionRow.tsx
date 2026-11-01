import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TransactionWithCategory } from '../db/types';
import { formatMoney } from '../lib/money';
import { parseTags } from '../lib/tags';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

interface Props {
  transaction: TransactionWithCategory;
  onPress: () => void;
}

/** Tags shown before "+N" (Video Yt/25: "#ropadeverano  +1"). */
const VISIBLE_TAGS = 2;

/** v2 row: emoji bubble, gray category, bold title, tags below and the amount as plain text. */
export function TransactionRow({ transaction: t, onPress }: Props) {
  const isIncome = t.kind === 'income';
  const categoryName = t.category_name ?? 'Sin categoría';
  const title = t.title || categoryName;
  const tags = parseTags(t.tags);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
      <View style={[styles.bubble, { backgroundColor: t.category_color ?? colors.chip }]}>
        <AppText size={22}>{t.category_emoji ?? '❔'}</AppText>
        {t.recurring_id && (
          <View style={styles.badge}>
            <Feather name="repeat" size={10} color={colors.text} />
          </View>
        )}
      </View>
      <View style={styles.texts}>
        <AppText size={12} color={colors.textMuted} numberOfLines={1}>
          {categoryName}
        </AppText>
        <AppText weight="bold" size={17} numberOfLines={2}>
          {title}
        </AppText>
        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.slice(0, VISIBLE_TAGS).map((tag) => (
              <View key={tag} style={styles.tag}>
                <AppText size={11} color={colors.textMuted}>
                  #{tag}
                </AppText>
              </View>
            ))}
            {tags.length > VISIBLE_TAGS && (
              <View style={styles.tag}>
                <AppText size={11} color={colors.textMuted}>
                  +{tags.length - VISIBLE_TAGS}
                </AppText>
              </View>
            )}
          </View>
        )}
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
    gap: 14,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
  bubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  tags: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
  },
});
