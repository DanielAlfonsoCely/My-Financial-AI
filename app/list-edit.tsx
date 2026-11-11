import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { createList, deleteList, updateList } from '../src/db/repo';
import { PERSONAL_LIST_ID } from '../src/db/seed';
import type { List } from '../src/db/types';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { colors, fonts, radius } from '../src/theme';

/** Create or rename a list. A new list continues to "Elige tus categorías" for that list. */
export default function ListEditScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof id === 'string' && id ? id : null;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');

  useEffect(() => {
    if (!editingId) return;
    db.getFirstAsync<List>('SELECT * FROM lists WHERE id = ?', editingId).then((l) => {
      if (l) {
        setName(l.name);
        setEmoji(l.emoji);
      }
    });
  }, [db, editingId]);

  const save = async () => {
    try {
      if (editingId) {
        await updateList(db, editingId, name, emoji);
        router.back();
      } else {
        const newId = await createList(db, name, emoji);
        router.replace({ pathname: '/onboarding', params: { listId: newId, mode: 'list' } });
      }
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert(`Eliminar "${name}"`, 'Se eliminan también sus movimientos, categorías, etiquetas y presupuestos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteList(db, editingId);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <ScreenHeader title={editingId ? 'Editar lista' : 'Nueva lista'} subtitle="Por ejemplo: Trabajo, Viaje, Emprendimiento" />
      <View style={styles.body}>
        <View style={styles.row}>
          <TextInput
            value={emoji}
            onChangeText={(t) => setEmoji(t.trim().slice(0, 8))}
            placeholder="🙂"
            placeholderTextColor={colors.textFaint}
            style={styles.emoji}
            accessibilityLabel="Emoji de la lista"
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre"
            placeholderTextColor={colors.textFaint}
            autoFocus
            maxLength={30}
            style={styles.name}
          />
        </View>
        {editingId && editingId !== PERSONAL_LIST_ID && (
          <Pressable onPress={remove} hitSlop={8}>
            <AppText weight="semibold" size={14} color={colors.danger}>
              Eliminar lista
            </AppText>
          </Pressable>
        )}
      </View>
      <View style={[styles.bottom, { paddingBottom: keyboard.inset > 0 ? 12 : insets.bottom + 12 }]}>
        <Pressable onPress={save} disabled={!name.trim()} style={[styles.saveButton, !name.trim() && styles.disabled]}>
          <Feather name={editingId ? 'check' : 'arrow-right'} size={20} color={colors.surface} />
          <AppText weight="bold" size={17} color={colors.surface}>
            {editingId ? 'Guardar' : 'Siguiente'}
          </AppText>
        </Pressable>
      </View>
      <View style={{ height: keyboard.inset }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.chip,
    textAlign: 'center',
    fontSize: 30,
  },
  name: {
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.text,
    padding: 0,
  },
  bottom: {
    paddingHorizontal: 16,
  },
  saveButton: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: '#2C2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabled: {
    opacity: 0.35,
  },
});
