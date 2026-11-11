import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { headerButtonShadow, ScreenHeader } from '../src/components/ScreenHeader';
import { setSetting, SETTING_CURRENT_LIST } from '../src/db/repo';
import { useCurrentList } from '../src/hooks/useData';
import { colors } from '../src/theme';

/**
 * "Tus listas" (Video Yt/30): each list is a separate world with its own categories, tags and
 * budgets. Tap to switch, long press to rename or delete. Sharing is not built yet.
 */
export default function ListsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { listId, lists } = useCurrentList();

  const choose = async (id: string) => {
    await setSetting(db, SETTING_CURRENT_LIST, id);
    router.back();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader
        title="Tus listas"
        subtitle="Elige tu lista actual · mantén presionada para editar"
        actions={<IconButton icon="plus" label="Nueva lista" background={colors.surface} style={headerButtonShadow} onPress={() => router.push('/list-edit')} />}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {lists.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => choose(l.id)}
            onLongPress={() => router.push({ pathname: '/list-edit', params: { id: l.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.bubble}>
              <AppText size={24}>🤫</AppText>
            </View>
            <View style={styles.texts}>
              <AppText weight="bold" size={17}>
                {l.emoji ? `${l.emoji} ${l.name}` : l.name}
              </AppText>
              <View style={styles.owner}>
                <Feather name="user" size={12} color={colors.textMuted} />
                <AppText size={12} color={colors.textMuted}>
                  Solo tú
                </AppText>
              </View>
            </View>
            {l.id === listId && <Feather name="check" size={20} color={colors.text} />}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  pressed: {
    backgroundColor: colors.chip,
  },
  bubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  owner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
