# My Financial AI (propuesta de nombre: Cauce)

Contexto del proyecto para Claude Code. Reemplaza a `.kiro/steering/contexto-proyecto.md`.
Al empezar una sesión, lee `docs/estado.md`. Antes de trabajar en un bloque, lee su sección en `docs/plan.md`.
Al terminar algo, actualiza `docs/estado.md`.

## Objetivo

App personal de finanzas para Android, solo para uso de Daniel (no va a Play Store). Nació como réplica funcional de
**MonAi** (expense tracker con IA) para probar que todo funcionara. **Ahora tiene identidad visual propia**: se
conservan las funciones y la estructura que ya existen, y cambia la piel (colores, tipografía, radios, ícono, sin
componentes nativos). No usa marca, logo ni assets de MonAi.

- Usuario: Daniel, Bogotá. Celular **Samsung Galaxy A34 5G** (arm64, sin Gemini Nano).
- Idioma: español. Moneda: **COP** sin decimales (`$25.000`, abreviado `250K` / `1,5M`).
- Medios de pago: **efectivo** y **Google Wallet** (los más usados), **Davivienda**, **Nu**, **Nequi**. Invierte en **XTB**.
- Nombre: provisional "My Financial AI". Propuesta "Cauce" pendiente de que Daniel la confirme.

## Stack (decidido)

- **Expo SDK 58** (React Native 0.88, React 19.3), TypeScript estricto, **expo-router**.
- **SQLite local** con `expo-sqlite` y SQL directo (sin ORM). Migraciones con `PRAGMA user_version` en
  `src/db/migrations.ts`: **nunca se edita una migración existente**, siempre se agrega una nueva. Va en la **v4**
  (v3 onboarding, v4 cuentas y transferencias; v5 será inversiones).
- **Pruebas:** `jest-expo` (`npm test`), ESLint (`npm run lint`) y CI en GitHub Actions. La capa de datos se prueba
  contra SQLite real en memoria con `src/test/sqlite.ts` (`openTestDatabase()`), sin simular consultas.
- Fuente actual Nunito (se cambia a Figtree + Bricolage Grotesque en el bloque A). Íconos: Feather (`@expo/vector-icons`).
- `react-dom` fijado en `19.3.0` por un conflicto de peer deps con react 19.3.0.

### Cómo se prueba (preferencia de Daniel: QR, sin Android Studio)

- Con **Expo Go** + `npx expo start` y el QR (`--tunnel` si no están en la misma red).
- Notificaciones/SMS (Fase 3) y widget necesitan *development build* con **EAS Build** en la nube
  (`eas build --profile development --platform android`, plan gratis), luego `npx expo start --dev-client`.
- **No agregar librerías nativas que no estén en Expo Go sin avisar a Daniel.**

## Estado

Ver `docs/estado.md` (se actualiza al cerrar cada tarea). Resumen al 10 nov 2026:

- `main`: Fase 1 (PR #1). APK de prueba v0.1.0 en la rama `apk-builds`.
- **`rediseno-v2-seguridad`** (sin PR): inicio v2, bloqueo con PIN y huella, panel de cuentas como **maqueta
  hardcodeada**, migración v2 (listas, etiquetas, recurrentes, presupuestos, reglas de IA), onboarding, búsqueda,
  hoja de movimiento, voz y chat con Gemini, CSV.
- **`bloque-b-auditoria`** (sale de la anterior, sin PR): bloque B completo, migración v3, tests, lint y CI.
- **`bloque-c-cuentas`** (sale de la anterior, subida, sin PR): bloque C completo (cuentas reales, grupos,
  transferencias, migración v4, respaldo formato 3) y la primera versión de los datos de prueba (E).
- Siguiente: bloque A de `docs/plan.md` (se saltó a pedido de Daniel), en una rama nueva desde `bloque-c-cuentas`.
- Pendiente de probar en el A34: deslizar entre paneles, huella, cursor del monto, espacio del teclado, voz con clave
  real, MIME `audio/m4a` en la Interactions API.

## Estructura

```
app/_layout.tsx        Fuentes, LockProvider, SQLiteProvider (finanzas.db, onInit=migrateDatabase), Stack, ToastHost
app/index.tsx          Inicio v2 (Pager: panel principal + panel de cuentas a la derecha)
app/transaction.tsx    Hoja crear/editar movimiento (?id=, ?kind=expense|income|transfer, ?categoryId=, ?accountId=)
app/account.tsx        Crear o abrir una cuenta: saldo, cuadrar saldo, datos, últimos movimientos (?id=, ?groupId=, ?type=)
app/account-group.tsx  Crear, renombrar, ordenar o eliminar un grupo de cuentas
app/dev.tsx            Datos de prueba (solo `__DEV__`)
app/voice.tsx          Grabación y resumen de movimientos dictados
app/chat.tsx           Chat financiero
app/settings.tsx       Configuración (SettingsRow) y respaldo
app/onboarding.tsx     Elegir categorías, voz, estilo simple/avanzado
app/categories.tsx · category.tsx     Editar categorías / crear o editar una
app/budgets.tsx · budget.tsx           Presupuestos y alertas / editar uno
app/tags.tsx · recurring.tsx · lists.tsx · list-edit.tsx
app/ai-rules.tsx       Mejoras de IA (correcciones recordadas)
app/ai.tsx             Clave y modelo de Gemini
app/security.tsx       PIN, huella y tiempo de bloqueo
src/db/                types, migrations (v1–v4), seed (15 categorías cat-*, lista list-personal), repo (consultas,
                       cola de escrituras, saveTransaction, budgetAlertFor, loadCategoryChoices, cuentas, grupos y saldos)
src/ai/                gemini (cliente REST), pipeline, localParser, accountMatcher (cuentas y transferencias en una
                       frase), categorizer, emoji, config (SecureStore)
src/hooks/             useData (useQuery con error/reload, useCurrentList), useHomeData, useKeyboardInset, useToday,
                       useCheckpointOnBackground
src/security/LockProvider.tsx
src/components/        AppText, CategoryBars, TransactionRow, AmountInput, NumPad, PinPad, Sheet, PopoverMenu,
                       Pager, SettingsRow, ScreenHeader, PillButton, CategoryChips, CategoryGrid, TagEditor,
                       ThresholdSlider, ToastHost, IconButton, LoadError, AccountChips
src/components/home/   PeriodStrip, RangeSheet, DefaultPeriodSheet, SearchBar
src/components/accounts/AccountsPanel.tsx   Panel de cuentas real (general/agrupada, activos y pasivos)
src/lib/               money, dates, period, recurrence, tags, text, csv, backup, security, events, toast, budgetAlert,
                       accounts (resumen, grupos, efecto de un movimiento en un saldo)
src/dev/seed.ts        Poblar y borrar datos de prueba (tabla `dev_seed`)
src/test/              setup (mocks de módulos nativos), sqlite (expo-sqlite sobre node:sqlite para tests)
src/theme.ts           Colores, paleta pastel de categorías, fuentes, radios
```

## Reglas del modelo de datos

- Montos: **enteros positivos** en la unidad menor de la moneda. Nunca `REAL` para plata.
- Todas las tablas: **UUID**, `created_at`, `updated_at`, `deleted_at` (borrado lógico), para sincronizar a futuro.
- Movimientos con `source` (`manual|voice|notification|sms|ocr|import|recurring`) y `source_ref` para de-duplicar.
- Importar respaldo: merge por id, gana el `updated_at` más reciente; importar dos veces no duplica.
- Toda escritura llama a `notifyDataChanged()` y pasa por la cola de `repo.ts` (`enqueueWrite` / `writeTx`); las
  pantallas no escriben SQL directo. Dentro de una escritura en cola solo se usan los helpers privados del repo, nunca
  otra función de escritura exportada (se quedaría esperándose a sí misma). Guardar un movimiento = `saveTransaction`.
- **Listas:** cada lista es independiente, con sus categorías, etiquetas, presupuestos y reglas de IA.
  **Cuentas: globales**, no por lista (decidido 10 nov).
- **Cuentas:** el saldo nunca se guarda; sale de `opening_balance` y los movimientos (`listAccounts`). En una tarjeta
  (`credit`) el saldo es deuda. "Cuadrar saldo" ajusta `opening_balance`, no crea movimientos. Una tarjeta nunca va en
  un grupo; `broker` y `asset` siempre van en el grupo fijo Inversiones (`group-investments`).
- **Transferencias:** una fila con `kind='transfer'`, `account_id` y `to_account_id` (`to_amount` solo entre monedas),
  sin categoría y sin repetición. `Kind` es solo gasto/ingreso (categorías, recurrentes); un movimiento usa
  `TransactionKind`. Todo lo que suma gastos o ingresos debe saltarse las transferencias.
- Los totales en pesos nunca suman cuentas ni movimientos en otra moneda.
- Etiquetas en minúscula y sin espacios ("ropa de verano" → `#ropadeverano`), guardadas como JSON en `transactions.tags`.

## Seguridad (hecho)

- `expo-local-authentication` + `expo-secure-store` (funcionan en Expo Go).
- PIN de 4 dígitos con SHA-256 y sal, y config del bloqueo en **SecureStore** (no en SQLite, no entra al respaldo JSON).
- 5 intentos fallidos → espera de 30 s que se duplica. "¿Olvidaste tu PIN?" usa el bloqueo del celular.
- Tiempo de bloqueo: de inmediato, 1 min (defecto) o 5 min. `withSystemDialog()` evita el bloqueo en diálogos del sistema.
- Con PIN: "Ocultar en recientes" (`expo-screen-capture`, activo por defecto) tapa la app en recientes y bloquea
  capturas. Si Daniel necesita mandar un pantallazo, se apaga en Seguridad.
- `allowBackup` sigue en `true` (decidido 10 nov): el respaldo de Google es la única red automática hasta que exista
  el respaldo JSON automático (F8). Al ir a segundo plano se hace `wal_checkpoint(TRUNCATE)`.

## IA (decidido)

- **Gemini, plan gratis** (Google AI Studio). Interactions API (`/v1beta/interactions`, `store:false`), con caída a
  `generateContent`. Modelo por defecto `gemini-flash-lite-latest`. Clave en SecureStore (Configuración → Gemini).
- **Voz:** se graba el audio en la app y Gemini transcribe y extrae movimientos en una sola llamada. Varios gastos →
  **movimientos separados**, guardados de inmediato, con un resumen donde se edita o borra cada uno.
- **Texto libre:** parser local por reglas primero (`localParser.ts`); si no es `confident`, Gemini.
- **Mejoras de IA:** al corregir una categoría sugerida se pregunta "¿Recordar esto?" y se guarda la regla por lista.
  Coincidencia local normalizada (sin tildes, "mc donalds" = "mcdonalds") + historial; a Gemini se le mandan las
  correcciones parecidas como preferencias. **Esta función se conserva.**
- La IA va detrás de una capa intercambiable (`pipeline.ts`).
- **Privacidad:** Daniel acepta que Gemini vea frases como "gasté X en café". **Nunca** se envían números de cuenta o
  tarjeta, **saldos**, nombres de personas ni el texto crudo de notificaciones (de una notificación solo monto,
  comercio y fecha). Con cuentas: el prompt de voz lleva solo los **nombres** y el tipo de las cuentas para elegir
  una; el chat no recibe nada de cuentas ni las transferencias. Hay tests que lo cubren (`pipeline.test.ts`).
- **API keys** nunca en el código ni en el repo (`.env.local` está ignorado). Daniel no las pega en el chat.

## Diseño

### Identidad propia (decidida, detalle en `docs/plan.md` sección A)

- **Solo cambia la piel.** No se rehace la app: el inicio vertical con barras por categoría y presupuestos (contorno
  punteado), la lista por día, las etiquetas `#`, Mejoras de IA, la hoja de movimiento y la configuración se quedan.
- Color de la app: **pastel elegible lila (defecto) o azul** para botones y lo que es "de la app". Nada de verde como
  marca (el verde solo significa ingreso). Gasto pasa a un rojo propio (`#C2395A`), separado del color de marca.
- Las categorías siguen con su paleta pastel de 16 colores elegible por el usuario.
- Botón principal: fondo del acento con texto oscuro. Tipografía Figtree (interfaz) + Bricolage Grotesque (cifras).
- **Sin componentes nativos a la vista:** calendario propio (reutilizar la cuadrícula de `RangeSheet`), confirmaciones
  propias en vez de `Alert.alert`, interruptor propio en vez de `Switch`.
- **Sin hora en los movimientos:** solo el día. La hora de registro (`created_at`) se ve únicamente en el desplegable
  "Más información". (En compras de bolsa sí va día y hora de la orden.)
- Pantalla nueva **Apariencia**: tema y color de la app.
- Mockup: `design/mockup/*.dc.html` (fuente de Claude Design; se leen como HTML con estilos en línea para sacar
  medidas y colores exactos) y en claude.ai: https://claude.ai/artifact/DrntKG9xVFQR9rnmzJukct

### Referencias de MonAi

`design/README.md` indexa las capturas (`design/Video Yt/`, `design/TikTok/`) y la transcripción del tutorial. Sirven
para **cómo funciona** cada pantalla. Para **cómo se ve**, gana el plan y el mockup.

## Decisiones de producto

- Inicio = rediseño v2 de MonAi en funcionamiento: lista arriba a la izquierda, período y configuración a la derecha,
  encabezado centrado ("$X sobre presupuesto", balance, gastos/ingresos como punto + número que alternan las barras),
  menú Mes / Año / Todo / Rango / Período predeterminado. Gastos y presupuesto en rojo/verde al seleccionar.
- Onboarding sí (categorías, micrófono e idioma, estilo simple/avanzado), sin paywall.
- Listas con categorías propias; compartir listas no por ahora.
- **Cuentas** (10 nov): globales, con **grupos** que crea el usuario (Efectivo: Billetera, Bajo el colchón; Bancos:
  Davivienda, Nu, Nequi), vista **General / Agrupada**, **grupo fijo "Inversiones"** que trae solo lo del panel de
  inversiones y admite cuentas manuales (CDT, inmueble), secciones **Activos** y **Pasivos** separadas, tarjeta con
  barra de cupo y % al lado. Disponible / Invertido / Deuda en **vertical** bajo el total. Transferencias entre
  cuentas como **una sola fila** (`kind='transfer'`), que no cuenta como gasto. Google Wallet es medio de pago, no
  cuenta.
- **Inversiones:** XTB no tiene API (cerrada mar-2025); se importa el reporte Excel de xStation y los precios salen
  de APIs gratis (Yahoo Finance no oficial, Finnhub, Twelve Data). Gráfico Día/Semana/Mes/Año/Todo. Costo cero.
  **Falta un reporte real de XTB** para escribir el parser: pedírselo a Daniel antes.
- **Datos de prueba:** botón temporal (solo `__DEV__`) que pobla la app con datos inventados **guardados de verdad**
  en SQLite, incluidas inversiones con precios reales; se borra solo lo sembrado. Ver `docs/plan.md` sección E.

## Plan

| Fase / bloque | Contenido | Estado |
|---|---|---|
| Fase 1 | Base, SQLite, inicio, entrada manual, respaldo JSON | ✅ en `main` |
| Fases 2 y 4 | Voz + IA, chat, presupuestos, categorías, etiquetas, recurrentes, listas, acumulado | ✅ en `rediseno-v2-seguridad` (falta probar en el A34) |
| B | Auditoría: 15 puntos (migración v3, cola de escrituras, tests, lint, CI) | ✅ en `bloque-b-auditoria` (falta probar en el A34) |
| C | Cuentas reales: grupos, vistas, activos/pasivos, transferencias (migración v4) | ✅ en `bloque-c-cuentas` (falta probar en el A34) |
| A | Identidad (solo piel) | Diseñado, **siguiente** |
| D | Inversiones XTB (migración v5) | Diseñado, falta reporte |
| E | Datos de prueba (dev) | ✅ primera versión en `bloque-c-cuentas`; crece con D |
| Fase 3 | Notificaciones y SMS (Wallet, Davivienda, Nu, Nequi), automático o con confirmación, de-duplicación | Futuro |
| Fase 5 | Widget, OCR de recibos (ML Kit), "Compartir con la app" | Futuro |
| Futuro | Correos, sincronización (Supabase), listas compartidas, multimoneda | — |

Orden: una rama y un PR por bloque, B (hecho) → C (hecho) → A → D (E va dentro de cada uno).

### De-duplicación (Fase 3, requisito clave)

La misma compra puede llegar 3 veces (SMS, Google Wallet, notificación del banco) y debe quedar **un solo** movimiento:
mismo monto en una ventana corta (~90 s, configurable) con comercio compatible o vacío = misma transacción; se
fusiona con la información más completa; `source_ref` evita reprocesar. Se parsea **en el dispositivo** con reglas
por remitente (se piden ejemplos reales a Daniel), nunca con Gemini.

## Convenciones de trabajo

- Responder a Daniel en **español**, directo y sin rodeos (le gusta "parce", tono casual).
- Si algo se bloquea (permiso, prueba en el celular, dato que falta), parar, pedirle a Daniel ese paso y seguir.
- Trabajar por bloques y mostrar algo funcionando pronto.
- **Git:** commits a nombre de Daniel con su `user.name`/`user.email` local, en español y concisos. **Sin** trailers
  `Co-authored-by` y sin mencionar a Claude, Kiro ni la IA en commits ni PRs.
- No trabajar directo sobre `main`: una rama por bloque y un PR.
- Antes de dar algo por terminado: `npx tsc --noEmit`, `npm run lint`, `npm test` y `npx expo-doctor` (`/verificar`).
- Lo que toque datos lleva test (migración nueva → casos en `src/db/__tests__/migrations.test.ts`).
- `.claude/` va en git sin las capturas de MonAi. Nunca `git add -A`: agregar por ruta.
- Revisiones de código: guardar en `reviews/` con fecha (comando `/revisar`).
- Nunca editar migraciones existentes; probar migraciones partiendo de una BD v1, una v2 y una v3 con datos.
