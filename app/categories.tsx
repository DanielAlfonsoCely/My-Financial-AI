import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryGrid } from '../src/components/CategoryGrid';
import { LoadError } from '../src/components/LoadError';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { listCategories } from '../src/db/repo';
import type { Category } from '../src/db/types';
import { listLabel, useCurrentList, useQuery } from '../src/hooks/useData';
import { colors } from '../src/theme';

/**
 * "Editar categorías" (Video Yt/27): the same grid as the onboarding, every category in its color,
 * in alphabetical order. Tap one to edit it; "+" adds a new one.
 */
export default function CategoriesScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { listId, list } = useCurrentList();
  const { data: categories, error, reload } = useQuery(() => listCategories(db, listId), [] as Category[], [db, listId]);
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Elige tus categorías" subtitle={`En tu lista actual "${listLabel(list)}" · toca una para editarla`} />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
        {error && <LoadError onRetry={reload} />}
        <CategoryGrid
          items={sorted.map((c) => ({ key: c.id, emoji: c.emoji, name: c.name, color: c.color, selected: true }))}
          onPress={(id) => router.push({ pathname: '/category', params: { id } })}
          onAdd={() => router.push({ pathname: '/category', params: { listId } })}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
