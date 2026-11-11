import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { PinPad } from '../components/PinPad';
import {
  applyScreenProtection,
  authenticateWithBiometrics,
  getBlockedUntil,
  getSecurityConfig,
  isAuthPromptOpen,
  recoverWithDevice,
  type SecurityConfig,
  verifyPin,
} from '../lib/security';
import { colors } from '../theme';

interface LockContextValue {
  config: SecurityConfig | null;
  /** Re-read the config after changing it in Seguridad. */
  reloadConfig: () => Promise<void>;
}

const LockContext = createContext<LockContextValue>({ config: null, reloadConfig: async () => {} });

export function useLock(): LockContextValue {
  return useContext(LockContext);
}

interface Props {
  children: ReactNode;
  /** Called once the lock state is known, so the splash can hide without flashing the data. */
  onReady: () => void;
}

/**
 * Shows the lock screen on launch and when the app comes back from the background after the
 * configured delay. It is a native Modal, so it covers every screen, including open sheets.
 */
export function LockProvider({ children, onReady }: Props) {
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const backgroundSince = useRef<number | null>(null);
  const configRef = useRef<SecurityConfig | null>(null);

  const reloadConfig = useCallback(async () => {
    const next = await getSecurityConfig();
    configRef.current = next;
    setConfig(next);
    await applyScreenProtection(next);
  }, []);

  useEffect(() => {
    getSecurityConfig().then((initial) => {
      configRef.current = initial;
      setConfig(initial);
      setLocked(initial.pinEnabled);
      applyScreenProtection(initial);
      onReady();
    });
    // Only the first load matters here; onReady is not expected to change.
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const current = configRef.current;
      if (!current?.pinEnabled || isAuthPromptOpen()) return;
      if (state === 'background') {
        backgroundSince.current ??= Date.now();
      } else if (state === 'active') {
        const since = backgroundSince.current;
        backgroundSince.current = null;
        if (since !== null && Date.now() - since >= current.lockAfterMs) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <LockContext.Provider value={{ config, reloadConfig }}>
      {children}
      <Modal
        visible={locked}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          // Android back must not dismiss the lock.
        }}
      >
        {config && <LockScreen config={config} onUnlock={() => setLocked(false)} onPinCleared={reloadConfig} />}
      </Modal>
    </LockContext.Provider>
  );
}

interface LockScreenProps {
  config: SecurityConfig;
  onUnlock: () => void;
  /** The stored PIN was unreadable and has been removed after confirming with the phone's lock. */
  onPinCleared: () => Promise<void>;
}

function LockScreen({ config, onUnlock, onPinCleared }: LockScreenProps) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const tryBiometrics = useCallback(async () => {
    if (!config.biometricsEnabled) return;
    if (await authenticateWithBiometrics('Desbloquear My Financial AI')) onUnlock();
  }, [config.biometricsEnabled, onUnlock]);

  // Open the fingerprint prompt right away, like a banking app.
  useEffect(() => {
    getBlockedUntil().then(setBlockedUntil);
    tryBiometrics();
  }, [tryBiometrics]);

  useEffect(() => {
    if (blockedUntil <= now) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [blockedUntil, now]);

  const blocked = blockedUntil > now;
  const seconds = Math.ceil((blockedUntil - now) / 1000);

  const submit = async (pin: string) => {
    const result = await verifyPin(pin);
    if (result.ok) {
      setError(null);
      onUnlock();
      return true;
    }
    if (result.corrupted) {
      setError('No se pudo leer tu PIN guardado. Toca "¿Olvidaste tu PIN?" para entrar con el bloqueo del celular.');
    } else if (result.blockedUntil > Date.now()) {
      setBlockedUntil(result.blockedUntil);
      setNow(Date.now());
      setError(null);
    } else {
      setError(
        result.attemptsLeft <= 2
          ? `PIN incorrecto. Te quedan ${result.attemptsLeft} intentos antes de una espera.`
          : 'PIN incorrecto',
      );
    }
    return false;
  };

  const forgot = async () => {
    const result = await recoverWithDevice();
    if (!result.ok) return;
    if (result.pinCleared) await onPinCleared();
    onUnlock();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      <PinPad
        title="Ingresa tu PIN"
        subtitle={config.biometricsEnabled ? 'o usa tu huella' : undefined}
        error={blocked ? `Demasiados intentos. Espera ${seconds} s.` : error}
        disabled={blocked}
        onComplete={submit}
        onBiometric={config.biometricsEnabled ? tryBiometrics : undefined}
      />
      <Pressable onPress={forgot} hitSlop={10} style={styles.forgot}>
        <AppText weight="semibold" size={14} color={colors.textMuted}>
          ¿Olvidaste tu PIN?
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  forgot: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
});
