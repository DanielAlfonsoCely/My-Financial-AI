import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { suggestEmojisLocally } from '../src/ai/emoji';
import { suggestEmojis } from '../src/ai/pipeline';
import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import {
  CategoryInUseError,
  createCategory,
  deleteCategory,
  getCategory,
  getCurrentListId,
  updateCategory,
} from '../src/db/repo';
import type { Kind } from '../src/db/types';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { notifyCategoryCreated } from '../src/lib/events';
import { showToast } from '../src/lib/toast';
import { categoryPalette, colors, fonts, radius } from '../src/theme';

const TILE = 128;

type Params = { id?: string; kind?: string; listId?: string };

/**
 * Create or edit a category (Video Yt/03 and 14): big emoji tile you can swipe through suggested
 * emojis (dots below), the name in big bold, a color row and "✓ Guardar".
 * The tile turns pastel with the chosen color, like MonAi.
 */
export default function CategoryScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const params = useLocalSearchParams<Params>();
  const editingId = typeof params.id === 'string' && params.id ? params.id : null;

  const [listId, setListId] = useState<string | null>(typeof params.listId === 'string' && params.listId ? params.listId : null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>(params.kind === 'income' ? 'income' : 'expense');
  const [color, setColor] = useState<string>(categoryPalette[Math.floor(Math.random() * categoryPalette.length)]);
  const [emojis, setEmojis] = useState<string[]>(() => suggestEmojisLocally(''));
  const [index, setIndex] = useState(0);
  const [customEmoji, setCustomEmoji] = useState('');
  const [saving, setSaving] = useState(false);
  const pager = useRef<ScrollViewInstance>(null);
  const touchedEmoji = useRef(false);

  useEffect(() => {
    if (!listId && !editingId) getCurrentListId(db).then(setListId);
  }, [db, listId, editingId]);

  useEffect(() => {
    if (!editingId) return;
    getCategory(db, editingId).then((c) => {
      if (!c) {
        router.back();
        return;
      }
      setListId(c.list_id);
      setName(c.name);
      setKind(c.kind);
      setColor(c.color);
      touchedEmoji.current = true;
      setEmojis((current) => [c.emoji, ...current.filter((e) => e !== c.emoji)]);
    });
  }, [db, editingId]);

  // Suggestions follow the name (local right away, Gemini when the key exists), unless the user
  // already picked an emoji by hand.
  useEffect(() => {
    if (touchedEmoji.current || !name.trim()) return;
    setEmojis(suggestEmojisLocally(name));
    const timer = setTimeout(async () => {
      const next = await suggestEmojis(name);
      if (!touchedEmoji.current) {
        setEmojis(next);
        setIndex(0);
        pager.current?.scrollTo({ x: 0, animated: false });
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [name]);

  const emoji = customEmoji.trim() || emojis[index] || '📦';

  const save = async () => {
    if (!listId || saving) return;
    setSaving(true);
    const input = { name, emoji, color, kind };
    try {
      if (editingId) {
        await updateCategory(db, editingId, input);
      } else {
        const id = await createCategory(db, listId, input);
        notifyCategoryCreated(id);
      }
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert('Eliminar categoría', `¿Eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCategory(db, editingId);
            router.back();
          } catch (error) {
            if (error instanceof CategoryInUseError) {
              showToast({ kind: 'error', title: 'No se puede eliminar la categoría', subtitle: error.message });
            } else {
              Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : String(error));
            }
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <View style={styles.header}>
        {editingId ? (
          <IconButton icon="trash-2" label="Eliminar" color={colors.danger} background={colors.surface} style={styles.softShadow} onPress={remove} />
        ) : (
          <View />
        )}
        <IconButton icon="x" label="Cerrar" background={colors.surface} style={styles.softShadow} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.tile, { backgroundColor: color }]}>
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              touchedEmoji.current = true;
              setCustomEmoji('');
              setIndex(Math.round(e.nativeEvent.contentOffset.x / TILE));
            }}
          >
            {(customEmoji.trim() ? [customEmoji.trim()] : emojis).map((e, i) => (
              <View key={`${e}-${i}`} style={styles.tilePage}>
                <AppText size={56}>{e}</AppText>
              </View>
            ))}
          </ScrollView>
          {!customEmoji.trim() && emojis.length > 1 && (
            <View style={styles.dots} pointerEvents="none">
              {emojis.map((e, i) => (
                <View key={`${e}-${i}`} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
        <AppText size={12} color={colors.textMuted}>
          Desliza el cuadro para ver más emojis
        </AppText>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nombre"
          placeholderTextColor={colors.textFaint}
          autoFocus={!editingId}
          maxLength={30}
          style={styles.name}
        />

        {!editingId && (
          <View style={styles.segment}>
            {(['expense', 'income'] as const).map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} style={[styles.segmentItem, kind === k && { backgroundColor: k === 'income' ? colors.income : colors.accent }]}>
                <AppText weight="bold" size={13} color={kind === k ? colors.surface : colors.textMuted}>
                  {k === 'expense' ? 'Gasto' : 'Ingreso'}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}

        <AppText weight="semibold" size={13} color={colors.textMuted}>
          Color
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colors}>
          {categoryPalette.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} style={[styles.colorRing, c === color && styles.colorRingActive]} accessibilityLabel={`Color ${c}`}>
              <View style={[styles.colorDot, { backgroundColor: c }]} />
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.customRow}>
          <Feather name="smile" size={18} color={colors.textMuted} />
          <TextInput
            value={customEmoji}
            onChangeText={(text) => {
              touchedEmoji.current = true;
              setCustomEmoji(text.trim().slice(0, 8));
            }}
            placeholder="O escribe tu propio emoji"
            placeholderTextColor={colors.textFaint}
            style={styles.customInput}
          />
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: keyboard.inset > 0 ? 12 : insets.bottom + 12 }]}>
        <Pressable onPress={save} disabled={!name.trim() || saving} style={[styles.saveButton, (!name.trim() || saving) && styles.disabled]}>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  softShadow: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 28,
    overflow: 'hidden',
  },
  tilePage: {
    width: TILE,
    height: TILE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  dotActive: {
    backgroundColor: colors.text,
  },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    color: colors.text,
    padding: 0,
    marginTop: 8,
  },
  segment: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.chip,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  colors: {
    gap: 8,
  },
  colorRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorRingActive: {
    borderColor: colors.text,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.chip,
  },
  customInput: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
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
