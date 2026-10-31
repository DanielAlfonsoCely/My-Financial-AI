# My Financial AI

App personal de finanzas para Android, inspirada en la experiencia minimalista de MonAi.
Uso exclusivamente personal. Hecha con Expo (React Native) + TypeScript.

## Correrla en el celular (Fase 1)

La Fase 1 solo usa módulos incluidos en **Expo Go**, así que no hace falta compilar un APK todavía.

1. Instala **Expo Go** desde Play Store en el celular.
2. En el computador (Node 20+):
   ```bash
   npm install
   npx expo start
   ```
3. Escanea el código QR con Expo Go. Celular y computador deben estar en la misma red Wi-Fi
   (si no, usa `npx expo start --tunnel`).

Desde la Fase 3 (lectura de notificaciones/SMS) la app necesita código nativo y se instalará
como APK propio con un *development build* (`eas build --profile development --platform android`).

## Qué incluye la Fase 1

- Pantalla principal: total del mes, columnas por categoría (toca una para filtrar),
  movimientos agrupados por día y navegación entre meses.
- Crear, editar y eliminar gastos e ingresos con teclado numérico propio, categorías y fecha.
- Opción "Mostrar ingresos": el total pasa a ser el balance del mes (ingresos − gastos).
- Respaldo: exportar a JSON (para guardarlo en Google Drive) e importar sin duplicar.
- Datos 100% locales en SQLite. El Auto Backup de Android está activado (`allowBackup`).

## Estructura

```
app/                 Pantallas (expo-router)
  _layout.tsx        Fuentes, base de datos y navegación
  index.tsx          Pantalla principal
  transaction.tsx    Crear / editar movimiento
  settings.tsx       Configuración y respaldo
src/
  db/                Esquema, migraciones, categorías iniciales y consultas
  hooks/             Datos del mes para la pantalla principal
  components/        Piezas de UI reutilizables
  lib/               Dinero (COP), fechas, respaldo JSON, eventos
  theme.ts           Colores, fuentes y radios
```

### Datos

- Montos como enteros en la unidad menor de la moneda (COP sin decimales).
- IDs UUID, `updated_at` y borrado lógico (`deleted_at`) en todas las tablas, para poder
  sincronizar entre dispositivos más adelante sin migrar todo.
- `source` y `source_ref` en cada movimiento, para la de-duplicación de notificaciones/SMS.
- Migraciones versionadas con `PRAGMA user_version` (`src/db/migrations.ts`). Para cambiar el
  esquema se agrega una migración nueva; nunca se edita una existente.

## Plan por fases

| Fase | Contenido |
|------|-----------|
| 1 ✅ | Base del proyecto, base de datos, pantalla principal, entrada manual, respaldo JSON |
| 2 | Voz e IA (Gemini): dictar o escribir gastos en lenguaje natural, chat financiero |
| 3 | Notificaciones de Google Wallet / Davivienda / Nu / Nequi + SMS, de-duplicación, modo automático o con confirmación |
| 4 | Presupuestos por categoría con alertas, edición de categorías, transacciones recurrentes |
| 5 | Widget de entrada rápida, OCR de recibos y pantallazos |
| Futuro | Correos, sincronización entre dispositivos |

## Scripts

```bash
npm run typecheck   # chequeo de TypeScript
npx expo-doctor     # salud del proyecto Expo
```
