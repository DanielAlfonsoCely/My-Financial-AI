import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiError, askChat, type ChatMessage, isAiConfigured } from '../src/ai/pipeline';
import { AppText } from '../src/components/AppText';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { getCurrentListId } from '../src/db/repo';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { colors, fonts, radius } from '../src/theme';

const SUGGESTIONS = [
  '¿Cuánto gasté este mes?',
  '¿En qué categoría gasto más?',
  'Compara este mes con el anterior',
  '¿Cuánto llevo en comida los últimos 3 meses?',
];

/** Financial chat (the 💬 button): Gemini answers from a summary of the current list. */
export default function ChatScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    isAiConfigured().then(setAiReady);
  }, []);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || thinking) return;
    const history = messages;
    setMessages([...history, { role: 'user', text: q }]);
    setText('');
    setThinking(true);
    try {
      const listId = await getCurrentListId(db);
      const answer = await askChat(db, listId, history, q);
      setMessages((m) => [...m, { role: 'assistant', text: answer }]);
    } catch (error) {
      const message = error instanceof AiError ? error.message : 'No pude responder. Intenta de nuevo.';
      setMessages((m) => [...m, { role: 'assistant', text: message }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <ScreenHeader title="Chat" subtitle="Pregúntale a tus finanzas" />

      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {aiReady === false && (
          <View style={styles.notice}>
            <AppText size={14} color={colors.textMuted}>
              Para usar el chat, agrega tu clave de Gemini.
            </AppText>
            <Pressable onPress={() => router.push('/ai')} style={styles.noticeButton}>
              <AppText weight="bold" size={14} color={colors.surface}>
                Agregar clave
              </AppText>
            </Pressable>
          </View>
        )}
        {messages.length === 0 && aiReady && (
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => send(s)} style={styles.suggestion}>
                <AppText weight="semibold" size={14}>
                  {s}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? styles.user : styles.assistant]}>
            <AppText size={15} color={m.role === 'user' ? colors.surface : colors.text}>
              {m.text}
            </AppText>
          </View>
        ))}
        {thinking && (
          <View style={[styles.bubble, styles.assistant]}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputRow, { paddingBottom: keyboard.inset > 0 ? 10 : insets.bottom + 10 }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Escribe tu pregunta"
          placeholderTextColor={colors.textFaint}
          editable={aiReady !== false}
          multiline
          style={styles.input}
        />
        <Pressable onPress={() => send(text)} disabled={!text.trim() || thinking} style={[styles.send, (!text.trim() || thinking) && styles.disabled]}>
          <Feather name="arrow-up" size={20} color={colors.surface} />
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
  messages: {
    padding: 16,
    gap: 10,
    flexGrow: 1,
  },
  notice: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 10,
  },
  noticeButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: '#2C2C2E',
  },
  suggestions: {
    gap: 8,
    marginTop: 'auto',
  },
  suggestion: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.chip,
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  user: {
    alignSelf: 'flex-end',
    backgroundColor: '#2C2C2E',
  },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
