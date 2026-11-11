import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { normalizeTag } from '../lib/tags';
import { colors, fonts, radius } from '../theme';
import { AppText } from './AppText';

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Tags already used in the list, suggested while typing. */
  known: string[];
  onDone: () => void;
}

/**
 * Bottom tag field of the transaction sheet (Video Yt/10): chips + "#Etiqueta" input + dark ✓.
 * Space, comma or "enter" turn the text into a chip. Tapping a chip removes it.
 */
export function TagEditor({ tags, onChange, known, onDone }: Props) {
  const [text, setText] = useState('');

  const commit = (raw: string) => {
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setText('');
  };

  const handleText = (value: string) => {
    if (/[\s,]$/.test(value)) commit(value);
    else setText(value.replace(/^#+/, ''));
  };

  const suggestions = useMemo(() => {
    const prefix = normalizeTag(text);
    return known.filter((t) => !tags.includes(t) && (!prefix || t.startsWith(prefix))).slice(0, 8);
  }, [known, tags, text]);

  return (
    <View style={styles.wrap}>
      {suggestions.length > 0 && (
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>
          {suggestions.map((t) => (
            <Pressable key={t} onPress={() => commit(t)} style={styles.suggestion}>
              <AppText weight="semibold" size={13} color={colors.textMuted}>
                #{t}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.row}>
        <View style={styles.field}>
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fieldContent}>
            {tags.map((t) => (
              <Pressable key={t} onPress={() => onChange(tags.filter((x) => x !== t))} style={styles.chip} accessibilityLabel={`Quitar ${t}`}>
                <AppText weight="semibold" size={14}>
                  #{t}
                </AppText>
              </Pressable>
            ))}
            <TextInput
              value={text ? `#${text}` : ''}
              onChangeText={handleText}
              onSubmitEditing={() => (text ? commit(text) : onDone())}
              placeholder="#Etiqueta"
              placeholderTextColor={colors.textFaint}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              blurOnSubmit={false}
              returnKeyType="done"
              style={styles.input}
            />
          </ScrollView>
        </View>
        <Pressable
          onPress={() => {
            if (text) commit(text);
            onDone();
          }}
          style={styles.done}
          accessibilityLabel="Listo"
        >
          <Feather name="check" size={22} color={colors.surface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  suggestions: {
    gap: 6,
  },
  suggestion: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  field: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: colors.chip,
    justifyContent: 'center',
  },
  fieldContent: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: '#DCDCE0',
  },
  input: {
    minWidth: 120,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
  },
  done: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
