import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { normalizeTag } from '../../lib/tags';
import { colors, fonts, radius } from '../../theme';
import { AppText } from '../AppText';

export interface SearchQuery {
  text: string;
  tags: string[];
}

interface Props {
  query: SearchQuery;
  onChange: (query: SearchQuery) => void;
  onClose: () => void;
}

/**
 * Bottom search field (Video Yt/25–26). Typing "#ropadeverano " turns into a tag chip, so text,
 * categories and several tags can be combined. Tapping a chip removes it.
 */
export function SearchBar({ query, onChange, onClose }: Props) {
  const handleText = (value: string) => {
    const tagMatch = /(?:^|\s)#(\S+)\s$/.exec(value);
    if (tagMatch) {
      const tag = normalizeTag(tagMatch[1]);
      const rest = value.slice(0, tagMatch.index).trimEnd();
      onChange({ text: rest ? `${rest} ` : '', tags: tag && !query.tags.includes(tag) ? [...query.tags, tag] : query.tags });
      return;
    }
    onChange({ ...query, text: value });
  };

  return (
    <View style={styles.row}>
      <View style={[styles.field, styles.shadow]}>
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
          {query.tags.map((t) => (
            <Pressable key={t} onPress={() => onChange({ ...query, tags: query.tags.filter((x) => x !== t) })} style={styles.chip}>
              <AppText weight="semibold" size={15}>
                #{t}
              </AppText>
            </Pressable>
          ))}
          <TextInput
            value={query.text}
            onChangeText={handleText}
            placeholder="Buscar"
            placeholderTextColor={colors.textFaint}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
          />
        </ScrollView>
      </View>
      <Pressable onPress={onClose} style={[styles.close, styles.shadow]} accessibilityLabel="Cerrar búsqueda">
        <Feather name="x" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  field: {
    flex: 1,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: '#E4E4E8',
  },
  input: {
    minWidth: 160,
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.text,
    paddingVertical: 0,
  },
  close: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
