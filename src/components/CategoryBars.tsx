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
const BAR_RADIUS = radius.lg + 4;

export interface BarPress {
  item: CategoryTotal;
  pageX: number;
  pageY: number;
}

interface Props {
  items: CategoryTotal[];
  selectedId: string | null | undefined;
  onSelect: (categoryId: string | null | undefined) => void;
  /** Long press: "Añadir/Editar presupuesto" and "Nueva transacción" (TikTok/06, 18). */
  onLongPress?: (press: BarPress) => void;
}

function heightFor(value: number, max: number): number {
  return value <= 0 ? ZERO_HEIGHT : MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.min(1, value / max);
}

/**
 * One column per category. Spending and budgets share one scale (height ∝ amount), so the dashed
 * budget outline is comparable across columns, like MonAi (TikTok/08). Over budget, the fill grows
 * past the outline and the outline is drawn inside the fill, in red.
 */
export function CategoryBars({ items, selectedId, onSelect, onLongPress }: Props) {
  const max = Math.max(...items.map((i) => Math.max(i.total, i.budget ?? 0)), 1);
  const hasSelection = selectedId !== undefined;

  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((item) => {
        const selected = hasSelection && selectedId === item.categoryId;
        const dimmed = hasSelection && !selected;
        const fill = heightFor(item.total, max);
        const budget = item.budget ?? 0;
        const outline = budget > 0 ? heightFor(budget, max) : 0;
        const over = budget > 0 && item.total > budget;
        const percent = budget > 0 ? Math.round((item.total / budget) * 100) : null;
        const inline = fill < INLINE_BELOW && percent === null;

        const label = (
          <View style={[styles.label, inline && styles.labelInline]}>
            <AppText size={inline ? 16 : 24}>{item.emoji}</AppText>
            <AppText weight="bold" size={inline ? 14 : 15}>
              {formatCompact(item.total)}
            </AppText>
            {percent !== null && (
              <AppText weight="semibold" size={12} color={colors.textMuted}>
                {percent}%
              </AppText>
            )}
          </View>
        );

        return (
          <Pressable
            key={item.categoryId ?? `none-${item.kind}`}
            onPress={() => onSelect(selected ? undefined : item.categoryId)}
            onLongPress={(e) => onLongPress?.({ item, pageX: e.nativeEvent.pageX, pageY: e.nativeEvent.pageY })}
            delayLongPress={350}
            style={[styles.column, { opacity: dimmed ? 0.3 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}: ${formatCompact(item.total)}${percent !== null ? `, ${percent}% del presupuesto` : ''}`}
          >
            {budget > 0 && !over && (
              // Budget outline taller than the fill: the fill sits inside it.
              <View style={[styles.outline, { height: outline }]} />
            )}
            <View
              style={[
                styles.fill,
                { height: Math.max(fill, percent !== null ? MIN_HEIGHT : 0), backgroundColor: item.total === 0 ? colors.chip : item.color },
              ]}
            >
              {over && <View style={[styles.outline, styles.outlineOver, { height: outline }]} />}
              {label}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const SKELETON = [1, 0.72, 0.5, 0.32];

/** Gray columns shown before the first transaction of the period, like MonAi (Video Yt/06). */
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
    height: MAX_HEIGHT,
    justifyContent: 'flex-end',
  },
  fill: {
    borderRadius: BAR_RADIUS,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  outline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BAR_RADIUS,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textFaint,
  },
  outlineOver: {
    // v2 (TikTok/12): over budget the dashed line is dark and sits on the edges of the fill.
    borderColor: 'rgba(28,28,30,0.45)',
  },
  label: {
    alignItems: 'center',
    paddingBottom: 12,
    gap: 1,
  },
  labelInline: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 0,
    gap: 4,
  },
  emptyWrap: {
    justifyContent: 'center',
  },
  skeleton: {
    width: BAR_WIDTH,
    borderRadius: BAR_RADIUS,
    backgroundColor: colors.chip,
  },
  emptyLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
