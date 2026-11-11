import { useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

interface Props {
  value: number;
  onChange: (value: number) => void;
  /** Called when the finger lifts, to save. */
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/** Red slider of "Umbral de alerta" (TikTok/10). No extra library: a track and a PanResponder. */
export function ThresholdSlider({ value, onChange, onCommit, min = 50, max = 100, step = 5 }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const latest = useRef(value);
  latest.current = value;

  const fromX = (x: number) => {
    const ratio = Math.min(1, Math.max(0, x / (widthRef.current || 1)));
    return Math.round((min + ratio * (max - min)) / step) * step;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onChange(fromX(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => onChange(fromX(e.nativeEvent.locationX)),
      onPanResponderRelease: () => onCommit(latest.current),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const fill = ((value - min) / (max - min)) * width;

  return (
    <View style={styles.hit} onLayout={onLayout} {...responder.panHandlers}>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: fill }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: 28,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
