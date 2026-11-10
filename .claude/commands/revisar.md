---
description: Revisión de los cambios de la rama antes del PR
---
Revisa el diff de la rama actual contra `main` (o lo que esté en stage si te digo "staged").
Busca bugs reales: datos (migraciones, montos, borrado lógico, respaldo), asincronía (pantallas desmontadas,
condiciones de carrera), parser e IA, privacidad (nada de saldos ni números de cuenta hacia Gemini) y que no
desaparezca ninguna función existente. Marca cada hallazgo como confirmed / likely / possible, con archivo:línea y
el arreglo propuesto.
Guarda el resultado en `.claude/reviews/AAAA-MM-DD-HHMMSS-<rama>.md`, con el mismo formato que las revisiones
anteriores de esa carpeta, y dame el veredicto en una línea.
