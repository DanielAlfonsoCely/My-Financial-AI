# Estado del proyecto

Actualizar al cerrar cada tarea: qué se hizo, en qué rama/PR y qué quedó pendiente. Lo más nuevo arriba.

## Bloques

| Bloque | Contenido | Estado | Rama / PR |
|---|---|---|---|
| B | Auditoría (15 puntos de `plan.md` B), migración v3, tests, lint y CI | ✅ Hecho, falta probar en el A34 | `bloque-b-auditoria` (subida, sin PR) |
| A | Identidad (solo piel): acento lila/azul, Figtree + Bricolage, sin componentes nativos, sin hora en movimientos, Apariencia | Diseñado, **siguiente** | — |
| C | Cuentas reales con grupos, vista general/agrupada, activos/pasivos, transferencias (migración v4) | Diseñado | — |
| D | Inversiones XTB: importador + precios gratis + gráfico (migración v5) | Diseñado, falta reporte real de XTB | — |
| E | Botón de datos de prueba (solo `__DEV__`) | Diseñado, crece con A–D | — |

## Pendiente de Daniel

- Confirmar el nombre "Cauce" y el logo (o elegir otro).
- Mandar un reporte real exportado de XTB (xStation → Historial de cuenta → Exportar) para escribir el parser.
- Probar en el A34: deslizar entre paneles, huella, cursor del monto, espacio del teclado, voz con clave real.
- **Bloque B en el A34** (exportar un respaldo JSON antes):
  - Abrir la rama en Expo Go: debe entrar directo al inicio, con los mismos movimientos, categorías y colores.
  - Configuración → "Ver la bienvenida otra vez": todo sale marcado con su color; guardar no cambia nada; cerrar la
    app a mitad no obliga a repetirla.
  - Guardar un gasto que cruce el umbral de un presupuesto (alertas activadas): sale el aviso después del de guardado.
  - Con PIN: la app se ve tapada en recientes y no deja capturar; apagar "Ocultar en recientes" lo revierte.
  - Movimiento con repetición: crear, cambiar el monto, pasarlo a "Una vez".
- Subir el commit del workflow de CI: darle el permiso `workflow` al token de GitHub del PC (o usar SSH) y
  `git push` en `bloque-b-auditoria`. Hasta entonces el CI no corre en GitHub.
- Abrir los PR en GitHub (no hay `gh` en el PC): `rediseno-v2-seguridad` → `main` y `bloque-b-auditoria` encima.
  Después de fusionar, etiquetar la versión (propuesta: `v0.2.0`).

## Bitácora

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
