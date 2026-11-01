import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { createTag, deleteTag, listTags } from '../src/db/repo';
import type { Tag } from '../src/db/types';
import { listLabel, useCurrentList, useQuery } from '../src/hooks/useData';
import { normalizeTag } from '../src/lib/tags';
import { colors, fonts, radius } from '../src/theme';

/** "Etiquetas" (Video Yt/28): input on top, gray box with every tag of the list. Tap a tag to delete it. */
export default function TagsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { listId, list } = useCurrentList();
  const { data: tags } = useQuery(() => listTags(db, listId), [] as Tag[], [db, listId]);
  const [text, setText] = useState('');

  const add = async () => {
    const name = normalizeTag(text);
    if (!name) return;
    await createTag(db, listId, name);
    setText('');
  };

  const remove = (name: string) => {
    Alert.alert(`Eliminar #${name}`, 'Se quitará de todos los movimientos que la tengan.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteTag(db, listId, name) },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Etiquetas" subtitle={`En tu lista actual "${listLabel(list)}"`} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <TextInput
          value={text ? `#${text}` : ''}
          onChangeText={(v) => setText(v.replace(/^#+/, '').replace(/\s+/g, ''))}
          onSubmitEditing={add}
          placeholder="#nueva etiqueta"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          style={styles.input}
        />
        <View style={styles.box}>
          {tags.length === 0 ? (
            <AppText size={14} color={colors.textMuted}>
              Todavía no tienes etiquetas. Úsalas para marcar cómo pagaste (#efectivo, #nu) o lo que quieras.
            </AppText>
          ) : (
            tags.map((t) => (
              <Pressable key={t.id} onPress={() => remove(t.name)} style={styles.chip}>
                <AppText weight="semibold" size={15}>
                  #{t.name}
                </AppText>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  input: {
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.chip,
    paddingHorizontal: 20,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.text,
  },
  box: {
    minHeight: 280,
    borderRadius: radius.lg,
    backgroundColor: colors.chip,
    padding: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: '#DCDCE0',
  },
});
