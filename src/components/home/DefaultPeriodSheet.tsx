import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { type TransactionAmount } from '../../db/types';
import { sumRange } from '../../hooks/useHomeData';
import { formatMoney } from '../../lib/money';
import { MAX_START_DAY, monthPeriodLabel, monthStartFor, shiftMonth } from '../../lib/period';
import { colors, radius } from '../../theme';
import { AppText } from '../AppText';
import { Sheet } from '../Sheet';

interface Props {
  visible: boolean;
  startDay: number;
  amounts: TransactionAmount[];
  onClose: () => void;
  onApply: (startDay: number) => void;
}

const DAYS = Array.from({ length: MAX_START_DAY }, (_, i) => i + 1);

/** "Período predeterminado": lets the home month start on payday instead of the 1st. */
export function DefaultPeriodSheet({ visible, startDay, amounts, onClose, onApply }: Props) {
  const [day, setDay] = useState(startDay);

  useEffect(() => {
    if (visible) setDay(startDay);
  }, [visible, startDay]);

  const current = monthStartFor(new Date(), day);
  const preview = [-1, 0, 1].map((delta) => {
    const start = shiftMonth(current, delta);
    const end = shiftMonth(start, 1);
    return {
      key: delta,
      label: monthPeriodLabel(start),
      amount: formatMoney(sumRange(amounts, start.getTime(), end.getTime()).expense),
      current: delta === 0,
    };
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Período predeterminado"
      subtitle="Si no quieres que tu vista de inicio se reinicie cada mes, puedes cambiarlo aquí"
    >
      <View style={styles.body}>
        <View style={styles.preview}>
          {preview.map((p) => (
            <View key={p.key} style={[styles.previewItem, !p.current && styles.faded]}>
              <AppText weight="bold" size={13}>
                {p.label}
              </AppText>
              <AppText size={11} color={colors.textMuted}>
                {p.amount}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.row}>
          <AppText weight="semibold" size={15}>
            Frecuencia
          </AppText>
          <AppText weight="semibold" size={15} color={colors.textMuted}>
            Mensual
          </AppText>
        </View>

        <View style={styles.row}>
          <AppText weight="semibold" size={15}>
            Empieza el día
          </AppText>
          <AppText weight="bold" size={15}>
            {day}
          </AppText>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.days}
        >
          {DAYS.map((d) => (
            <Pressable key={d} onPress={() => setDay(d)} style={[styles.dayChip, d === day && styles.dayChipSelected]}>
              <AppText weight="bold" size={14} color={d === day ? colors.surface : colors.text}>
                {d}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          style={styles.apply}
          onPress={() => {
            onApply(day);
            onClose();
          }}
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
    gap: 14,
  },
  preview: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  previewItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  faded: {
    opacity: 0.35,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  days: {
    gap: 6,
    paddingHorizontal: 4,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chip,
  },
  dayChipSelected: {
    backgroundColor: colors.text,
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
});
