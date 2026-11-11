import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '../theme';

interface Props {
  /** Values in order of time. Needs at least two to draw a line. */
  values: number[];
  width: number;
  height: number;
  color?: string;
}

const PAD = 6;

/** A plain line with a soft fill under it and a dot on the last value. No axes: the numbers are above it. */
export function LineChart({ values, width, height, color = colors.text }: Props) {
  if (values.length < 2 || width <= 0) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (values.length - 1)) * (width - PAD * 2);
  // A flat line sits in the middle instead of on the floor.
  const y = (v: number) => (max === min ? height / 2 : PAD + (1 - (v - min) / span) * (height - PAD * 2));
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const last = values.length - 1;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.18} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#fill)" />
      <Path d={line} stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <Circle cx={x(last)} cy={y(values[last])} r={4.5} fill={color} />
    </Svg>
  );
}
