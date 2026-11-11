# Estado del proyecto

Actualizar al cerrar cada tarea: qué se hizo, en qué rama/PR y qué quedó pendiente. Lo más nuevo arriba.

## Bloques

| Bloque | Contenido | Estado | Rama / PR |
|---|---|---|---|
| B | Auditoría (15 puntos de `plan.md` B), migración v3, tests, lint y CI | ✅ Hecho, falta probar en el A34 | en `main` (PR #3) |
| C | Cuentas reales con grupos, vista general/agrupada, activos/pasivos, transferencias (migración v4) | ✅ Hecho, falta probar en el A34 | en `main` (PR #4) |
| A | Identidad (solo piel): acento lila/azul, Figtree + Bricolage, sin componentes nativos, sin hora en movimientos, Apariencia | Diseñado, **siguiente** | — |
| D | Inversiones: operaciones, precios gratis, gráfico (migración v5) | ✅ Hecho salvo el importador de XTB (falta el reporte real); falta probar en el A34 | `bloque-d-inversiones` (subida, sin PR) |
| E | Botón de datos de prueba (solo `__DEV__`) | ✅ Con cuentas e inversiones | `bloque-d-inversiones` |

## Pendiente de Daniel

- Confirmar el nombre "Cauce" y el logo (o elegir otro).
- **Mandar un reporte real exportado de XTB** (xStation → Historial de cuenta → Exportar) para escribir el
  importador: es lo único que falta del bloque D.
- **Bloque D en el A34** (exportar un respaldo JSON antes):
  - Poblar datos de prueba y abrir XTB desde el panel de cuentas: valor, Hoy, Total, los cinco rangos del gráfico.
  - Deslizar hacia abajo para actualizar; ponerlo en modo avión y ver que queda el último precio.
  - Registrar una compra buscando un símbolo; registrar una venta; intentar vender de más (debe negarse).
  - Mirar que "Tu dinero hoy" incluya XTB en pesos y diga la TRM usada.
  - Los arreglos: presupuesto desde la barra del inicio en una categoría que no elegiste en la bienvenida, que
    Presupuestos liste todas, y los colores de la vista agrupada.
- Abrir los PR de `arreglos-presupuestos-cuentas` → `main` y `bloque-d-inversiones` encima.
- Probar en el A34: deslizar entre paneles, huella, cursor del monto, espacio del teclado, voz con clave real.
- **Bloque B en el A34** (exportar un respaldo JSON antes):
  - Abrir la rama en Expo Go: debe entrar directo al inicio, con los mismos movimientos, categorías y colores.
  - Configuración → "Ver la bienvenida otra vez": todo sale marcado con su color; guardar no cambia nada; cerrar la
    app a mitad no obliga a repetirla.
  - Guardar un gasto que cruce el umbral de un presupuesto (alertas activadas): sale el aviso después del de guardado.
  - Con PIN: la app se ve tapada en recientes y no deja capturar; apagar "Ocultar en recientes" lo revierte.
  - Movimiento con repetición: crear, cambiar el monto, pasarlo a "Una vez".
- **Bloque C en el A34** (exportar un respaldo JSON antes; la migración v4 reconstruye la tabla de movimientos):
  - Abrir la rama en Expo Go: mismos movimientos y totales que antes, todos "sin cuenta".
  - Configuración → Desarrollo → "Poblar con datos de prueba". Revisar el panel de cuentas en General y Agrupada,
    el cupo de la tarjeta y que las transferencias no sumen en gastos del inicio.
  - Crear una transferencia, invertir origen y destino, editarla y borrarla; mirar que los saldos cuadren.
  - "Cuadrar saldo" en una cuenta. Crear, mover y eliminar un grupo.
  - Por texto: "retiré 80 mil de Davivienda", "pagué la tarjeta con Davivienda 300 mil", "taxi 12 mil con Nequi".
  - Con letra grande del sistema: el segmento Gasto / Ingreso / Transferir puede quedar apretado junto a los botones.
  - "Borrar datos de prueba" y confirmar que todo vuelve a como estaba.

## Bitácora

### 2026-11-11 · Bloque D (inversiones), rama `bloque-d-inversiones`

Sale de `arreglos-presupuestos-cuentas`. Verificación: `tsc` limpio, lint sin errores (69 avisos), 217 tests en verde,
`expo-doctor` 20/20 y el bundle de Android compila. Además se corrió una vez la cadena real contra Yahoo desde el PC
(cotizaciones, 129 días de histórico, TRM, intradía y búsqueda). **No se probó en el celular.**

Qué quedó:
- **Migración v5:** `instruments`, `trades`, `quotes`, `price_history`, `fx_rates`. Probada desde v1 y desde v4 con datos.
- **Operaciones:** compra y venta a mano con símbolo (búsqueda en Yahoo), cantidad, precio, comisión y día y hora de
  la orden. Lotes FIFO, ganancia realizada, y no deja vender ni borrar lo que rompa una venta posterior.
- **Precios gratis:** Yahoo sin clave; Finnhub y Twelve Data como respaldo opcional con clave propia (pantalla
  Precios). Refresco al abrir, al deslizar hacia abajo, cada 15 min y al volver a la app. Sin red queda el último precio.
- **Pantalla Inversiones:** valor (efectivo + posiciones), ≈ en pesos, Hoy y Total, gráfico Día / Semana / Mes / Año /
  Todo, posiciones, saldo libre y lista de operaciones.
- **Panel de cuentas:** el bróker vale efectivo + posiciones, entra en "Tu dinero hoy" con la TRM guardada, muestra
  la TRM usada y al tocarlo abre Inversiones.
- **Respaldo formato 4** con instrumentos y operaciones (los precios no viajan). Formatos 1 a 3 siguen entrando.
- **Datos de prueba:** VOO, NVDA (vendida en parte), MSFT y KO en XTB, y el botón "Actualizar precios ahora".
- Dependencias de Expo alineadas otra vez con el SDK 58 (salieron parches nuevos el 11 nov); `react-native-svg` nuevo.

Falta del bloque:
- **Importador de XTB** (`app/import-xtb.tsx` y su parser): bloqueado hasta tener un reporte real de xStation.
  `importTrades` ya existe y no duplica por `source_ref`; solo falta leer el archivo.

Decisiones y diferencias frente a `plan.md` D:
- `trades` guarda `gross_minor` (cantidad × precio ya redondeado) para que el saldo libre se sume en SQL sin decimales.
- El valor del bróker **incluye el saldo libre**; el gráfico dibuja solo las posiciones (como dice el plan).
- Día y Semana se piden en vivo y no se guardan; sin conexión esos dos rangos no dibujan.
- La fecha de la orden usa todavía el selector nativo de Android (día y luego hora); el bloque A lo reemplaza.

Deuda que queda anotada:
- **Un instrumento debe cotizar en la moneda de la cuenta** (USD en XTB). Acciones europeas en euros no se pueden
  registrar todavía.
- **Finnhub y Twelve Data no se probaron contra el servicio real** (no hay clave): están escritos según su
  documentación y probados con respuestas de esa forma.
- En Yahoo la búsqueda no dice la moneda; se confirma con la cotización al elegir. Sin red se puede escribir el
  símbolo "tal cual" y queda en la moneda de la cuenta.
- El gráfico no descuenta depósitos: un salto en la línea puede ser una compra, no una ganancia.
- La TRM es la de Yahoo (`COP=X`), no la oficial del Banco de la República; se guarda una por día.
- "Cuadrar saldo" en el bróker ajusta el saldo libre.

### 2026-11-10 · Ramas subidas
- Daniel le dio el permiso `workflow` al token: subieron el commit del CI de `bloque-b-auditoria` y la rama
  `bloque-c-cuentas` completa.

### 2026-11-10 · Bloque C (cuentas y transferencias), rama `bloque-c-cuentas`

Se hizo antes que el A a pedido de Daniel, con la piel actual. Verificación: `tsc` limpio, lint sin errores
(64 avisos), 176 tests en verde, `expo-doctor` 20/20 y el bundle de Android compila. **No se probó en el celular.**

Qué quedó:
- **Migración v4:** `account_groups`, `accounts`, `transactions` reconstruida (`kind='transfer'`, `account_id`,
  `to_account_id`, `to_amount` y sus `CHECK`), `recurring.account_id`, grupo fijo Inversiones y la tabla `dev_seed`.
  Probada desde v1, v2 y v3 con datos; un enlace a una categoría inexistente no detiene la actualización.
- **Datos:** saldos calculados (nunca guardados), tarjeta como deuda, transferencia en una sola fila, entre monedas
  con `to_amount`, grupos (crear, renombrar, ordenar, eliminar sin borrar cuentas), archivar cuenta.
- **Panel de cuentas real:** "Tu dinero hoy", Disponible / Invertido / Deuda en vertical, General / Agrupada,
  Activos y Pasivos, cupo con %, "Transferir". Se borró `mockAccounts.ts`.
- **Hoja de movimiento:** segmento Transferir (origen, destino, invertir, saldo resultante), cuenta en gastos e
  ingresos recordando la última, la cuenta como chip en cada fila.
- **Voz y texto:** retiros, pasar entre cuentas propias y pago de tarjeta se reconocen en el celular
  (`accountMatcher.ts`); con Gemini van solo nombres y tipo de las cuentas. El chat no recibe nada de cuentas.
- **Respaldo formato 3** con cuentas y grupos (los formatos 1 y 2 siguen entrando), CSV con columnas de cuenta,
  búsqueda del inicio también por nombre de cuenta.
- **Datos de prueba (E):** Configuración → Desarrollo (solo `__DEV__`): 8 cuentas, ~250 movimientos de 6 meses,
  transferencias, 3 presupuestos, 4 recurrentes, 5 reglas, listas Trabajo y Viaje. Borrar deja la base igual que antes.

Decisiones y diferencias frente a `plan.md` C:
- **"Cuadrar saldo" ajusta el saldo inicial**, no crea un movimiento: un ajuste como gasto o ingreso ensuciaría los
  totales de una lista, y no hay un cuarto tipo de movimiento. No queda historial del ajuste.
- **Tocar una cuenta abre su detalle** (saldo, datos, últimos 30 movimientos) en vez de filtrar el inicio: las
  cuentas son globales y el inicio es por lista.
- **Archivar** una cuenta en vez de borrarla: sus movimientos siguen mostrando su nombre.
- Una transferencia que no se pudo entender por voz/texto **no se guarda como gasto**: se avisa.
- Mandarle plata a otra persona ("le transferí 50 mil a mi mamá") sigue siendo un gasto.

Deuda que queda anotada:
- **Otras monedas:** una cuenta en USD se muestra aparte y no entra en "Tu dinero hoy" (falta la TRM, bloque D). Sus
  montos se escriben en centavos y un gasto en esa cuenta usa el campo de monto pensado para pesos.
- La cuenta `broker` muestra solo su efectivo; el chip "Automático" ya está, el valor real llega con el bloque D.
- **Eliminar una lista** borra (lógicamente) sus movimientos, así que cambia los saldos de las cuentas que usaban.
- Una transferencia pertenece a la lista que estaba abierta al crearla y se ve en el día de esa lista.
- Editar una transferencia cuya cuenta fue archivada no deja guardar (sí borrar).
- Sin parser de "con qué pagué" cuando dos cuentas comparten palabra ("Cuenta Nu" y "Tarjeta Nu" con solo "nu").
- "Actualizar precios ahora" de la hoja Desarrollo es del bloque D.
- Colores y componentes: todo con la piel actual y `Alert.alert`; el bloque A lo re-pinta junto con lo demás.

### 2026-11-10 · Bloque B (auditoría), rama `bloque-b-auditoria`

Verificación: `tsc` limpio, lint sin errores (59 avisos, ver abajo), 119 tests en verde, `expo-doctor` 20/20, y el
bundle de Android compila (`expo export`). **No se probó en el celular.**

| # | Cómo quedó |
|---|---|
| 1 | Migración **v3**: con algún movimiento en la base, `onboarding_done='true'` (también repara un `'false'` atascado). |
| 2 | La bienvenida conserva color y selección de lo que el usuario ya tiene (repetición, categorías con movimientos, editadas o creadas). Solo las semilla intactas de un primer arranque salen sin marcar. Lógica en `repo.ts loadCategoryChoices`. |
| 3 | Cola única de escrituras (`enqueueWrite` / `writeTx`) sobre la conexión principal. No se usó `withExclusiveTransactionAsync` en el repo: abre otra conexión donde no rigen las claves foráneas. El importador de respaldo sí la conserva, dentro de la cola. |
| 4 | `saveTransaction`: movimiento + recurrente + etiquetas en una transacción y un solo aviso. |
| 5 | `useQuery` devuelve `error` y `reload`; `LoadError` con "Reintentar" en inicio, categorías, etiquetas, recurrentes, Mejoras de IA y presupuestos. |
| 6 | `useToday`: el inicio se vuelve a pintar al cambiar el día (al volver a la app o a medianoche). |
| 7 | Aviso de presupuesto al guardar (manual y voz) cuando el gasto cruza el umbral o el 100 % (`budgetAlertFor`, `lib/budgetAlert.ts`). |
| 8 | `allowBackup` se queda en `true` + `wal_checkpoint(TRUNCATE)` al ir a segundo plano. `expo-screen-capture` (viene en Expo Go) con interruptor "Ocultar en recientes", activo por defecto con PIN. |
| 9 | PIN guardado ilegible: no rompe ni desbloquea; se borra solo tras confirmar con el bloqueo del celular. |
| 10 | CSV: `'` delante de celdas que empiezan por `= + - @`. |
| 11 | Los totales solo suman pesos (`sumRange`, `usePeriodData`). |
| 12 | `notifyDataChanged` agrupa los avisos del mismo tick. |
| 13 | "Ver la bienvenida otra vez" usa `?replay=1` y no toca el ajuste. |
| 14 | `jest-expo` con 119 tests (migraciones desde v1 y v2 con datos, repo, parser, categorizador, respaldo, seguridad, librerías), ESLint y workflow de CI. |
| 15 | README al día. Rama subida **sin** el último commit (el workflow de CI): GitHub rechaza el push porque el token del PC no tiene el permiso `workflow`. Los PR y la etiqueta quedan para Daniel (no hay `gh`). |

Deuda que queda anotada:
- **Lint:** 54 avisos de reglas del React Compiler (`react-hooks/refs`, `set-state-in-effect`, `purity`) en pantallas
  que ya existían, bajadas a aviso en `eslint.config.js`. No se tocaron porque cambian comportamiento de UI sin probar
  en el celular; limpiar pantalla por pantalla (buen momento: bloque A).
- B5: si falla una recarga posterior (no la primera), la pantalla sigue mostrando los datos anteriores sin aviso.
- Los `Alert.alert` y `Switch` nuevos o existentes se cambian en el bloque A.
- `npm audit` reporta 31 vulnerabilidades (30 moderadas, 1 baja) en dependencias de desarrollo/transitivas; sin revisar.

Otros cambios del día:
- `.claude/` entra al repo sin las capturas de MonAi (quedan en `.gitignore`, solo en el PC de Daniel).
- Se borró la copia duplicada `~/Documents/.claude/`.
- Numeración de migraciones: B = v3, C = v4, D = v5. Orden de bloques: B → A → C → D.
- Dependencias alineadas con el SDK 58 (`expo install --fix`): expo-router, expo-linking, expo-sharing,
  expo-splash-screen, react-native-safe-area-context.

### 2026-11-10
- Auditoría de `rediseno-v2-seguridad` @ `9fba0d7` (tsc limpio). Casi todo lo de la revisión del 31-oct ya estaba
  corregido; quedan 15 puntos nuevos o abiertos (`plan.md` B).
- Identidad propia, cuentas con grupos, inversiones y datos de prueba diseñados (mockup en `design/mockup/`).
- Carpeta `.kiro/` migrada a `.claude/`.
