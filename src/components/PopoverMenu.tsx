import { Feather } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors, radius } from '../theme';
import { AppText } from './AppText';

export interface MenuItem {
  key: string;
  label: string;
  icon?: ComponentProps<typeof Feather>['name'];
  emoji?: string;
  checked?: boolean;
  disabled?: boolean;
  /** Draws a separator above the item. */
  separated?: boolean;
  onPress: () => void;
}

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  anchor: Anchor | null;
  onClose: () => void;
  items: MenuItem[];
  align?: 'left' | 'right';
  /** Extra content under the items, e.g. a row of actions. */
  footer?: ReactNode;
}

const MENU_WIDTH = 260;

/** Floating menu under a button, like the iOS context menus MonAi uses. */
export function PopoverMenu({ anchor, onClose, items, align = 'left', footer }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  if (!anchor) return null;

  const left =
    align === 'left'
      ? Math.max(12, anchor.x)
      : Math.max(12, Math.min(screenWidth - MENU_WIDTH - 12, anchor.x + anchor.width - MENU_WIDTH));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar menú" />
      <View style={[styles.menu, { top: anchor.y + anchor.height + 6, left }]}>
        {items.map((item) => (
          <View key={item.key}>
            {item.separated && <View style={styles.separator} />}
            <Pressable
              disabled={item.disabled}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed, item.disabled && styles.disabled]}
            >
              <View style={styles.leading}>
                {item.checked ? (
                  <Feather name="check" size={18} color={colors.text} />
                ) : item.icon ? (
                  <Feather name={item.icon} size={18} color={colors.text} />
                ) : item.emoji ? (
                  <AppText size={16}>{item.emoji}</AppText>
                ) : null}
              </View>
              <AppText weight="semibold" size={16} style={styles.label}>
                {item.label}
              </AppText>
            </Pressable>
          </View>
        ))}
        {footer}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 6,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  itemPressed: {
    backgroundColor: colors.chip,
  },
  disabled: {
    opacity: 0.4,
  },
  leading: {
    width: 22,
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
});
