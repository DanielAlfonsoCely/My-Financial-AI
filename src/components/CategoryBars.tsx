import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CategoryTotal } from '../hooks/useMonthData';
import { formatCompact } from '../lib/money';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

const MAX_HEIGHT = 220;
const MIN_HEIGHT = 64;

interface Props {
  items: CategoryTotal[];
  selectedId: string | null | undefined;
  onSelect: (categoryId: string | null | undefined) => void;
}

/**
 * One column per category, height relative to the biggest category of the month.
 * Tapping a column filters the list below; tapping it again clears the filter.
 */
export function CategoryBars({ items, selectedId, onSelect }: Props) {
  const max = Math.max(...items.map((i) => i.total), 1);
  const hasSelection = selectedId !== undefined;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => {
        const height = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * (item.total / max);
        const selected = hasSelection && selectedId === item.categoryId;
        const dimmed = hasSelection && !selected;
        return (
          <Pressable
            key={item.categoryId ?? 'none'}
            onPress={() => onSelect(selected ? undefined : item.categoryId)}
            style={styles.column}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}: ${formatCompact(item.total)}`}
          >
            <View
              style={[
                styles.bar,
                { height, backgroundColor: item.color, opacity: dimmed ? 0.35 : 1 },
              ]}
            >
              <AppText size={20}>{item.emoji}</AppText>
              <AppText weight="bold" size={13} style={styles.amount}>
                {formatCompact(item.total)}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    gap: 10,
    alignItems: 'flex-end',
    minHeight: MAX_HEIGHT,
  },
  column: {
    width: 72,
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    gap: 4,
  },
  amount: {
    color: colors.text,
  },
});
