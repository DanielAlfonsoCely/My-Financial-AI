import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, useWindowDimensions } from 'react-native';

import { colors, radius } from '../../theme';
import { AppText } from '../AppText';

export interface StripItem {
  key: string;
  label: string;
  amount: string;
  selected: boolean;
  onPress: () => void;
}

/** Horizontal strip of months or years with their total, the selected one centered. */
export function PeriodStrip({ items }: { items: StripItem[] }) {
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollViewInstance>(null);
  const positions = useRef(new Map<string, { x: number; width: number }>());
  const selectedKey = items.find((i) => i.selected)?.key;

  const center = (animated: boolean) => {
    const pos = selectedKey ? positions.current.get(selectedKey) : undefined;
    if (pos) scroll.current?.scrollTo({ x: Math.max(0, pos.x + pos.width / 2 - width / 2), animated });
  };

  useEffect(() => {
    center(true);
    // Recenter only when the selection changes.
  }, [selectedKey]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          onLayout={(e) => {
            positions.current.set(item.key, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width });
            if (item.selected) center(false);
          }}
          style={[styles.item, item.selected && styles.itemSelected]}
        >
          <AppText weight={item.selected ? 'bold' : 'semibold'} size={13} color={item.selected ? colors.text : colors.textMuted}>
            {item.label}
          </AppText>
          <AppText size={11} color={item.selected ? colors.textMuted : colors.textFaint}>
            {item.amount}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    gap: 4,
  },
  item: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  itemSelected: {
    backgroundColor: colors.chip,
  },
});
