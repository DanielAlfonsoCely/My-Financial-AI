import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { startOfDay } from '../../lib/dates';
import { monthTitle, rangeLabel } from '../../lib/period';
import { colors, radius } from '../../theme';
import { AppText } from '../AppText';
import { IconButton } from '../IconButton';
import { Sheet } from '../Sheet';

const WEEKDAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const DAY_MS = 86_400_000;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Range in [start, end) epoch ms. */
  onApply: (start: number, end: number) => void;
}

/** Calendar to pick a custom range: first tap = start, second tap = end. */
export function RangeSheet({ visible, onClose, onApply }: Props) {
  const today = startOfDay(new Date());
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [first, setFirst] = useState<number | null>(null);
  const [last, setLast] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFirst(null);
    setLast(null);
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    // Reset only when opening.
  }, [visible]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    // Monday-first offset: getDay() is 0 for Sunday.
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1).getTime()),
    ];
  }, [cursor]);

  const tap = (day: number) => {
    if (first === null || last !== null) {
      setFirst(day);
      setLast(null);
    } else if (day < first) {
      setLast(first);
      setFirst(day);
    } else {
      setLast(day);
    }
  };

  const inRange = (day: number) => {
    if (first === null) return false;
    const end = last ?? first;
    return day >= first && day <= end;
  };

  // DST-safe "next day": build it from the calendar date instead of adding 24 h.
  const endExclusive = (day: number) => {
    const d = new Date(day);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  };

  const apply = () => {
    if (first === null) return;
    onApply(first, endExclusive(last ?? first));
  };

  const footer =
    first === null ? 'Toca una fecha para comenzar tu rango' : rangeLabel(first, endExclusive(last ?? first));

  return (
    <Sheet visible={visible} onClose={onClose} closeOnLeft>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText weight="extrabold" size={18}>
            {monthTitle(cursor.getFullYear(), cursor.getMonth())}
          </AppText>
          <View style={styles.nav}>
            <IconButton
              icon="chevron-left"
              label="Mes anterior"
              onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            />
            <IconButton
              icon="chevron-right"
              label="Mes siguiente"
              onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            />
          </View>
        </View>

        <View style={styles.grid}>
          {WEEKDAYS.map((d) => (
            <View key={d} style={styles.cell}>
              <AppText weight="semibold" size={11} color={colors.textMuted}>
                {d}
              </AppText>
            </View>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <View key={`e${i}`} style={styles.cell} />;
            const selected = inRange(day);
            const isToday = Math.abs(day - today.getTime()) < DAY_MS / 2;
            return (
              <Pressable key={day} style={styles.cell} onPress={() => tap(day)}>
                <View style={[styles.day, selected && styles.daySelected]}>
                  <AppText
                    weight={selected || isToday ? 'bold' : 'regular'}
                    size={16}
                    color={selected ? colors.surface : isToday ? colors.accent : colors.text}
                  >
                    {new Date(day).getDate()}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <AppText weight={first === null ? 'regular' : 'bold'} size={13} color={first === null ? colors.textMuted : colors.text} style={styles.footer}>
          {footer}
        </AppText>

        <Pressable
          onPress={apply}
          disabled={first === null}
          style={[styles.apply, first === null && styles.applyDisabled]}
        >
          <Feather name="check" size={18} color={colors.surface} />
          <AppText weight="bold" size={16} color={colors.surface}>
            Aplicar
          </AppText>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 8,
  },
  nav: {
    flexDirection: 'row',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: colors.text,
  },
  footer: {
    textAlign: 'center',
    paddingVertical: 6,
  },
  apply: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.text,
  },
  applyDisabled: {
    opacity: 0.3,
  },
});
