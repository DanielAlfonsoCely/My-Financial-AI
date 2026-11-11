import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../src/components/AppText';
import { PillButton } from '../src/components/PillButton';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { useKeyboardInset } from '../src/hooks/useKeyboardInset';
import { showToast } from '../src/lib/toast';
import { getPriceKey, type PriceKeyName, setPriceKey } from '../src/prices/config';
import { refreshPrices } from '../src/prices/service';
import { colors, fonts, radius } from '../src/theme';

const SERVICES: { name: PriceKeyName; title: string; hint: string }[] = [
  { name: 'finnhub', title: 'Finnhub', hint: 'Gratis en finnhub.io · solo acciones de EE. UU.' },
  { name: 'twelvedata', title: 'Twelve Data', hint: 'Gratis en twelvedata.com · 800 consultas al día' },
];

/** Where prices come from, and the optional keys of the backup services. */
export default function PricesScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const [keys, setKeys] = useState<Record<PriceKeyName, string>>({ finnhub: '', twelvedata: '' });
  const [saved, setSaved] = useState<Record<PriceKeyName, boolean>>({ finnhub: false, twelvedata: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([getPriceKey('finnhub'), getPriceKey('twelvedata')]).then(([finnhub, twelvedata]) =>
      setSaved({ finnhub: !!finnhub, twelvedata: !!twelvedata }),
    );
  }, []);

  const save = async (name: PriceKeyName) => {
    await setPriceKey(name, keys[name]);
    setSaved((current) => ({ ...current, [name]: keys[name].trim().length > 0 }));
    setKeys((current) => ({ ...current, [name]: '' }));
    showToast({ kind: 'success', emoji: '🔑', title: keys[name].trim() ? 'Clave guardada' : 'Clave borrada' });
  };

  const refresh = async () => {
    setBusy(true);
    const result = await refreshPrices(db, { force: true });
    setBusy(false);
    showToast(
      !result.ran
        ? { kind: 'error', title: 'No hay posiciones', subtitle: 'Registra una compra y aquí se actualiza su precio.' }
        : result.updated > 0
          ? { kind: 'success', emoji: '📈', title: `${result.updated} precio${result.updated === 1 ? '' : 's'} al día` }
          : { kind: 'error', title: 'No se pudo actualizar', subtitle: result.error ?? undefined },
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]} onLayout={keyboard.onLayout}>
      <ScreenHeader title="Precios" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <AppText size={14} color={colors.textMuted}>
          Los precios salen de Yahoo Finance, gratis y sin clave. Llegan con unos minutos de retraso y se piden al abrir
          Inversiones, al deslizar hacia abajo y cada 15 minutos. Solo se manda el símbolo (VOO, NVDA…): nada de cuánto
          tienes ni de tus cuentas.
        </AppText>
        <AppText size={14} color={colors.textMuted}>
          Yahoo no es un servicio oficial y puede fallar. Si quieres un respaldo, crea una clave gratis en alguno de estos
          y pégala aquí. Se guarda cifrada en el celular.
        </AppText>

        {SERVICES.map((service) => (
          <View key={service.name} style={styles.card}>
            <AppText weight="bold" size={16}>
              {service.title} {saved[service.name] ? '· clave guardada' : ''}
            </AppText>
            <AppText size={12} color={colors.textMuted}>
              {service.hint}
            </AppText>
            <TextInput
              value={keys[service.name]}
              onChangeText={(text) => setKeys((current) => ({ ...current, [service.name]: text }))}
              placeholder={saved[service.name] ? 'Pega otra para cambiarla, o deja vacío para borrarla' : 'Pega la clave'}
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
            />
            <PillButton label={keys[service.name].trim() ? 'Guardar clave' : saved[service.name] ? 'Borrar clave' : 'Guardar clave'} icon="check" disabled={!keys[service.name].trim() && !saved[service.name]} onPress={() => save(service.name)} />
          </View>
        ))}

        {busy ? <ActivityIndicator color={colors.textMuted} /> : <PillButton label="Actualizar precios ahora" icon="refresh-cw" onPress={refresh} />}
      </ScrollView>
      <View style={{ height: keyboard.inset }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 24, paddingTop: 12, gap: 16 },
  card: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, gap: 8 },
  input: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
});
