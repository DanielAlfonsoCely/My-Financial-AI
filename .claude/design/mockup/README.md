# Mockup (Claude Design)

Fuente de los tableros del mockup. Se ven en https://claude.ai/artifact/DrntKG9xVFQR9rnmzJukct

Estos `.dc.html` necesitan el runtime de Claude Design para renderizar, pero se leen como HTML normal: todo el
estilo va en línea, así que de aquí se sacan medidas, radios, tamaños de letra y colores exactos.
Los `{{accent}}`, `{{accentSoft}}` y `{{accentDeep}}` son el color de la app (lila o azul, ver `docs/plan.md` A1).
Los datos que aparecen son de ejemplo.

| Archivo | Pantalla |
|---|---|
| `Main.dc.html` | Identidad: logo, colores, tipografía, piezas |
| `Inicio.dc.html` | Inicio (misma estructura que `app/index.tsx`) |
| `Movimiento.dc.html` | Hoja de movimiento con cuenta, etiquetas y "Más información" |
| `Transferencia.dc.html` | Movimiento en modo Transferir |
| `Calendario.dc.html` | Selector de día propio |
| `Cuentas.dc.html` · `CuentasGeneral.dc.html` | Panel de cuentas, vista agrupada y general |
| `Inversiones.dc.html` · `Operacion.dc.html` | Portafolio XTB y registrar compra/venta |
| `Presupuestos.dc.html` | Presupuestos con interruptor y umbral propios |
| `MejorasIA.dc.html` | Mejoras de IA |
| `Apariencia.dc.html` | Tema y color de la app |
| `Desarrollo.dc.html` | Hoja de datos de prueba (solo dev) |
