import { type ReactNode, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

interface Props {
  width: number;
  pages: ReactNode[];
  onPageChange?: (page: number) => void;
}

/**
 * Horizontal panels moved with a JS gesture instead of a horizontal ScrollView.
 * Inner horizontal ScrollViews (category bars, month strip) are native and win their own
 * gestures, so they keep scrolling; a horizontal swipe anywhere else changes the panel.
 */
export function Pager({ width, pages, onPageChange }: Props) {
  const translate = useRef(new Animated.Value(0)).current;
  const pageRef = useRef(0);
  const last = pages.length - 1;

  const goTo = (page: number) => {
    pageRef.current = page;
    onPageChange?.(page);
    Animated.spring(translate, { toValue: -page * width, useNativeDriver: true, bounciness: 0, speed: 14 }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only clearly horizontal drags; vertical ones stay with the list.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderMove: (_, g) => {
          const base = -pageRef.current * width;
          let next = base + g.dx;
          // Rubber band past the first and last panel.
          if (next > 0) next = next / 4;
          if (next < -last * width) next = -last * width + (next + last * width) / 4;
          translate.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const page = pageRef.current;
          if ((g.dx < -width * 0.25 || g.vx < -0.5) && page < last) goTo(page + 1);
          else if ((g.dx > width * 0.25 || g.vx > 0.5) && page > 0) goTo(page - 1);
          else goTo(page);
        },
        onPanResponderTerminate: () => goTo(pageRef.current),
      }),
    // goTo only reads refs and stable setters.
    [width, last, translate],
  );

  return (
    <View style={styles.viewport} {...responder.panHandlers}>
      <Animated.View style={[styles.row, { width: width * pages.length, transform: [{ translateX: translate }] }]}>
        {pages.map((page, i) => (
          <View key={i} style={{ width }}>
            {page}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
});
