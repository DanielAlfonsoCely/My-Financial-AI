import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { createAccountGroup, deleteAccountGroup, listAccountGroups, moveAccountGroup, updateAccountGroup } from '../src/db/repo';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { colors, fonts, radius } from '../src/theme';

/** Create, rename, reorder or delete a group of accounts ("Efectivo", "Bancos"). */
export default function AccountGroupScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof id === 'string' && id ? id : null;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');

  useEffect(() => {
    if (!editingId) return;
    listAccountGroups(db).then((groups) => {
      const group = groups.find((g) => g.id === editingId);
      if (group) {
        setName(group.name);
        setEmoji(group.emoji);
      }
    });
  }, [db, editingId]);

  const save = async () => {
    try {
      if (editingId) await updateAccountGroup(db, editingId, name, emoji);
      else await createAccountGroup(db, name, emoji);
      router.back();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert(`Eliminar "${name}"`, 'Sus cuentas no se borran: quedan sin grupo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccountGroup(db, editingId);
            router.back();
          } catch (error) {
            Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <ScreenHeader title={editingId ? 'Editar grupo' : 'Nuevo grupo'} subtitle="Para ver juntas las cuentas que van juntas: Efectivo, Bancos…" />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <View style={styles.tile}>
            <TextInput
              value={emoji}
              onChangeText={(text) => setEmoji([...text].slice(-2).join(''))}
              placeholder="🗂️"
              style={styles.emoji}
              accessibilityLabel="Emoji del grupo"
            />
          </View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre del grupo"
            placeholderTextColor={colors.textFaint}
            autoFocus={!editingId}
            maxLength={30}
            onSubmitEditing={save}
            style={styles.name}
          />
        </View>

        {editingId && (
          <View style={styles.actions}>
            <Pressable style={styles.action} onPress={() => moveAccountGroup(db, editingId, -1)}>
              <Feather name="arrow-up" size={16} color={colors.text} />
              <AppText weight="bold" size={14}>
                Subir
              </AppText>
            </Pressable>
            <Pressable style={styles.action} onPress={() => moveAccountGroup(db, editingId, 1)}>
              <Feather name="arrow-down" size={16} color={colors.text} />
              <AppText weight="bold" size={14}>
                Bajar
              </AppText>
            </Pressable>
            <Pressable style={styles.action} onPress={remove}>
              <Feather name="trash-2" size={16} color={colors.danger} />
              <AppText weight="bold" size={14} color={colors.danger}>
                Eliminar
              </AppText>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: keyboard.inset > 0 ? 12 : insets.bottom + 12 }]}>
        <Pressable onPress={save} disabled={!name.trim()} style={[styles.saveButton, !name.trim() && styles.disabled]}>
          <Feather name="check" size={20} color={colors.surface} />
          <AppText weight="bold" size={17} color={colors.surface}>
            Guardar
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 30,
    textAlign: 'center',
    padding: 0,
    minWidth: 48,
    color: colors.text,
  },
  name: {
    flex: 1,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    color: colors.text,
    padding: 0,
    includeFontPadding: false,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  bottom: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
