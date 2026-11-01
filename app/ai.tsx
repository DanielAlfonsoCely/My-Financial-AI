import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AI_MODELS, getApiKey, getModel, maskKey, setApiKey, setModel } from '../src/ai/config';
import { AiError, testConnection } from '../src/ai/pipeline';
import { AppText } from '../src/components/AppText';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { colors, fonts, radius } from '../src/theme';

/**
 * Gemini key and model. The key is stored encrypted in the phone (SecureStore), never in the repo
 * or in backups. Get one free at aistudio.google.com/apikey.
 */
export default function AiSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [model, setModelState] = useState<string>(AI_MODELS[0].id);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getApiKey().then(setSaved);
    getModel().then(setModelState);
  }, []);

  const save = async () => {
    const key = draft.trim();
    if (!key) return;
    setTesting(true);
    try {
      await testConnection(key, model);
      await setApiKey(key);
      setSaved(key);
      setDraft('');
      Alert.alert('Listo', 'La clave funciona. Ya puedes usar la voz, el chat y la IA.');
    } catch (error) {
      const message = error instanceof AiError ? error.message : 'No se pudo probar la clave.';
      Alert.alert('La clave no funcionó', message, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar igual',
          onPress: async () => {
            await setApiKey(key);
            setSaved(key);
            setDraft('');
          },
        },
      ]);
    } finally {
      setTesting(false);
    }
  };

  const test = async () => {
    if (!saved) return;
    setTesting(true);
    try {
      await testConnection(saved, model);
      Alert.alert('Todo bien', 'Gemini respondió correctamente.');
    } catch (error) {
      Alert.alert('No funcionó', error instanceof AiError ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  };

  const remove = () => {
    Alert.alert('Quitar la clave', 'La voz, el chat y la IA dejarán de funcionar hasta que pongas otra.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await setApiKey('');
          setSaved(null);
        },
      },
    ]);
  };

  const chooseModel = async (id: string) => {
    setModelState(id);
    await setModel(id);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Inteligencia artificial" subtitle="Gemini de Google, plan gratis" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <AppText weight="bold" size={15}>
            Clave de la API
          </AppText>
          {saved ? (
            <View style={styles.savedRow}>
              <Feather name="check-circle" size={18} color={colors.income} />
              <AppText weight="semibold" size={15} style={styles.flex}>
                Guardada · {maskKey(saved)}
              </AppText>
              <Pressable onPress={remove} hitSlop={8}>
                <AppText weight="semibold" size={14} color={colors.danger}>
                  Quitar
                </AppText>
              </Pressable>
            </View>
          ) : (
            <AppText size={13} color={colors.textMuted}>
              Créala gratis en aistudio.google.com/apikey (con tu cuenta de Google, sin tarjeta) y pégala aquí.
            </AppText>
          )}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={saved ? 'Pegar otra clave' : 'Pega tu clave aquí'}
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <View style={styles.buttons}>
            <Pressable onPress={save} disabled={!draft.trim() || testing} style={[styles.button, styles.primary, (!draft.trim() || testing) && styles.disabled]}>
              <AppText weight="bold" size={15} color={colors.surface}>
                Probar y guardar
              </AppText>
            </Pressable>
            {saved && (
              <Pressable onPress={test} disabled={testing} style={[styles.button, styles.secondary]}>
                <AppText weight="bold" size={15}>
                  Probar
                </AppText>
              </Pressable>
            )}
            {testing && <ActivityIndicator color={colors.textMuted} />}
          </View>
        </View>

        <AppText weight="semibold" size={13} color={colors.textMuted} style={styles.section}>
          Modelo
        </AppText>
        {AI_MODELS.map((m) => (
          <Pressable key={m.id} onPress={() => chooseModel(m.id)} style={[styles.option, model === m.id && styles.optionActive]}>
            <View style={styles.flex}>
              <AppText weight="bold" size={15}>
                {m.label}
              </AppText>
              <AppText size={12} color={colors.textMuted}>
                {m.hint}
              </AppText>
            </View>
            {model === m.id && <Feather name="check" size={18} color={colors.text} />}
          </Pressable>
        ))}

        <AppText size={12} color={colors.textMuted} style={styles.note}>
          Qué se envía a Gemini: lo que dictas o escribes, títulos, montos, fechas y nombres de categorías y etiquetas.
          Nunca se envían saldos de cuentas, números de tarjeta ni el texto de notificaciones del banco. En el plan gratis
          Google puede usar estos datos para mejorar sus productos.
        </AppText>
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
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.chip,
    paddingHorizontal: 14,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#2C2C2E',
  },
  secondary: {
    backgroundColor: colors.chip,
  },
  disabled: {
    opacity: 0.35,
  },
  section: {
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionActive: {
    borderColor: colors.text,
    backgroundColor: colors.surface,
  },
  note: {
    paddingTop: 12,
    paddingHorizontal: 4,
  },
});
