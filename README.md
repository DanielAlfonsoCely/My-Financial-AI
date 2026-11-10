# My Financial AI

App personal de finanzas para Android. Uso exclusivamente personal (no va a Play Store).
Hecha con Expo SDK 58 (React Native) + TypeScript, con los datos en SQLite dentro del celular.

## Correrla en el celular

Todo lo que hay hoy funciona en **Expo Go**, sin compilar un APK.

1. Instala **Expo Go** desde Play Store en el celular.
2. En el computador (Node 22):
   ```bash
   npm install
   npx expo start
   ```
3. Escanea el código QR con Expo Go. Celular y computador deben estar en la misma red Wi-Fi
   (si no, usa `npx expo start --tunnel`).

Para la voz y el chat hace falta una clave gratis de Gemini (Google AI Studio). Se pega en la app, en
Configuración → Gemini, y se guarda cifrada en el celular. Nunca va en el código ni en el repositorio.

La lectura de notificaciones y SMS (Fase 3) y el widget van a necesitar código nativo: ahí la app se instala como
APK propio con un *development build* (`eas build --profile development --platform android`).

## Qué incluye

- **Inicio:** total o balance del período, barras por categoría con su presupuesto, movimientos por día, y
  períodos Mes / Año / Todo / Rango con día de inicio del mes configurable. Búsqueda por texto y por `#etiqueta`.
- **Movimientos:** crear, editar y eliminar gastos e ingresos con teclado propio, categoría, etiquetas, fecha y
  repetición (diaria a anual).
- **Listas** independientes, cada una con sus categorías, etiquetas, presupuestos y reglas.
- **Presupuestos** por categoría, con aviso al guardar un gasto que cruza el umbral elegido o el 100 %.
- **Voz y texto libre:** "almuerzo 18 mil y taxi 12 mil ayer" crea los movimientos. Primero lo intenta un parser
  local; si la frase es enredada, Gemini.
- **Mejoras de IA:** al corregir una categoría sugerida, la app puede recordar la corrección.
- **Chat** sobre tus gastos.
- **Seguridad:** PIN de 4 dígitos, huella, tiempo de bloqueo, y con PIN activo la app se tapa en las apps
  recientes y bloquea capturas (se puede apagar en Seguridad).
- **Respaldo:** exportar a JSON e importar sin duplicar (gana la versión más reciente de cada fila), y exportar CSV.
- **Panel de cuentas:** por ahora es una maqueta con datos de ejemplo.

## Estructura

```
app/                 Pantallas (expo-router)
src/
  db/                Esquema, migraciones, categorías iniciales y consultas (repo.ts)
  ai/                Gemini, parser local, sugerencia de categorías
  hooks/             Datos para las pantallas
  components/        Piezas de UI reutilizables
  lib/               Dinero (COP), fechas, períodos, respaldo, CSV, seguridad, eventos
  security/          Pantalla de bloqueo
  test/              Utilidades de pruebas (SQLite en memoria)
  theme.ts           Colores, fuentes y radios
.claude/             Contexto del proyecto: plan, estado, mockup y revisiones
```

### Datos

- Montos como enteros en la unidad menor de la moneda (COP sin decimales). Los totales nunca mezclan monedas.
- IDs UUID, `updated_at` y borrado lógico (`deleted_at`) en todas las tablas, para poder sincronizar entre
  dispositivos más adelante sin migrar todo.
- `source` y `source_ref` en cada movimiento, para la de-duplicación de notificaciones y SMS.
- Migraciones versionadas con `PRAGMA user_version` (`src/db/migrations.ts`). Para cambiar el esquema se agrega
  una migración nueva; nunca se edita una existente.
- Todas las escrituras pasan por una sola cola (`repo.ts`), y las que tocan varias tablas son atómicas.

## Scripts

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Jest: migraciones, consultas, parser, respaldo, seguridad
npx expo-doctor     # salud del proyecto Expo
```

Las pruebas de la capa de datos corren las migraciones y consultas reales contra SQLite en memoria (`node:sqlite`),
incluida la actualización desde una base v1 y desde una v2 con datos. Las mismas verificaciones corren en GitHub
Actions en cada PR.

## Plan

El plan detallado y el estado están en `.claude/docs/plan.md` y `.claude/docs/estado.md`.

| Bloque | Contenido | Estado |
|---|---|---|
| Fase 1 | Base, SQLite, inicio, entrada manual, respaldo JSON | Hecho |
| Fases 2 y 4 | Voz e IA, chat, presupuestos, categorías, etiquetas, recurrentes, listas | Hecho |
| B | Auditoría: correcciones de datos, seguridad y pruebas | Hecho |
| A | Identidad visual propia | Siguiente |
| C | Cuentas reales con grupos y transferencias | Diseñado |
| D | Inversiones (XTB) | Diseñado |
| Fase 3 | Notificaciones y SMS con de-duplicación | Futuro |
| Fase 5 | Widget, OCR de recibos | Futuro |
