import { Feather } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiError, type CaptureResult, createFromAudio, createFromText, isAiConfigured } from '../src/ai/pipeline';
import { AppText } from '../src/components/AppText';
import { TransactionRow } from '../src/components/TransactionRow';
import { deleteTransaction, getCurrentListId, getTransaction } from '../src/db/repo';
import type { TransactionWithCategory } from '../src/db/types';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { onDataChanged } from '../src/lib/events';
import { formatMoney } from '../src/lib/money';
import { withSystemDialog } from '../src/lib/security';
import { checkBudgetAlerts } from '../src/lib/budgetAlert';
import { showToast } from '../src/lib/toast';
import { colors, fonts, radius } from '../src/theme';

/** Mono, 16 kHz, 32 kbps AAC: small uploads and enough quality for speech. */
const VOICE_RECORDING = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16_000, numberOfChannels: 1, bitRate: 32_000 };
const MAX_SECONDS = 60;

type Phase = 'starting' | 'recording' | 'typing' | 'processing' | 'summary';

/**
 * Voice entry (Video Yt/08): full-screen gradient, ✕ bottom left, red ✓ bottom right.
 * - Speak and tap ✓: Gemini transcribes and extracts every movement in one call.
 * - Or tap "Escribir" and type: the local parser handles it (Gemini only for complex phrases).
 * Movements are saved right away. One movement opens its sheet; several show a summary.
 */
export default function VoiceScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const params = useLocalSearchParams<{ mode?: string }>();
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const [phase, setPhase] = useState<Phase>(params.mode === 'text' ? 'typing' : 'starting');
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState('');
  const [aiReady, setAiReady] = useState(true);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [rows, setRows] = useState<TransactionWithCategory[]>([]);
  const pulse = useRef(new Animated.Value(0)).current;
  const recording = useRef(false);
  // False once the screen closes: async work that finishes later must not navigate or record.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // Start recording as soon as the screen opens (unless there is no key: then typing).
  useEffect(() => {
    if (phase !== 'starting') return;
    let cancelled = false;
    const alive = () => !cancelled && mounted.current;
    (async () => {
      const ready = await isAiConfigured();
      if (!alive()) return;
      setAiReady(ready);
      if (!ready) {
        setPhase('typing');
        return;
      }
      const permission = await withSystemDialog(() => requestRecordingPermissionsAsync());
      if (!alive()) return;
      if (!permission.granted) {
        Alert.alert('Sin micrófono', 'Activa el permiso de micrófono en los ajustes del celular, o escribe el movimiento.');
        setPhase('typing');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!alive()) return;
      recorder.record();
      recording.current = true;
      setSeconds(0);
      setPhase('recording');
    })().catch(() => {
      if (alive()) setPhase('typing');
    });
    return () => {
      cancelled = true;
    };
  }, [phase, recorder]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
  }, [phase, pulse]);

  // Stop at 60 s automatically.
  useEffect(() => {
    if (phase === 'recording' && seconds >= MAX_SECONDS) stopAndSend();
    // stopAndSend reads current state; only the time matters here.
  }, [seconds]);

  // Never leave the microphone on when the screen closes.
  useEffect(
    () => () => {
      if (recording.current) recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  const showResult = async (capture: CaptureResult) => {
    void checkBudgetAlerts(db, capture.created.map((c) => ({ id: c.id })));
    // The movements are saved; if the user already left, a toast is enough.
    if (!mounted.current) {
      showToast({ kind: 'success', emoji: '✅', title: `${capture.created.length} movimiento${capture.created.length === 1 ? '' : 's'} agregado${capture.created.length === 1 ? '' : 's'}` });
      return;
    }
    if (capture.created.length === 1) {
      const m = capture.created[0];
      const saved = await getTransaction(db, m.id);
      if (!mounted.current) return;
      showToast({
        kind: 'success',
        emoji: saved?.category_emoji ?? (m.kind === 'income' ? '💵' : '🧾'),
        color: saved?.category_color ?? undefined,
        title: saved?.category_name ?? m.title,
        chip: `${m.kind === 'income' ? '+' : '-'} ${formatMoney(m.amount)}`,
      });
      router.replace({ pathname: '/transaction', params: { id: m.id } });
      return;
    }
    const loaded = await Promise.all(capture.created.map((c) => getTransaction(db, c.id)));
    setRows(loaded.filter((r): r is TransactionWithCategory => r !== null));
    setResult(capture);
    setPhase('summary');
  };

  // Edits made from the summary show up when coming back.
  useEffect(() => {
    if (!result) return;
    const ids = result.created.map((c) => c.id);
    return onDataChanged(async () => {
      const loaded = await Promise.all(ids.map((id) => getTransaction(db, id)));
      setRows(loaded.filter((r): r is TransactionWithCategory => r !== null));
    });
  }, [db, result]);

  const fail = (error: unknown, back: Phase) => {
    if (!mounted.current) return;
    const message = error instanceof AiError ? error.message : 'Algo salió mal. Intenta de nuevo.';
    Alert.alert('No pude crear el movimiento', message);
    setPhase(back);
  };

  const stopAndSend = async () => {
    if (!recording.current) return;
    recording.current = false;
    setPhase('processing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new AiError('No se pudo guardar la grabación.', 'format');
      const listId = await getCurrentListId(db);
      await showResult(await createFromAudio(db, listId, uri));
    } catch (error) {
      fail(error, 'typing');
    }
  };

  const sendText = async () => {
    if (!text.trim()) return;
    setPhase('processing');
    try {
      const listId = await getCurrentListId(db);
      await showResult(await createFromText(db, listId, text.trim()));
    } catch (error) {
      fail(error, 'typing');
    }
  };

  const cancel = async () => {
    if (recording.current) {
      recording.current = false;
      await recorder.stop().catch(() => undefined);
    }
    router.back();
  };

  const switchToTyping = async () => {
    if (recording.current) {
      recording.current = false;
      await recorder.stop().catch(() => undefined);
    }
    setPhase('typing');
  };

  const removeRow = (id: string) => {
    Alert.alert('Eliminar movimiento', '¿Lo quito?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, id);
          setRows((current) => current.filter((r) => r.id !== id));
        },
      },
    ]);
  };

  if (phase === 'summary' && result) {
    return (
      <View style={[styles.summary, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.summaryHeader}>
          <AppText weight="extrabold" size={26}>
            Listo, agregué {rows.length} movimientos
          </AppText>
          {result.transcript !== '' && (
            <AppText size={14} color={colors.textMuted}>
              “{result.transcript}”
            </AppText>
          )}
          <AppText size={13} color={colors.textMuted}>
            Toca uno para editarlo.
          </AppText>
        </View>
        <ScrollView contentContainerStyle={styles.summaryList}>
          {rows.map((r) => (
            <View key={r.id} style={styles.summaryRow}>
              <View style={styles.flex}>
                <TransactionRow transaction={r} onPress={() => router.push({ pathname: '/transaction', params: { id: r.id } })} />
              </View>
              <Pressable onPress={() => removeRow(r.id)} hitSlop={8} style={styles.trash} accessibilityLabel="Eliminar">
                <Feather name="trash-2" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <Pressable onPress={() => router.back()} style={styles.doneButton}>
          <Feather name="check" size={20} color={colors.surface} />
          <AppText weight="bold" size={17} color={colors.surface}>
            Listo
          </AppText>
        </Pressable>
      </View>
    );
  }

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });

  return (
    <View style={styles.flex} onLayout={keyboard.onLayout}>
      <LinearGradient colors={['#F0605A', '#D9666D', '#B98199']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />

      <View style={[styles.center, { paddingTop: insets.top + 24 }]}>
        {phase === 'recording' && (
          <>
            <Animated.View style={[styles.halo, { transform: [{ scale }] }]} />
            <AppText weight="extrabold" size={34} color={colors.surface} style={styles.centerText}>
              Te escucho…
            </AppText>
            <AppText weight="semibold" size={15} color="rgba(255,255,255,0.85)" style={styles.centerText}>
              0:{String(seconds).padStart(2, '0')} · di algo como “almuerzo 18 mil y uber 12 mil”
            </AppText>
          </>
        )}
        {(phase === 'starting' || phase === 'processing') && (
          <>
            <ActivityIndicator color={colors.surface} size="large" />
            <AppText weight="bold" size={20} color={colors.surface} style={styles.centerText}>
              {phase === 'processing' ? 'Creando tus movimientos…' : 'Preparando el micrófono…'}
            </AppText>
            {phase === 'processing' && text.trim() !== '' && (
              <AppText weight="extrabold" size={28} color={colors.surface} style={styles.centerText}>
                {text.trim()}
              </AppText>
            )}
          </>
        )}
        {phase === 'typing' && (
          <>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ej: almuerzo 18 mil y uber 12.500 ayer"
              placeholderTextColor="rgba(255,255,255,0.6)"
              autoFocus
              multiline
              style={styles.typing}
            />
            {!aiReady && (
              <AppText size={13} color="rgba(255,255,255,0.85)" style={styles.centerText}>
                Para dictar con la voz, agrega tu clave de Gemini en Configuración → Inteligencia artificial.
              </AppText>
            )}
          </>
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: keyboard.inset > 0 ? keyboard.inset + 16 : insets.bottom + 24 }]}>
        <Pressable onPress={cancel} style={styles.cancel} accessibilityLabel="Cancelar">
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
        {phase === 'recording' && (
          <Pressable onPress={switchToTyping} style={styles.typeButton} accessibilityLabel="Escribir en vez de hablar">
            <Feather name="type" size={18} color={colors.surface} />
            <AppText weight="bold" size={14} color={colors.surface}>
              Escribir
            </AppText>
          </Pressable>
        )}
        {phase === 'typing' && aiReady && (
          <Pressable onPress={() => setPhase('starting')} style={styles.typeButton} accessibilityLabel="Hablar">
            <Feather name="mic" size={18} color={colors.surface} />
            <AppText weight="bold" size={14} color={colors.surface}>
              Hablar
            </AppText>
          </Pressable>
        )}
        <Pressable
          onPress={phase === 'recording' ? stopAndSend : sendText}
          disabled={phase === 'processing' || phase === 'starting' || (phase === 'typing' && !text.trim())}
          style={[styles.send, (phase === 'typing' && !text.trim()) && styles.sendDisabled]}
          accessibilityLabel="Listo"
        >
          <Feather name="check" size={30} color={colors.surface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  centerText: {
    textAlign: 'center',
  },
  halo: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  typing: {
    alignSelf: 'stretch',
    fontFamily: fonts.extrabold,
    fontSize: 30,
    color: colors.surface,
    textAlign: 'center',
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  cancel: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  send: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  sendDisabled: {
    opacity: 0.5,
  },
  summary: {
    flex: 1,
    backgroundColor: colors.background,
  },
  summaryHeader: {
    paddingHorizontal: 24,
    gap: 6,
    paddingBottom: 12,
  },
  summaryList: {
    paddingBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  trash: {
    padding: 8,
  },
  doneButton: {
    marginHorizontal: 16,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: '#2C2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
