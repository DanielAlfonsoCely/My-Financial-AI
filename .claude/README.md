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

## En otro PC

Viene con el repo: clonar y abrir Claude Code en la raíz. No copiar esta carpeta a un nivel superior (por ejemplo
`~/Documents/.claude/`): se cargaría dos veces y aplicaría a otros proyectos.

## En GitHub

Esta carpeta va en el repo (decidido 10 nov 2026) menos las capturas de MonAi (12 MB, de otra empresa) y los ajustes
locales, que están en el `.gitignore`: `.claude/design/TikTok/`, `.claude/design/Video Yt/` y
`.claude/settings.local.json`. Las capturas viven solo en el PC de Daniel; en otro PC hay que copiarlas a mano.
