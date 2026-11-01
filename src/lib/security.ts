// App lock: PIN + optional fingerprint.
//
// Everything lives in SecureStore (Android Keystore), not in SQLite, so the PIN never ends up
// in a JSON backup. SecureStore is excluded from Android Auto Backup by its config plugin, so
// after restoring on a new phone the app simply starts unlocked.

import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export const PIN_LENGTH = 4;

const KEY_PIN = 'security.pin';
const KEY_BIOMETRICS = 'security.biometrics';
const KEY_LOCK_AFTER = 'security.lockAfterMs';
const KEY_FAILURES = 'security.failures';

/** After this many wrong PINs in a row the keypad is blocked for a while. */
const MAX_FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;

export const LOCK_AFTER_OPTIONS = [
  { ms: 0, label: 'De inmediato' },
  { ms: 60_000, label: '1 minuto' },
  { ms: 5 * 60_000, label: '5 minutos' },
] as const;
const DEFAULT_LOCK_AFTER_MS = 60_000;

export interface SecurityConfig {
  pinEnabled: boolean;
  biometricsEnabled: boolean;
  lockAfterMs: number;
}

interface StoredPin {
  salt: string;
  hash: string;
}

interface Failures {
  count: number;
  /** Epoch ms until which the keypad stays blocked. */
  blockedUntil: number;
}

// ---------- Config ----------

export async function getSecurityConfig(): Promise<SecurityConfig> {
  const [pin, bio, lockAfter] = await Promise.all([
    SecureStore.getItemAsync(KEY_PIN),
    SecureStore.getItemAsync(KEY_BIOMETRICS),
    SecureStore.getItemAsync(KEY_LOCK_AFTER),
  ]);
  const parsedLockAfter = Number(lockAfter);
  return {
    pinEnabled: !!pin,
    biometricsEnabled: !!pin && bio === 'true',
    lockAfterMs: lockAfter !== null && Number.isFinite(parsedLockAfter) ? parsedLockAfter : DEFAULT_LOCK_AFTER_MS,
  };
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_BIOMETRICS, String(enabled));
}

export async function setLockAfter(ms: number): Promise<void> {
  await SecureStore.setItemAsync(KEY_LOCK_AFTER, String(ms));
}

// ---------- PIN ----------

function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

function randomSalt(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`El PIN debe tener ${PIN_LENGTH} dígitos.`);
  const salt = randomSalt();
  const stored: StoredPin = { salt, hash: await hashPin(pin, salt) };
  await SecureStore.setItemAsync(KEY_PIN, JSON.stringify(stored));
  await resetFailures();
}

/** Turns the lock off completely. */
export async function clearPin(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_PIN),
    SecureStore.deleteItemAsync(KEY_BIOMETRICS),
    SecureStore.deleteItemAsync(KEY_FAILURES),
  ]);
}

async function readFailures(): Promise<Failures> {
  const raw = await SecureStore.getItemAsync(KEY_FAILURES);
  if (!raw) return { count: 0, blockedUntil: 0 };
  try {
    const parsed = JSON.parse(raw) as Failures;
    return { count: parsed.count ?? 0, blockedUntil: parsed.blockedUntil ?? 0 };
  } catch {
    return { count: 0, blockedUntil: 0 };
  }
}

async function resetFailures(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_FAILURES);
}

/** Epoch ms until which PIN entry is blocked (0 if not blocked). */
export async function getBlockedUntil(): Promise<number> {
  const { blockedUntil } = await readFailures();
  return blockedUntil > Date.now() ? blockedUntil : 0;
}

export type PinCheck =
  | { ok: true }
  | { ok: false; blockedUntil: number; attemptsLeft: number };

/**
 * Checks the PIN and counts failures. Wrong attempts are persisted, so killing the app does not
 * reset the counter. Each lockout after the 5th failure doubles in length.
 */
export async function verifyPin(pin: string): Promise<PinCheck> {
  const failures = await readFailures();
  if (failures.blockedUntil > Date.now()) {
    return { ok: false, blockedUntil: failures.blockedUntil, attemptsLeft: 0 };
  }

  const raw = await SecureStore.getItemAsync(KEY_PIN);
  if (!raw) return { ok: true };
  const stored = JSON.parse(raw) as StoredPin;

  if ((await hashPin(pin, stored.salt)) === stored.hash) {
    await resetFailures();
    return { ok: true };
  }

  const count = failures.count + 1;
  const extra = count - MAX_FREE_ATTEMPTS;
  const blockedUntil = extra >= 0 ? Date.now() + BASE_LOCKOUT_MS * 2 ** extra : 0;
  await SecureStore.setItemAsync(KEY_FAILURES, JSON.stringify({ count, blockedUntil }));
  return { ok: false, blockedUntil, attemptsLeft: Math.max(0, MAX_FREE_ATTEMPTS - count) };
}

// ---------- Biometrics ----------

export type BiometricAvailability = 'available' | 'no-hardware' | 'not-enrolled';

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (!(await LocalAuthentication.hasHardwareAsync())) return 'no-hardware';
  if (!(await LocalAuthentication.isEnrolledAsync())) return 'not-enrolled';
  return 'available';
}

// The system prompt can briefly move the app to the background on some phones. While a prompt
// is open the lock must ignore those AppState changes, otherwise it would lock itself again.
let promptOpen = false;
export function isAuthPromptOpen(): boolean {
  return promptOpen;
}

async function withPrompt<T>(run: () => Promise<T>): Promise<T> {
  promptOpen = true;
  try {
    return await run();
  } finally {
    // Give the AppState 'active' event time to arrive before accepting changes again.
    setTimeout(() => {
      promptOpen = false;
    }, 800);
  }
}

/**
 * For system screens opened on purpose (microphone permission, share sheet, file picker): they send
 * the app to the background for a moment, and that must not lock it while the user is using it.
 */
export function withSystemDialog<T>(run: () => Promise<T>): Promise<T> {
  return withPrompt(run);
}

/** Fingerprint only. The cancel button sends the user back to the PIN pad. */
export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  const result = await withPrompt(() =>
    LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Usar PIN',
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
    }),
  );
  if (result.success) await resetFailures();
  return result.success;
}

/**
 * Recovery when the PIN is forgotten: the phone's own screen lock (PIN, pattern or fingerprint).
 * Anyone who can unlock the phone could do this, which is the same trust level as the phone itself.
 */
export async function authenticateWithDevice(): Promise<boolean> {
  const result = await withPrompt(() =>
    LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirma que eres tú',
      disableDeviceFallback: false,
    }),
  );
  if (result.success) await resetFailures();
  return result.success;
}
