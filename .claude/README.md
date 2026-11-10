# .claude

Contexto del proyecto para Claude Code (antes era `.kiro/`).

| Ruta | Qué es |
|---|---|
| `CLAUDE.md` | Contexto principal. Claude Code lo lee solo al iniciar cada sesión |
| `docs/plan.md` | Plan detallado: identidad (A), auditoría (B), cuentas (C), inversiones (D), datos de prueba (E), propuestas (F), definición de terminado (G) |
| `docs/estado.md` | Estado por bloque, pendientes y bitácora |
| `design/mockup/` | Fuente del mockup de Claude Design |
| `design/README.md`, `design/TikTok/`, `design/Video Yt/` | Referencias de MonAi (cómo funciona, no cómo se ve) |
| `reviews/` | Revisiones de código anteriores y nuevas |
| `commands/` | Comandos: `/verificar`, `/revisar`, `/cerrar-bloque A` |
| `settings.json` | Permisos para comandos de verificación sin preguntar |

## Instalar en otro PC

Descomprimir en la raíz del repo `My-Financial-AI` (al lado de `app/` y `src/`) y abrir Claude Code ahí.

## ¿Va a GitHub?

`.kiro/` no se subía. Para tener esto en cualquier PC sin copiar zips, se puede subir todo menos las capturas de
MonAi (12 MB, de otra empresa). Agregar al `.gitignore`:

```
.claude/design/TikTok/
.claude/design/Video Yt/
.claude/settings.local.json
```

Si prefieres que nada de esto quede en GitHub, en vez de eso agrega `.claude/` a `.git/info/exclude`.
