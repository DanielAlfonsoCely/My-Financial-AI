import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors } from '../theme';
import { AppText } from './AppText';

export interface GridItem {
  key: string;
  emoji: string;
  name: string;
  /** Tile color when selected. */
  color: string;
  selected: boolean;
}

interface Props {
  items: GridItem[];
  onPress: (key: string) => void;
  onAdd: () => void;
}

const COLUMNS = 3;
const GAP = 12;
const SIDE = 20;
/** Unselected tiles are a very light gray, like MonAi's first screen (Video Yt/01). */
const IDLE = '#F0F0F2';

/** "Elige tus categorías" grid: big rounded tiles, emoji in the middle, name below, dashed "+" at the end. */
export function CategoryGrid({ items, onPress, onAdd }: Props) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onPress(item.key)}
          style={[styles.cell, { width: tile }]}
          accessibilityRole="button"
          accessibilityState={{ selected: item.selected }}
          accessibilityLabel={item.name}
        >
          <View style={[styles.tile, { width: tile, height: tile, backgroundColor: item.selected ? item.color : IDLE }]}>
            <AppText size={30} style={!item.selected && styles.idleEmoji}>
              {item.emoji}
            </AppText>
          </View>
          <AppText weight="semibold" size={14} numberOfLines={1} style={styles.label}>
            {item.name}
          </AppText>
        </Pressable>
      ))}
      <Pressable onPress={onAdd} style={[styles.cell, { width: tile }]} accessibilityRole="button" accessibilityLabel="Añadir categoría">
        <View style={[styles.tile, styles.add, { width: tile, height: tile }]}>
          <Feather name="plus" size={30} color={colors.textFaint} />
        </View>
        <AppText weight="semibold" size={14} numberOfLines={1} style={styles.label}>
          Añadir categoría
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SIDE,
    columnGap: GAP,
    rowGap: 18,
  },
  cell: {
    alignItems: 'center',
    gap: 8,
  },
  tile: {
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleEmoji: {
    opacity: 0.9,
  },
  add: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textFaint,
    backgroundColor: 'transparent',
  },
  label: {
    textAlign: 'center',
  },
});
