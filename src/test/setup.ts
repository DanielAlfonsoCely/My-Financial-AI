// Jest setup: native modules that the data layer touches are replaced by Node equivalents.

jest.mock('expo-crypto', () => {
  const crypto = jest.requireActual('node:crypto') as typeof import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    randomUUID: () => crypto.randomUUID(),
    getRandomBytes: (n: number) => new Uint8Array(crypto.randomBytes(n)),
    digestStringAsync: async (_algorithm: string, text: string) => crypto.createHash('sha256').update(text).digest('hex'),
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      store.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      store.delete(key);
    },
  };
});

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  // Keeps what the app "wrote", so a test can read an exported backup or CSV back.
  const written: { name: string; content: string }[] = [];
  function File(this: Record<string, unknown>, _directory: unknown, name: string) {
    this.uri = `file:///cache/${name}`;
    this.exists = false;
    this.create = () => undefined;
    this.delete = () => undefined;
    this.write = async (content: string) => {
      written.push({ name, content });
    };
  }
  return { File, Paths: { cache: '/cache' }, __written: written };
});
