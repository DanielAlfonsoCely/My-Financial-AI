import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { IconButton } from '../src/components/IconButton';
import { PinPad } from '../src/components/PinPad';
import { SettingsRow } from '../src/components/SettingsRow';
import {
  authenticateWithBiometrics,
  type BiometricAvailability,
  clearPin,
  getBiometricAvailability,
  LOCK_AFTER_OPTIONS,
  setBiometricsEnabled,
  recoverWithDevice,
  setHideContent,
  setLockAfter,
  setPin,
  verifyPin,
} from '../src/lib/security';
import { useLock } from '../src/security/LockProvider';
import { colors, radius } from '../src/theme';

type Step =
  | { kind: 'verify'; then: 'disable' | 'change' }
  | { kind: 'new'; first?: string };

const BIOMETRIC_HINT: Record<BiometricAvailability, string> = {
  available: 'Desbloquea con tu huella en vez del PIN',
  'no-hardware': 'Este celular no tiene lector de huella',
  'not-enrolled': 'Primero registra una huella en los ajustes del celular',
};

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();
  const { config, reloadConfig } = useLock();
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bioAvailability, setBioAvailability] = useState<BiometricAvailability>('available');

  useEffect(() => {
    getBiometricAvailability().then(setBioAvailability);
  }, []);

  if (!config) return null;

  const close = () => {
    if (!step) {
      router.back();
      return;
    }
    setStep(null);
    setError(null);
  };

  const togglePin = (value: boolean) => {
    setError(null);
    setStep(value ? { kind: 'new' } : { kind: 'verify', then: 'disable' });
  };

  const toggleBiometrics = async (value: boolean) => {
    if (value) {
      // Confirm the finger works before relying on it.
      const ok = await authenticateWithBiometrics('Confirma tu huella');
      if (!ok) return;
    }
    await setBiometricsEnabled(value);
    await reloadConfig();
  };

  const toggleHideContent = async (value: boolean) => {
    await setHideContent(value);
    await reloadConfig();
  };

  const chooseLockAfter = async (ms: number) => {
    await setLockAfter(ms);
    await reloadConfig();
  };

  const handlePin = async (pin: string): Promise<boolean> => {
    if (!step) return false;

    if (step.kind === 'verify') {
      const result = await verifyPin(pin);
      if (!result.ok && result.corrupted) {
        // The saved PIN cannot be read, so no PIN will ever match: the phone's own lock decides.
        const recovered = await recoverWithDevice();
        if (recovered.ok) {
          await reloadConfig();
          setError(null);
          setStep(null);
          return true;
        }
        setError('No se pudo leer tu PIN guardado. Confirma con el bloqueo del celular.');
        return false;
      }
      if (!result.ok) {
        setError(result.blockedUntil > Date.now() ? 'Demasiados intentos. Espera un momento.' : 'PIN incorrecto');
        return false;
      }
      setError(null);
      if (step.then === 'disable') {
        await clearPin();
        await reloadConfig();
        setStep(null);
      } else {
        setStep({ kind: 'new' });
      }
      return true;
    }

    if (!step.first) {
      setError(null);
      setStep({ kind: 'new', first: pin });
      return true;
    }
    if (step.first !== pin) {
      setError('Los PIN no coinciden. Empieza de nuevo.');
      setStep({ kind: 'new' });
      return false;
    }
    await setPin(pin);
    await reloadConfig();
    setError(null);
    setStep(null);
    if (!config.pinEnabled && bioAvailability === 'available') {
      Alert.alert('PIN creado', '¿Quieres activar también el desbloqueo con huella?', [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Activar', onPress: () => toggleBiometrics(true) },
      ]);
    }
    return true;
  };

  const pinTitle = !step
    ? ''
    : step.kind === 'verify'
      ? 'Ingresa tu PIN actual'
      : step.first
        ? 'Confirma tu PIN'
        : 'Crea un PIN de 4 dígitos';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.header}>
        <AppText weight="extrabold" size={26}>
          {step ? '' : 'Seguridad'}
        </AppText>
        <IconButton icon={step ? 'arrow-left' : 'x'} label="Cerrar" background={colors.surface} onPress={close} />
      </View>

      {step ? (
        <PinPad title={pinTitle} error={error} onComplete={handlePin} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <AppText size={14} color={colors.textMuted} style={styles.intro}>
            Pide un PIN o tu huella cada vez que abras la app. El PIN se guarda cifrado en este celular y no
            va en los respaldos.
          </AppText>

          <View style={styles.card}>
            <SettingsRow
              emoji="🔒"
              title="Bloqueo con PIN"
              subtitle={config.pinEnabled ? 'Activado' : 'La app abre sin pedir nada'}
              right={
                <Switch
                  value={config.pinEnabled}
                  onValueChange={togglePin}
                  trackColor={{ true: colors.income, false: colors.border }}
                  thumbColor={colors.surface}
                />
              }
            />
            <SettingsRow
              emoji="☝️"
              title="Desbloquear con huella"
              subtitle={config.pinEnabled ? BIOMETRIC_HINT[bioAvailability] : 'Primero activa el PIN'}
              disabled={!config.pinEnabled || bioAvailability !== 'available'}
              right={
                <Switch
                  value={config.biometricsEnabled}
                  onValueChange={toggleBiometrics}
                  disabled={!config.pinEnabled || bioAvailability !== 'available'}
                  trackColor={{ true: colors.income, false: colors.border }}
                  thumbColor={colors.surface}
                />
              }
            />
            {config.pinEnabled && (
              <SettingsRow
                emoji="🙈"
                title="Ocultar en recientes"
                subtitle="Tapa la app en las apps recientes y bloquea las capturas de pantalla"
                right={
                  <Switch
                    value={config.hideContent}
                    onValueChange={toggleHideContent}
                    trackColor={{ true: colors.income, false: colors.border }}
                    thumbColor={colors.surface}
                  />
                }
              />
            )}
            {config.pinEnabled && (
              <SettingsRow
                emoji="🔑"
                title="Cambiar PIN"
                onPress={() => {
                  setError(null);
                  setStep({ kind: 'verify', then: 'change' });
                }}
              />
            )}
          </View>

          {config.pinEnabled && (
            <>
              <AppText size={13} color={colors.textMuted} style={styles.sectionTitle}>
                Bloquear al salir de la app
              </AppText>
              <View style={styles.options}>
                {LOCK_AFTER_OPTIONS.map((option) => {
                  const selected = option.ms === config.lockAfterMs;
                  return (
                    <Pressable
                      key={option.ms}
                      onPress={() => chooseLockAfter(option.ms)}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <AppText weight="bold" size={13} color={selected ? colors.surface : colors.text}>
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <AppText size={12} color={colors.textMuted} style={styles.note}>
                Si olvidas el PIN, en la pantalla de bloqueo puedes entrar con el bloqueo del celular.
              </AppText>
            </>
          )}
        </ScrollView>
      )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  body: {
    paddingBottom: 24,
  },
  intro: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  card: {
    paddingHorizontal: 8,
  },
  sectionTitle: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 10,
  },
  options: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  optionSelected: {
    backgroundColor: colors.text,
  },
  note: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
});
