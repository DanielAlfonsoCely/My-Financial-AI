import { forwardRef, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputInstance, type TextInputProps, View } from 'react-native';

import { formatAmount } from '../lib/money';
import { colors, fonts } from '../theme';
import { AppText } from './AppText';

const MAX_DIGITS = 12;

interface Props {
  /** Digits only, without separators ("25000"). */
  digits: string;
  onChangeDigits: (digits: string) => void;
  color: string;
  size?: number;
  placeholder?: string;
  autoFocus?: boolean;
  onFocus?: TextInputProps['onFocus'];
  onSubmitEditing?: () => void;
}

type Selection = { start: number; end: number };

function countDigits(text: string): number {
  return text.replace(/\D/g, '').length;
}

/** Index in `formatted` right after the first `n` digits. */
function positionAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen++;
    if (seen === n) return i + 1;
  }
  return formatted.length;
}

/**
 * Applies an edit of the formatted text. Pure, so it can be tested without a phone.
 * Returns the new digits and where the cursor goes in the new formatted text.
 */
export function computeAmountEdit(prevDigits: string, selection: Selection, text: string): { digits: string; cursor: number } {
  const prev = prevDigits ? formatAmount(Number(prevDigits)) : '';
  // Where the cursor ends up in the raw text: start of the old selection plus what was inserted.
  const inserted = text.length - (prev.length - (selection.end - selection.start));
  const rawCursor = Math.min(text.length, Math.max(0, selection.start + inserted));

  let next = text.replace(/\D/g, '');
  let before = countDigits(text.slice(0, rawCursor));

  // Backspace on a thousands dot removes only the dot; delete the digit before it instead.
  if (next === prevDigits && text.length < prev.length && before > 0) {
    next = next.slice(0, before - 1) + next.slice(before);
    before -= 1;
  }

  // No leading zeros ("05.000" -> "5.000").
  const trimmed = next.replace(/^0+/, '');
  before = Math.max(0, before - (next.length - trimmed.length));
  next = trimmed.slice(0, MAX_DIGITS);
  before = Math.min(before, next.length);

  const formatted = next ? formatAmount(Number(next)) : '';
  return { digits: next, cursor: positionAfterDigits(formatted, before) };
}

/**
 * Amount field with the phone's number keyboard (only open while this field is focused).
 * It shows "25.000" but keeps the cursor where the finger put it: tapping between the 5 and the 0,
 * deleting and typing a 6 gives 26.000. Thousands dots are re-added after every change.
 */
export const AmountInput = forwardRef<TextInputInstance, Props>(function AmountInput(
  { digits, onChangeDigits, color, size = 42, placeholder = 'Monto', autoFocus, onFocus, onSubmitEditing },
  ref,
) {
  const display = digits ? formatAmount(Number(digits)) : '';
  const [selection, setSelection] = useState<Selection>({ start: display.length, end: display.length });
  // Digits this field produced itself. Any other change (parser, loading an edit) moves the cursor to the end.
  const ownDigits = useRef(digits);
  useEffect(() => {
    if (digits !== ownDigits.current) {
      ownDigits.current = digits;
      setSelection({ start: display.length, end: display.length });
    }
  }, [digits, display.length]);

  const handleChange = (text: string) => {
    const result = computeAmountEdit(digits, selection, text);
    ownDigits.current = result.digits;
    setSelection({ start: result.cursor, end: result.cursor });
    onChangeDigits(result.digits);
  };

  return (
    <View style={styles.row}>
      {display !== '' && (
        <AppText weight="extrabold" size={size} color={color} style={styles.symbol}>
          $
        </AppText>
      )}
      <TextInput
        ref={ref}
        value={display}
        onChangeText={handleChange}
        selection={selection}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="done"
        style={[styles.input, { color, fontSize: size }]}
        accessibilityLabel="Monto"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  symbol: {
    marginRight: 2,
    includeFontPadding: false,
  },
  input: {
    fontFamily: fonts.extrabold,
    padding: 0,
    flexShrink: 1,
    minWidth: 80,
    includeFontPadding: false,
  },
});
