import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';

import { applyScreenProtection, getSecurityConfig, recoverWithDevice, setHideContent, setPin, verifyPin } from '../security';

const store = (jest.requireMock('expo-secure-store') as { __store: Map<string, string> }).__store;
const authenticate = LocalAuthentication.authenticateAsync as jest.Mock;

beforeEach(() => {
  store.clear();
  authenticate.mockReset();
  authenticate.mockResolvedValue({ success: true });
  jest.clearAllMocks();
});

describe('PIN', () => {
  test('el PIN se guarda con sal y hash, nunca en claro', async () => {
    await setPin('4821');
    const raw = store.get('security.pin')!;
    expect(raw).not.toContain('4821');
    expect(JSON.parse(raw)).toEqual({ salt: expect.stringMatching(/^[0-9a-f]{32}$/), hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  test('PIN correcto e incorrecto', async () => {
    await setPin('4821');
    expect(await verifyPin('4821')).toEqual({ ok: true });
    expect(await verifyPin('0000')).toMatchObject({ ok: false, attemptsLeft: 4, blockedUntil: 0 });
  });

  test('al quinto intento fallido hay espera, y el PIN correcto no entra mientras dure', async () => {
    await setPin('4821');
    let last = await verifyPin('0000');
    for (let i = 0; i < 4; i++) last = await verifyPin('0000');
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.blockedUntil).toBeGreaterThan(Date.now());
    expect((await verifyPin('4821')).ok).toBe(false);
  });

  test.each(['{esto no es json', '"texto"', '{"salt":5}', 'null'])('un PIN guardado ilegible (%s) no rompe ni desbloquea', async (raw) => {
    store.set('security.pin', raw);
    const result = await verifyPin('1234');
    expect(result).toMatchObject({ ok: false, corrupted: true });
    // It is not a wrong attempt: no lockout builds up.
    expect(store.has('security.failures')).toBe(false);
    expect((await getSecurityConfig()).pinEnabled).toBe(true);
  });

  test('PIN ilegible: solo se borra después de confirmar con el bloqueo del celular', async () => {
    store.set('security.pin', '{roto');
    authenticate.mockResolvedValueOnce({ success: false });
    expect(await recoverWithDevice()).toEqual({ ok: false, pinCleared: false });
    expect(store.has('security.pin')).toBe(true);

    expect(await recoverWithDevice()).toEqual({ ok: true, pinCleared: true });
    expect(store.has('security.pin')).toBe(false);
    expect((await getSecurityConfig()).pinEnabled).toBe(false);
  });

  test('"¿Olvidaste tu PIN?" con un PIN sano no lo borra', async () => {
    await setPin('4821');
    expect(await recoverWithDevice()).toEqual({ ok: true, pinCleared: false });
    expect(await verifyPin('4821')).toEqual({ ok: true });
  });
});

describe('ocultar en recientes', () => {
  test('con PIN queda activo por defecto y se puede apagar', async () => {
    expect((await getSecurityConfig()).hideContent).toBe(false);
    await setPin('4821');
    expect((await getSecurityConfig()).hideContent).toBe(true);
    await setHideContent(false);
    expect((await getSecurityConfig()).hideContent).toBe(false);
  });

  test('bloquea capturas solo con PIN y la opción activa', async () => {
    await applyScreenProtection({ pinEnabled: true, biometricsEnabled: false, lockAfterMs: 0, hideContent: true });
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
    await applyScreenProtection({ pinEnabled: true, biometricsEnabled: false, lockAfterMs: 0, hideContent: false });
    await applyScreenProtection({ pinEnabled: false, biometricsEnabled: false, lockAfterMs: 0, hideContent: false });
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(2);
  });
});
