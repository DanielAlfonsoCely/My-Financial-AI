import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CategoryTotal } from '../hooks/useHomeData';
import { formatCompact } from '../lib/money';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

const MAX_HEIGHT = 260;
const MIN_HEIGHT = 76;
/** Columns of categories with 0 are low pills with the emoji and the 0 on one line. */
const ZERO_HEIGHT = 54;
/** Below this height the emoji and the amount go on the same line. */
const INLINE_BELOW = 96;
const BAR_WIDTH = 86;

interface Props {
  items: CategoryTotal[];
  selectedId: string | null | undefined;
  onSelect: (categoryId: string | null | undefined) => void;
}

/**
 * One column per category. All columns share one scale (height ∝ amount), so a budget outline
 * can be drawn on the same scale later. Tapping a column selects it and dims the rest.
 */
export function CategoryBars({ items, selectedId, onSelect }: Props) {
  const max = Math.max(...items.map((i) => i.total), 1);
  const hasSelection = selectedId !== undefined;

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => {
        const zero = item.total === 0;
        const height = zero ? ZERO_HEIGHT : MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * (item.total / max);
        const inline = height < INLINE_BELOW;
        const selected = hasSelection && selectedId === item.categoryId;
        const dimmed = hasSelection && !selected;
        return (
          <Pressable
            key={item.categoryId ?? `none-${item.kind}`}
            onPress={() => onSelect(selected ? undefined : item.categoryId)}
            style={styles.column}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}: ${formatCompact(item.total)}`}
          >
            <View
              style={[
                styles.bar,
                inline && styles.barInline,
                {
                  height,
                  backgroundColor: zero ? colors.chip : item.color,
                  opacity: dimmed ? 0.3 : 1,
                },
              ]}
            >
              <AppText size={inline ? 16 : 24}>{item.emoji}</AppText>
              <AppText weight="bold" size={inline ? 14 : 15}>
                {formatCompact(item.total)}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const SKELETON = [1, 0.72, 0.5, 0.32];

/** Gray columns shown before the first transaction of the period, like MonAi. */
export function EmptyBars() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.row}>
        {SKELETON.map((ratio, i) => (
          <View key={i} style={[styles.skeleton, { height: MAX_HEIGHT * ratio }]} />
        ))}
      </View>
      <View style={styles.emptyLabel} pointerEvents="none">
        <AppText weight="bold" size={16}>
          Tus transacciones se mostrarán aquí
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'flex-end',
    minHeight: MAX_HEIGHT,
  },
  column: {
    width: BAR_WIDTH,
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: radius.lg + 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 14,
    gap: 2,
  },
  barInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 0,
    gap: 4,
  },
  emptyWrap: {
    justifyContent: 'center',
  },
  skeleton: {
    width: BAR_WIDTH,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.chip,
  },
  emptyLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
