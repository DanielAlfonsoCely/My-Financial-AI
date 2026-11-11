import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Put the ✕ on the left (used by the calendar, like MonAi). */
  closeOnLeft?: boolean;
  children: ReactNode;
}

/** Bottom sheet with big rounded corners and a ✕ in a white circle. */
export function Sheet({ visible, onClose, title, subtitle, closeOnLeft, children }: Props) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    slide.setValue(1);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
  }, [visible, slide]);

  const close = (
    <IconButton icon="x" label="Cerrar" background={colors.surface} style={styles.closeButton} onPress={onClose} />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16 },
          { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 600] }) }] },
        ]}
      >
        <View style={styles.handle} />
        {closeOnLeft ? (
          <View style={styles.headerLeft}>{close}</View>
        ) : (
          <View style={styles.header}>
            <View style={styles.titles}>
              {title && (
                <AppText weight="extrabold" size={24}>
                  {title}
                </AppText>
              )}
              {subtitle && (
                <AppText size={14} color={colors.textMuted}>
                  {subtitle}
                </AppText>
              )}
            </View>
            {close}
          </View>
        )}
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: colors.background,
    borderRadius: 32,
    paddingTop: 8,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  titles: {
    flex: 1,
    gap: 4,
    paddingTop: 4,
  },
  closeButton: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
