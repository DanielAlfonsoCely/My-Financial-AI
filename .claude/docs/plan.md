# Plan de trabajo: identidad, auditoría, cuentas, inversiones y datos de prueba (v4, 10 nov 2026)

Base: rama `rediseno-v2-seguridad` @ `9fba0d7` (11.100 líneas, `tsc --noEmit` limpio). Leído también `.kiro/steering`,
`.kiro/design/README.md` y la revisión `.kiro/reviews/2026-10-31-*`.

**Regla principal: no se rehace nada.** La app conserva estructura, pantallas, flujo y funciones (inicio v2 con barras
y presupuestos, listas, etiquetas, recurrentes, búsqueda, voz, chat, Mejoras de IA, PIN/huella, respaldo). Este trabajo es:
(A) cambiar la piel para que deje de parecer MonAi, (B) corregir lo de la auditoría, (C) volver real el panel de
cuentas con grupos y transferencias, (D) inversiones, más (E) un botón temporal de datos de prueba que crece con cada
bloque. Una rama y un PR por bloque. **Orden real: B → A → C → D** (B se hizo primero, el 10 nov, porque
arreglaba datos, y C después a pedido de Daniel; queda A y luego D. La letra de cada sección no cambia).

Convenciones del repo que siguen valiendo: migraciones solo agregando (nunca editar v1/v2), enteros para plata,
UUID + `created_at/updated_at/deleted_at`, `notifyDataChanged()` tras escribir, nada nativo fuera de Expo Go sin avisar,
commits en español a nombre de Daniel sin trailers de IA, `npx tsc --noEmit` y `npx expo-doctor` antes de cerrar.

---

## A. Identidad (solo piel)

- **Nombre:** Cauce — "Tu plata, en su cauce." (propuesta; `app.json` `name`, textos "My Financial AI" en
  `settings.tsx` y `LockProvider.tsx`). **No cambiar `android.package`** (se perdería la BD instalada).
- **Logo** (viewBox 64; regenerar `assets/*.png`; fondo `accent`, trazos Tinta, moneda blanca):
  ```svg
  <path d="M47.32 44.86 A20 20 0 1 1 47.32 19.14" stroke="#1D1B26" stroke-width="5.5" stroke-linecap="round" fill="none"/>
  <path d="M39.66 38.43 A10 10 0 1 1 39.66 25.57" stroke="#1D1B26" stroke-width="5.5" stroke-linecap="round" fill="none" opacity=".45"/>
  <circle cx="47" cy="32" r="4" fill="#FFFFFF"/>
  ```

### A1. Tokens (`src/theme.ts`)

```ts
export const colors = {
  background: '#F7F6FA',
  surface:    '#FFFFFF',
  text:       '#1D1B26',
  textMuted:  '#625E73',   // hoy #8E8E93 no pasa contraste sobre el fondo
  textFaint:  '#A29EB3',   // solo deshabilitado/decorativo, nunca texto que se lea
  border:     '#E6E3EE',
  chip:       '#EDEBF3',
  expense:    '#C2395A', expenseSoft: '#FAD3D7',   // NUEVO significado propio
  income:     '#1F7F68', incomeSoft:  '#D3EFE2',
  danger:     '#C2395A',
} as const;

export const accents = {   // lo elige el usuario; setting `accent` = 'lila' | 'azul', por defecto lila
  lila: { accent: '#CFC0F8', accentSoft: '#EEE8FD', accentDeep: '#5A43B5' },
  azul: { accent: '#B8D3FA', accentSoft: '#E5EFFE', accentDeep: '#2B5BAA' },
} as const;

// categoryPalette: SE QUEDA IGUAL (16 pasteles; los 10 primeros no se reordenan por seed.ts).

export const fonts = {     // mismas 4 claves, así AppText no cambia
  regular: 'Figtree_400Regular', semibold: 'Figtree_600SemiBold', bold: 'Figtree_700Bold',
  extrabold: 'BricolageGrotesque_700Bold',   // cifras grandes y títulos
} as const;                // @expo-google-fonts/figtree + bricolage-grotesque; quitar nunito de _layout.tsx

export const radius = { sm: 14, md: 18, lg: 24, pill: 999 } as const;
```

### A2. Cómo aplicarlo sin reescribir pantallas

1. **Separar "gasto" de "marca".** Hoy `colors.accent` (coral) hace las dos cosas. Los 17 usos:
   - Significan **gasto** → pasan a `colors.expense`: `KindToggle` y `signColor` en `app/index.tsx`, `tint` y el
     segmento en `app/transaction.tsx`, punto de deuda en `AccountsPanel.tsx`.
   - Son **marca** → pasan a `accent`: micrófono del inicio, `✓` de `voice.tsx` y `RangeSheet.tsx`, `ThresholdSlider`,
     switch de `budgets.tsx`, selección en `onboarding.tsx`/`category.tsx`, burbuja del `chat.tsx`.
2. **Acento en caliente:** `AccentProvider` + `useAccent()` (lee el setting, se refresca con `onDataChanged`). Solo el
   acento va por contexto; los neutros siguen como `colors` estático, así no hay que convertir cada `StyleSheet`.
3. **Botón principal:** hoy es pastilla oscura `#2C2C2E` repetida a mano en `PillButton.tsx`, `transaction.tsx:506`,
   `chat.tsx`, `voice.tsx:439`, `ai.tsx:213`, `category.tsx:350`, `list-edit.tsx:146`. Pasa a fondo `accent` con texto
   e ícono en **Tinta** (el pastel no aguanta texto blanco). Centralizar en `PillButton` y usarlo en todos.
4. **Grises sueltos** (`#F2F2F4`, `#EAEAEE`, `#E1E1E6`, `#DCDCE0`, `#E4E4E8`, `#E6E6E9`, `#F0F0F2`, `#E3F07A` del ✓ de
   `budget.tsx`) → tokens (`chip`, `border`, `accent`).
5. **Voz:** el degradado coral→violeta de `voice.tsx:268` es la firma más reconocible de MonAi. Cambiar a
   `[accentDeep, accent]` con el mismo layout. Onboarding (`['#D8F55E','#7EE08A']`) → `[accentSoft, accent]`.
6. **Nada nativo a la vista:**
   - `DateTimePickerAndroid` (`transaction.tsx:186`) → `DateSheet` propio reutilizando la cuadrícula de
     `src/components/home/RangeSheet.tsx` en modo un solo día, con atajos Hoy/Ayer y puntos en días con movimientos.
     Quitar `@react-native-community/datetimepicker` de `package.json` y `app.json`.
   - 24 `Alert.alert` (12 archivos) → `ConfirmSheet` sobre `Sheet.tsx` (los de error pueden ser `showToast`).
   - `Switch` (`settings.tsx`, `security.tsx`, `budgets.tsx`) → `Toggle` propio (pista `accent`, perilla Tinta).
7. Barras (`CategoryBars.tsx`), filas, hojas, menús: **misma geometría**, solo cambian fuente, radios y grises.
   Sombras: quitar `softShadow` de los botones redondos (el contraste lo da fondo vs superficie).

### A3. Cambios pedidos por Daniel en pantallas existentes

- **Sin hora en el movimiento.** Solo día. La hora de registro ya existe (`created_at`): mostrarla únicamente en un
  desplegable "Más información" de `transaction.tsx` (Registrado · Origen manual/voz/recurrente).
- **Etiquetas:** se quedan tal cual (`TagEditor`, `#`). Solo cambia el chip (`accentSoft` + `accentDeep`).
- **Mejoras de IA** (`ai-rules.tsx`): se queda. ✕ visible por fila en vez de tocar la fila para abrir un Alert.
- **Apariencia** (pantalla nueva, fila "🎨 Apariencia" en `settings.tsx` → sección "Más"): Tema Sistema/Claro/Oscuro
  (oscuro puede quedar deshabilitado al inicio), Color de la app Lila/Azul, muestra de la paleta de categorías.

---

## B. Auditoría ✅ (hecho el 10 nov 2026, rama `bloque-b-auditoria`)

Los 15 puntos están cerrados; el detalle de cómo quedó cada uno está en `docs/estado.md`. Cambios frente a lo que
decía la tabla: B2 conserva lo que el usuario ya tiene pero deja el primer arranque como estaba; B3 usa una cola
única de escrituras sobre la conexión principal (la transacción exclusiva abre otra conexión, sin claves foráneas);
B8 deja `allowBackup: true` con checkpoint del WAL y agrega "Ocultar en recientes"; B14 se hizo completo.

La revisión del 31-oct listó 20 problemas; **la mayoría ya está corregida** en `9fba0d7` (voz, parser, fallback de
Gemini, teclado, candado de recurrentes, remapeo de listas en el respaldo). Lo que sigue abierto o es nuevo:

| # | Sev. | Dónde | Problema | Arreglo |
|---|------|-------|----------|---------|
| 1 | Alta | `db/migrations.ts` v2 · `app/index.tsx:105` | Quien actualiza desde v1 (el A34 de Daniel) cae al onboarding como instalación nueva: v2 no marca `onboarding_done`. | Migración **v3**: si hay transacciones, insertar `onboarding_done='true'`. |
| 2 | Alta | `app/onboarding.tsx` (`load`) · `repo.ts applyCategoryPick` | Al guardar el onboarding se **recolorean** las categorías existentes (`color: DISTINCT[i]` → `UPDATE ... color = ?`) y se **ocultan** las semilla sin movimientos (`selected: locked`). | Si la categoría ya existe: conservar `match.color` y `selected: true`. |
| 3 | Media | `db/repo.ts` (6 usos) | `withTransactionAsync` no es exclusivo: consultas de otras promesas (p. ej. `materializeRecurring` al volver a `active` mientras se guarda) caen dentro de la transacción ajena o chocan con un `BEGIN` anidado. | Usar `withExclusiveTransactionAsync(async (txn) => …)` como ya hace `backup.ts`, o una cola de escrituras única. |
| 4 | Media | `app/transaction.tsx save()` | Guardar hace 2–3 escrituras sueltas (recurrente, movimiento, etiquetas), cada una con su `notifyDataChanged`. Si falla la segunda queda una recurrente huérfana. | Una función `saveTransaction` en `repo.ts` con una sola transacción y una sola notificación. |
| 5 | Media | `hooks/useData.ts useQuery` | Los errores se van a `console.warn`: la pantalla queda vacía/cargando sin decir nada. | Devolver `error` y mostrar un estado de fallo con reintentar. |
| 6 | Media | `app/index.tsx` | El período "mes actual" y las etiquetas "hoy/ayer" solo se recalculan cuando hay una escritura. Con la app en memoria al cambiar de día o de mes, se queda en el anterior. | Forzar render en `AppState` → `active` (ya hay listener para recurrentes). |
| 7 | Media | `app/budgets.tsx` | "Alertas de presupuesto" y el umbral se guardan pero nada los usa. | No esperar a la Fase 3: al guardar un gasto, si la categoría cruza el umbral, `showToast` ("🥑 Mercado al 87 %"). |
| 8 | Media | Seguridad | El bloqueo es solo de interfaz: `finanzas.db` va sin cifrar y `allowBackup: true` la sube al respaldo de Google (con WAL posiblemente a medias). Las recientes de Android muestran los datos. | Decidir: `allowBackup: false` y confiar en el respaldo JSON, o `PRAGMA wal_checkpoint(TRUNCATE)` al ir a background. `expo-screen-capture` (`preventScreenCaptureAsync`) cuando hay PIN. |
| 9 | Baja | `lib/security.ts verifyPin` | `JSON.parse(raw)` sin `try`: un valor corrupto deja la app bloqueada sin salida. | `try/catch` → tratar como sin PIN solo tras `authenticateWithDevice`. |
| 10 | Baja | `lib/csv.ts cell()` | Títulos que empiezan por `= + - @` se ejecutan como fórmula en Excel. | Anteponer `'` a esas celdas. |
| 11 | Baja | `hooks/useHomeData.ts` | Los totales suman `amount` sin mirar `currency`. Hoy todo es COP. | Las inversiones en USD van en tablas aparte (sección D); nunca sumar monedas distintas. |
| 12 | Baja | `events.ts` | Cada escritura relanza todas las consultas montadas (el inicio corre 5, incluida `listTransactionAmounts` de toda la lista). | Agrupar notificaciones del mismo tick (`queueMicrotask`) y, más adelante, temas (`'transactions'`, `'settings'`). |
| 13 | Baja | `app/settings.tsx` | "Ver la bienvenida otra vez" pone `onboarding_done='false'` antes de terminar; si se cierra la app a mitad, obliga a repetirla. | Abrir el onboarding con un parámetro `?replay=1` sin tocar el setting. |
| 14 | — | Proyecto | Sin tests, lint ni CI. La revisión encontró 3 bugs del parser leyendo código. | `jest-expo` + tests de `ai/localParser.ts`, `ai/categorizer.ts`, `lib/recurrence.ts`, `lib/period.ts`, `lib/tags.ts`, merge de `lib/backup.ts`; ESLint; workflow con typecheck + test. |
| 15 | — | Repo | `README.md` describe la Fase 1; la rama no tiene PR; `main` y el APK están dos fases atrás. | Actualizar README, abrir PR, etiquetar versión. |

Pendiente de probar en el A34 (no verificable leyendo código): deslizar entre paneles, huella, cursor del monto,
espacio del teclado, voz con clave real, MIME `audio/m4a` en la Interactions API.

---

## C. Cuentas y transferencias ✅ (hecho el 10 nov 2026, rama `bloque-c-cuentas`)

Hecho con la piel actual (el bloque A todavía no existe). Diferencias frente a lo escrito abajo, con su razón en
`docs/estado.md`: "Cuadrar saldo" ajusta el saldo inicial en vez de crear un movimiento de ajuste; tocar una cuenta
abre su detalle con sus últimos movimientos en vez de filtrar el inicio; el saldo resultante solo se muestra en
transferencias; la cuenta `broker` muestra su efectivo hasta que exista el bloque D; y las cuentas en otra moneda se
muestran pero no entran en "Tu dinero hoy" (falta la TRM, bloque D).

Partir de la maqueta (columnas, tarjeta con cupo punteado, filas) y volverla real, con grupos, vista general/agrupada
y activos/pasivos separados (detalle más abajo):

**Migración v4** (la v3 ya la usó el arreglo B1). SQLite no altera un `CHECK`: recrear `transactions` copiando datos.

```sql
CREATE TABLE account_groups (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, emoji TEXT NOT NULL,
  system_key TEXT,                              -- 'investments' para el grupo fijo; NULL en los del usuario
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, emoji TEXT NOT NULL, color TEXT NOT NULL,
  group_id TEXT REFERENCES account_groups(id),   -- NULL = sin grupo
  subtitle TEXT,                                  -- "Vence 14 mar 2027 · 11% E.A." para CDT, inmueble, etc.
  type TEXT NOT NULL CHECK (type IN ('cash','savings','wallet','credit','broker','asset')),
  -- credit = pasivo; broker = valor desde el panel de inversiones; asset = inversión manual (CDT, inmueble)
  currency TEXT NOT NULL DEFAULT 'COP',
  opening_balance INTEGER NOT NULL DEFAULT 0,   -- en crédito: deuda inicial
  credit_limit INTEGER,                         -- solo crédito
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
-- transactions (recreada):
--   kind IN ('expense','income','transfer')
--   account_id TEXT REFERENCES accounts(id)       -- NULL permitido: los movimientos viejos quedan "sin cuenta"
--   to_account_id TEXT REFERENCES accounts(id)    -- solo transfer
--   to_amount INTEGER                             -- solo si cambia la moneda (COP -> USD hacia XTB)
--   CHECK ((kind = 'transfer') = (to_account_id IS NOT NULL))
--   CHECK (to_account_id IS NULL OR to_account_id <> account_id)
-- recurring: + account_id
```

Decisiones:
- **Las cuentas son globales, no por lista** (la plata es una sola; las listas son vistas de gasto). El panel de
  cuentas ya vive fuera de la lista.
- **Una transferencia es UNA fila** (`kind='transfer'`), no dos movimientos emparejados: atómica, se edita y borra de
  una vez. "Retiré 80k de Davivienda" = `account_id=davivienda, to_account_id=efectivo, amount=80000`.
- Saldo = `opening_balance + ingresos − gastos − transferencias que salen + las que entran (usa to_amount si existe)`,
  en una consulta agregada. No guardar saldos. En crédito el saldo es deuda (gastos suben, pagos bajan).
- Las transferencias **no** entran en gastos/ingresos, barras, presupuestos, tira de meses ni `sumRange`. Revisar todo
  `kind === 'income' ? … : …` (asumen dos valores): `index.tsx groupByDay`, `useHomeData.ts`, `TransactionRow.tsx`,
  `csv.ts`, `pipeline.ts financialSummary`, `backup.ts` (validador de `kind`, `FORMAT_VERSION = 3`).
- **Google Wallet es medio de pago, no cuenta** (ya decidido): el gasto baja de la tarjeta que esté en Wallet.
- Pago de tarjeta = transferencia Davivienda → Tarjeta Nu.
- **Privacidad (regla de steering):** a Gemini nunca saldos. El prompt de voz puede llevar solo los nombres de las
  cuentas para elegir una; `financialSummary` no lleva cuentas. Test que lo cubra.

Grupos (pedido de Daniel):
- El usuario crea, renombra, ordena y borra grupos (Efectivo: Billetera, Bajo el colchón; Bancos: Davivienda, Nu,
  Nequi…). Borrar un grupo deja sus cuentas "sin grupo", nunca las borra.
- **Grupo fijo "Inversiones"** (`system_key='investments'`, se crea en la migración, no se puede borrar). La cuenta
  `broker` XTB vive ahí y su valor sale solo del panel de inversiones (posiciones × precio × TRM). Dentro se pueden
  agregar cuentas manuales tipo `asset` (CDT, inmueble) cuyo valor se actualiza a mano ("Cuadrar saldo").
- **Activos vs. pasivos:** las cuentas `credit` (y a futuro préstamos) son pasivos: nunca van en un grupo de activos;
  se listan en su propia sección "Pasivos" y restan en "Tu dinero hoy".

UI del panel de cuentas (mockup: `design/mockup/Cuentas.dc.html` y `CuentasGeneral.dc.html`):
- Arriba: "Tu dinero hoy" (activos − pasivos). Debajo, **en vertical** dentro de una tarjeta: Disponible (efectivo +
  bancos), Invertido (grupo Inversiones), Deuda (pasivos, en rojo con −). Nada de las tres en una sola fila.
- Selector **General / Agrupada** (se recuerda en settings, `accounts_view`).
  - General: una columna por cuenta (ordenadas por saldo) y lista plana con el grupo como subtítulo.
  - Agrupada: una columna por grupo con su % sobre los activos, más una columna de Pasivos con el cupo punteado en
    rojo. En la lista, cada grupo es un encabezado con nombre, **% sobre el total de activos**, valor del grupo y una
    barrita de proporción; debajo sus cuentas. En Inversiones, la cuenta XTB lleva el chip "Automático" y al final
    "+ Agregar a Inversiones". Al final de la lista, "+ Nuevo grupo".
- Sección **Activos** (con su total) y sección **Pasivos** separadas en las dos vistas.
- Tarjeta de crédito: barra de uso del cupo **con el % al lado** (ej. 27 %), y "Cupo $X · disponible $Y" debajo.
- Botón flotante "Transferir".

UI de movimientos:
- `transaction.tsx`: tercer segmento **Transferir** junto a Gasto/Ingreso. En gasto/ingreso aparece la fila "Sale de /
  Entra a" con chips de cuenta (recordar la última usada). En transferencia: origen, destino, botón de invertir y el
  saldo resultante de ambas. Sin categoría en transferencias; sí etiquetas.
- `TransactionRow`: la transferencia usa burbuja con ⇄ en `accentSoft`, subtítulo `Davivienda → Efectivo`, monto en
  `textMuted` sin signo.
- `AccountsPanel`: datos reales, "+" crea cuenta, tocar una columna filtra sus movimientos, botón **Transferir**,
  "Cuadrar saldo" (escribe el saldo real y crea un ajuste) en el detalle de la cuenta.
- Parser local y prompt de Gemini: "retiré/saqué X de A", "pasé X de A a B", "pagué la tarjeta" → transferencia.
  Siempre con la pantalla de resumen editable que ya existe.
- Tests: saldos tras gasto, ingreso, transferencia, edición, borrado y transferencia entre monedas.

---

## D. Inversiones

### Viabilidad (costo cero)

- **XTB no tiene API** (cerrada el 14-mar-2025). No hay sincronización directa.
- **Sí exporta**: xStation web → Historial de cuenta → reportes de posiciones cerradas, operaciones de efectivo y
  órdenes en Excel; la app móvil también genera reportes. Camino: compartir el `.xlsx` con la app y parsearlo
  (`xlsx`/SheetJS, JS puro, sirve en Expo Go). **Pedirle a Daniel un reporte real antes de escribir el parser**; dejar
  un archivo de muestra anonimizado como fixture de test.
- **Precios gratis** detrás de una interfaz `PriceProvider` (igual que la capa de IA):
  1. Yahoo Finance, endpoint público no oficial `query1.finance.yahoo.com/v8/finance/chart/{symbol}`: sin clave,
     EE. UU. y Europa, intradía + histórico + FX (`COP=X`). Puede cambiar sin aviso → respaldo obligatorio.
  2. Finnhub gratis (60 llamadas/min, solo EE. UU.). 3. Twelve Data gratis (800/día, con retraso).
  Claves en SecureStore, como la de Gemini.
- **¿Mismo balance que XTB?** Cantidades y costo: exactos. Valor: igual al cierre; con mercado abierto difiere por
  centavos (retraso + XTB valora al *bid*). Mostrar siempre "actualizado hace X · con retraso" y la TRM usada.

### Modelo (migración v5)

```sql
instruments(id, symbol, name, exchange, currency, provider_symbol, created_at, updated_at, deleted_at)
trades(id, account_id, instrument_id, side CHECK IN ('buy','sell'),
       quantity_e6 INTEGER, price_e4 INTEGER, fee_minor INTEGER, currency,
       executed_at INTEGER, source, source_ref, note, created_at, updated_at, deleted_at)
quotes(instrument_id PRIMARY KEY, price_e4, prev_close_e4, as_of, provider)
price_history(instrument_id, day, close_e4, PRIMARY KEY(instrument_id, day))
fx_rates(pair, day, rate_e4, PRIMARY KEY(pair, day))
```

- Enteros escalados (cantidad ×1e6, precio ×1e4). Nunca `REAL`.
- Un trade = un lote (XTB muestra cada compra aparte); ventas por FIFO; el promedio solo se calcula para mostrar.
- `source_ref` = id de la operación del reporte → reimportar no duplica.
- La cuenta XTB es una `accounts` de tipo `broker` en USD. Depositar = transferencia Davivienda → XTB con `to_amount`.
  Comprar baja el saldo libre y sube posiciones. Así "Tu dinero hoy" cuadra solo.
- Aquí **sí** va día y hora de la orden (define el precio; el importador la llena).
- Gráfico Día/Semana/Mes/Año/Todo: valor(t) = Σ cantidad_en_t × cierre(t), con `react-native-svg` (`npx expo install react-native-svg`; funciona en Expo Go),
  sin librería de gráficos. Línea en `accentDeep`, relleno `accentSoft`.
- Refresco al abrir, al deslizar hacia abajo y cada 15 min en primer plano. Sin red: último valor con su hora.
- Pantallas: `app/investments.tsx` (desde la columna/fila XTB del panel de cuentas), `app/trade.tsx` (modal),
  `app/import-xtb.tsx`.

---

## E. Datos de prueba (temporal, para desarrollar)

Pedido de Daniel: un botón que pueble la app con datos inventados **guardados de verdad** en SQLite (no
hardcodeados), para probar todo sin crearlo a mano. Incluye inversiones con el seguimiento de precios funcionando.

- Pantalla `app/dev.tsx` (hoja "Desarrollo", mockup `design/mockup/Desarrollo.dc.html`), con fila de acceso en Configuración
  **solo si `__DEV__`**. En el APK de producción no aparece. Va en el primer PR (bloque A) y se amplía en C y D.
- `src/dev/seed.ts` usa las funciones reales de `repo.ts` (`createTransaction`, `setBudget`, `createRecurringFrom`,
  `createAiRule`, luego `createAccount`, `createTrade`…), así el seed prueba también la capa de datos.
- Cada fila creada se anota en una tabla `dev_seed(table_name, row_id)` (sirve para todas las tablas, también cuentas y
  trades), para que **"Borrar datos de prueba"** quite solo eso y no toque datos reales. Si ya hay seed, no se repite.
- Generador con semilla fija (PRNG simple, ej. mulberry32) para que siempre salga lo mismo y los bugs se puedan repetir.
- Contenido:
  - 6 meses de movimientos con montos COP realistas (mercado, almuerzos, TransMilenio, servicios, nómina quincenal),
    títulos y etiquetas variadas, algunos sin categoría, algunos por voz.
  - 3 listas (Personal, Trabajo, Viaje), presupuestos (uno excedido, uno al 85 %, uno holgado), 4 recurrentes
    (arriendo, Spotify, plan celular, gimnasio), 5 reglas de IA.
  - Bloque C: grupos Efectivo, Bancos e Inversiones; 8 cuentas (Billetera, Bajo el colchón, Davivienda, Nu, Nequi,
    CDT, XTB y Tarjeta Nu como pasivo con cupo); transferencias de ejemplo (retiros de cajero, pago de tarjeta,
    depósito a XTB en USD).
  - Bloque D: 4 posiciones con compras en fechas y precios pasados plausibles (VOO, NVDA, MSFT, KO; una vendida en
    parte), con símbolos reales para que el `PriceProvider` traiga cotizaciones de verdad y el gráfico se arme con
    histórico real.
- Botones: "Poblar con datos de prueba", "Actualizar precios ahora", "Borrar datos de prueba", y una línea con la
  fecha del último poblado y cuántos movimientos creó.

## F. Propuestas (después de A–E)

1. **Patrimonio en el tiempo:** foto diaria de saldos + inversiones; línea en el panel de cuentas.
2. **Aviso de presupuesto al guardar** (B7) y línea "vas a X % del mes con Y % del presupuesto".
3. **Deshacer al borrar:** el borrado ya es lógico; toast con "Deshacer" 5 s en vez del Alert de confirmación.
4. **Suscripciones:** las recurrentes ya existen; sumar "próximos cobros" (7 días) y total mensual comprometido.
5. **Presupuesto por etiqueta** además de por categoría (tope para `#salidas`).
6. **Buscar por cuenta** en `SearchBar` (`@davivienda` como token, igual que `#etiqueta`).
7. **Reglas de IA para cuenta y etiquetas:** hoy la corrección solo recuerda categoría; recordar también la cuenta
   habitual por comercio ("Terpel → Tarjeta Nu").
8. **Respaldo automático** semanal del JSON a una carpeta elegida, además del manual.
9. **Chat con contexto de presupuestos y cuentas** (sin saldos hacia Gemini: mandar solo proporciones).
10. **Ocultar cifras** con un toque en el total (para usar la app en público).
11. **Fase 3 (notificaciones):** asignar cuenta por remitente y detectar transferencias propias para no contar gasto + ingreso.

## G. Definición de terminado por bloque

- `tsc`, lint y tests en verde; migración probada partiendo de una BD v1 **y** de una v2 con datos (tests en
  `src/db/__tests__/migrations.test.ts`: agregar ahí los casos de cada migración nueva).
- Respaldo: exportar en la versión nueva → importar en instalación limpia → mismos totales y saldos. Un respaldo
  formato 2 sigue importando.
- Nada nativo de Android a la vista. Probado en el A34 con letra grande del sistema.
- Ninguna función existente desaparece: recorrer Configuración entera antes de cerrar el bloque A.
- El seed (sección E) corre limpio en una instalación nueva y "Borrar datos de prueba" deja la base como antes.
