# Estado del proyecto

Actualizar al cerrar cada tarea: qué se hizo, en qué rama/PR y qué quedó pendiente. Lo más nuevo arriba.

## Bloques

| Bloque | Contenido | Estado | Rama / PR |
|---|---|---|---|
| A | Identidad (solo piel): acento lila/azul, Figtree + Bricolage, sin componentes nativos, sin hora en movimientos, Apariencia | Diseñado | — |
| B | Auditoría (15 puntos de `plan.md` B) | Pendiente | — |
| C | Cuentas reales con grupos, vista general/agrupada, activos/pasivos, transferencias (migración v3) | Diseñado | — |
| D | Inversiones XTB: importador + precios gratis + gráfico (migración v4) | Diseñado, falta reporte real de XTB | — |
| E | Botón de datos de prueba (solo `__DEV__`) | Diseñado, crece con A–D | — |

## Pendiente de Daniel

- Confirmar el nombre "Cauce" y el logo (o elegir otro).
- Mandar un reporte real exportado de XTB (xStation → Historial de cuenta → Exportar) para escribir el parser.
- Probar en el A34: deslizar entre paneles, huella, cursor del monto, espacio del teclado, voz con clave real.
- Decidir si `.claude/` (sin las capturas) se sube a GitHub.

## Bitácora

### 2026-11-10
- Auditoría de `rediseno-v2-seguridad` @ `9fba0d7` (tsc limpio). Casi todo lo de la revisión del 31-oct ya estaba
  corregido; quedan 15 puntos nuevos o abiertos (`plan.md` B).
- Identidad propia, cuentas con grupos, inversiones y datos de prueba diseñados (mockup en `design/mockup/`).
- Carpeta `.kiro/` migrada a `.claude/`.
