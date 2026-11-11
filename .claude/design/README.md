# Imágenes de referencia de MonAi

> **Ojo (10 nov 2026):** estas capturas ahora son referencia de **funcionamiento** (qué hace cada pantalla, flujos,
> comportamiento), no de **aspecto**. La identidad visual propia está en `docs/plan.md` (sección A) y en
> `design/mockup/`. Si una captura y el plan chocan en lo visual, gana el plan.

Pantallazos de MonAi que se usan como referencia. Las imágenes **no se suben a GitHub** (ver `.claude/README.md`).

- `Video Yt/`: tutorial en YouTube de Charlie (hace ~11 meses, MonAi v1.7.0, iPhone). Va en el orden del video. La transcripción está en `Video Yt/transcripcion-video-yt.txt`.
- `TikTok/`: videos más recientes. Muestran presupuestos, el widget y un rediseño de la pantalla principal (los archivos `v2-*`).

Daniel pone los archivos con su nombre genérico y el agente los revisa y los renombra (`NN-descripcion.png`, con `-1`/`-2` si una pantalla se repite).

## Notas generales

- Todo está en **USD/formato inglés** (`$35,000.00`). En nuestra app es COP: `$35.000`, sin decimales.
- Los íconos superpuestos de ▶ / ⏸, la barra rosada de progreso, el ícono de toggle abajo a la derecha y los subtítulos ("because now", "en donde solo") son del reproductor de video, **no de la app**.
- En MonAi, los íconos de configuración son **emojis dentro de un círculo gris claro**, no íconos de color.
- Los modales son **hojas (bottom sheets)** con esquinas grandes y un botón ✕ dentro de un círculo blanco arriba a la derecha. A veces se apilan (una hoja encima de otra).
- Botones principales: pastilla **oscura** (`#2C2C2E` aprox.) con texto blanco y flecha/✓ (`→ Guardar`, `→ Continuar`, `✓ Guardar`). Excepciones en rojo coral: `✓ Aplicar` del selector de mes y el ✓ de la voz.
- **Gasto = rojo coral** (toggle `-`, monto). **Ingreso = verde** (toggle `+`, monto verde oscuro, chip lima).
- Cosas exclusivas de iOS que no aplican en Android: Genmoji, Atajos/Apple Pay, widget de iOS y menús "liquid glass". Hay que buscar el equivalente en Android.

---

## Video Yt/ (versión de hace ~11 meses)

### Onboarding (01–05)
| Archivo | Pantalla | Detalles |
|---|---|---|
| `01-onboarding-elige-categorias-vacio.png` | "Elige tus categorías", sin selección | Grilla de 3 columnas con cuadros grandes redondeados en gris muy claro y el emoji pequeño al centro. Debajo de cada cuadro va el nombre. Categorías: Compras 🥑, Ropa 👖, Comer afuera 🍔, Lujo 💎, Auto 🚗, Mascotas 🐶. La última celda es **"Añadir categoría"** con borde punteado y un `+`. Abajo, el botón `→ Guardar` aparece **deshabilitado** (gris claro). |
| `02-onboarding-elige-categorias-seleccion.png` | Igual, con categorías seleccionadas | Al seleccionar una categoría, el cuadro toma **su color pastel** (Compras verde lima, Ropa azul, Comer afuera amarillo/beige, Lujo celeste, Auto rosado). Las no seleccionadas quedan grises. Cuando hay selección, `→ Guardar` se pone **oscuro (habilitado)**. |
| `03-onboarding-nueva-categoria-emoji.png` | Crear categoría "Tecnología" | Hoja con ✕. Arriba a la izquierda va un cuadro gris con el emoji (💻), debajo el nombre grande en negrita y luego un botón oscuro ancho `✓ Guardar`. El teclado de emojis de iOS está abierto, con un buscador "Describe un emoji". Según la transcripción, **la IA sugiere varios emojis a partir del nombre** y el usuario los recorre deslizando (💻, 📱, 🖥️, 🔌, 🤖). |
| `04-onboarding-entrada-de-voz.png` | "Entrada de voz" | Título, subtítulo gris "Agrega transacciones con tu voz automáticamente" y círculos concéntricos grises con el botón rojo de micrófono al centro. Encima, una burbuja de ejemplo: "Compra de mercado US$ 35". Abajo, `→ Continuar`. Según la transcripción, aquí se pide **permiso de micrófono** y se elige el **idioma de voz** (español Colombia). |
| `05-onboarding-elige-estilo.png` | "Elige un estilo" | Subtítulo: "Puedes cambiarlo en cualquier momento desde la configuración". Muestra la maqueta de un teléfono sobre un marco con degradado verde-lima. Dos opciones: **Simplificado** ✓ ("Solo gastos", con borde) y **Avanzado** ("Ingresos y gastos"). Abajo, `→ Siguiente`. Después viene el paywall, que no tiene pantallazo y no aplica para nosotros. |

### Pantalla principal y entrada por voz (06–12)
| Archivo | Pantalla | Detalles |
|---|---|---|
| `06-inicio-vacio.png` | Inicio sin movimientos (modo avanzado) | Engranaje en un círculo blanco arriba a la derecha. Debajo: "Total", luego un círculo gris con `-`, un **0** enorme y `$` gris. Hay un contenedor con dos chips: **`$0.00` en pastilla roja** (gastos, seleccionado) y `$0.00` (ingresos). Siguen los chips "Este mes ⌃⌄", "en" y "Lista privada ⌃⌄". **Estado vacío:** 4 barras grises "esqueleto" de alturas decrecientes con el texto centrado "Tus transacciones se mostrarán aquí". Abajo a la izquierda, una pastilla blanca con `+` y 🔍 (**en esta versión no hay ícono de chat**). Abajo a la derecha, el micrófono rojo. |
| `07-selector-mes.png` | Hoja "Mes" | Título "Mes" y ✕. Chips "Todo el tiempo" (con borde) y **"2025"** (oscuro, seleccionado). Grilla de 3×4 con meses abreviados en minúscula (ene, feb, … sept, … dic). El mes actual o elegido se marca con un fondo gris. Botón rojo `✓ Aplicar`. |
| `08-voz-grabando.png` | Grabando voz | **Pantalla completa con un degradado borroso** rojo-coral a violeta. La **transcripción en vivo** va en texto blanco grande y centrado: "Me gasté 35.000 pesos en una hamburguesa". Abajo a la izquierda, ✕ en un círculo translúcido (cancelar). Abajo a la derecha, un círculo rojo con ✓ (enviar). |
| `09-transaccion-resultado-voz.png` | Hoja de transacción (resultado de la voz) | El contenido va **centrado verticalmente**, con mucho aire arriba. Chips pequeños: "hoy ⌄" y "Una vez ⌄" (recurrencia). Título "Hamburguesa" grande en negrita. Fila con un **toggle segmentado [ - | + ]** (el `-` rojo está activo) y el monto **"$35,000" grande en rojo**. Debajo, un chip con borde oscuro "🍔 Comer afuera ›". Abajo, un botón cuadrado con borde `#` (etiquetas) y un botón oscuro ancho `✓ Guardar`. |
| `10-transaccion-etiquetas-teclado.png` | Agregando etiquetas | Al tocar `#`, la barra inferior se convierte en un **campo de etiquetas**: un chip gris "#comida", un placeholder "#Etiqueta" y un botón cuadrado oscuro ✓ a la derecha. El teclado está abierto. |
| `11-inicio-primer-gasto.png` | Inicio con el primer gasto | **Toast arriba:** una pastilla blanca "🍔 Comer afuera **$35,000.00**" (el monto va en un chip gris). Total "- 35,000 $". Chips: rojo "- $35,000.00" y "$0.00". **Barras:** la categoría con gasto es una barra alta (gris claro en este caso) con 🍔 y 35K abajo. **Las categorías sin gasto se muestran como pastillas bajas con el emoji y el 0 en línea** (🚗0, 🥑0, 💎0, 🐶…), con scroll horizontal. La lista lleva el encabezado "hoy" en una pastilla gris pequeña. La fila tiene una burbuja naranja pastel con 🍔, "Comer afuera" en gris, "Hamburguesa" en negrita, **chips de etiquetas debajo** (#comida, #credito) y **el monto en una pastilla gris a la derecha** ("$35,000.00", sin signo). |
| `12-transaccion-dos-gastos-voz.png` | Resultado de la voz con dos gastos | "Me gasté 32.500 en hamburguesa y 7.500 en papas" quedó como **un solo movimiento**: "Hamburguesa y papas a la francesa", $40,000, Comer afuera. **La IA sumó los montos** y reutilizó la etiqueta #comida. El título es más largo y se ve **más pequeño** (se ajusta a una línea). Ojo: nosotros planeamos separar en dos movimientos. Hay que decidir cuál comportamiento queremos. |

### Categorías, recurrencia e IA (13–20)
| Archivo | Pantalla | Detalles |
|---|---|---|
| `13-transaccion-elegir-categoria.png` | Elegir categoría en la transacción | Al tocar el chip de categoría, aparece una **fila con scroll horizontal**: primero un `+` en círculo (crear categoría), luego la categoría elegida con **borde oscuro** ("🤖🚀 Tecnología") y las demás con borde claro (🍔 Comer afuera, 👖 Ropa…). Ejemplo: "Plan de datos celular", $58,000. |
| `14-nueva-categoria-emoji-sugerido.png` | Crear categoría "Plan celular" | Cuadro del emoji **en color pastel (verde)** con 🔋 y **puntos de paginación debajo** (•●•••), porque se desliza entre los emojis que sugiere la IA. Nombre grande y `✓ Guardar`. El teclado muestra Genmoji/stickers (solo iOS). |
| `15-transaccion-recurrencia.png` | Menú de recurrencia | Es un popover anclado al chip "Una vez" con estas opciones: ✓ Una vez, Diariamente, Semanalmente, Quincenalmente, Mensualmente, Bimensualmente, Trimestralmente, Anualmente. |
| `16-configuracion-1.png` | Configuración (arriba) | Hoja con la barrita de arrastre, título grande y ✕. Sección "Contenido": 🥑 Editar categorías ("En tu lista actual \"Lista privada\""), #️⃣ Editar etiquetas (mismo subtítulo), 🔁 Lista de transacciones recurrentes, 📝 Tus listas (con **badge "14"**), 📤 Compartir lista ("Lista privada"), 📊 Exportar CSV, 📥 Importar CSV ("Actualmente solo se admiten CSVs exportados desde MonAi"), ➕ Mostrar ingresos (switch verde activado), ⤵️ Acumulado ("Mostrar el total de todos los meses en lugar del mes actual solamente", switch apagado), 🛠️ Funciones solicitadas. **Todavía no existe "Presupuestos"** (llegó después, ver `TikTok/03`). |
| `17-configuracion-2.png` | Configuración (scroll) | 🛠️ Funciones solicitadas ("Vota y sugiere: sé parte de la evolución de la app") y 🤖 **Mejoras de IA**. Sección "Idioma y región": 🇨🇴 Idioma de entrada de voz y 💵 Moneda. |
| `18-mejoras-de-ia.png` | Hoja "Mejoras de IA" | "Cada vez que corrijas una sugerencia automática de categoría, tu corrección será recordada para futuras clasificaciones." Muestra una lista de reglas aprendidas, cada una con emoji, **nombre de la categoría** y **texto de origen** debajo (🛵 Domicilios ← "Combo McDonalds"; 📱 Plan celular ← "Plan de datos celular"). Las reglas se pueden eliminar. **Es una buena idea para nuestro parser local:** guardar las correcciones como reglas comercio/palabra → categoría. |
| `19-transaccion-manual-categoria-ia.png` | Nueva transacción manual con `+` | Se escribe el título "Gasolina" y **la IA sugiere la categoría al terminar de escribir** (🚗 Auto ›). Debajo va el placeholder "Monto" grande en gris y un teclado numérico del sistema. **El toggle `- / +` no aparece mientras no haya monto.** |
| `20-transaccion-manual-lista-categorias.png` | Igual, con la fila de categorías abierta | La fila empieza con un círculo con "o" (no está claro qué hace; puede ser "sin categoría") y un `+`, y siguen 🛵 Domicilios, 📱 Plan celular, 🍔… |

### Configuración, Apple Pay, búsqueda y edición (21–30)
| Archivo | Pantalla | Detalles |
|---|---|---|
| `21-configuracion-3.png` | Configuración (más scroll) | 💵 Moneda ("$") y 💹 **Convertidor de moneda** ("No hay conversión automática activa en este momento"). Sección "Más": 💎 Premium ("Activa"). |
| `22-configuracion-4.png` | Configuración (final) | 💎 Premium, 🌗 Apariencia ("Define cómo se ve tu app"), 🆕 Novedades ("1.7.0 (121)"), ⭐ ¿Te gusta MonAi?, 🔔 Permitir notificaciones ("Garantizado sin spam", switch), 💳 Seguimiento automático de transacciones… ("Así funciona"), 𝕏 Twitter, ✉️ ¿Algún problema?, 📕 Legal. Para nosotros sobran Premium, reseña, Twitter y Legal. |
| `23-seguimiento-apple-pay.png` | Hoja "Seguimiento automático de transacciones en Apple Pay" | Ilustración de una pantalla de bloqueo con la notificación "🍔 New Transaction Added — $10.99 on McDonalds". Debajo, "**Permitir notificaciones** — Para recibir notificaciones sobre activadores de transacciones exitosas o fallidas" y `→ Continuar`. Es la referencia para la notificación propia de la Fase 3. |
| `24-ios-atajos-automatizacion.png` | **App Atajos de iOS** (no es MonAi) | Automatización "Cuando use sin contacto … tarjetas de pago de Wallet" → MonAi. **No aplica en Android.** En el A34 lo equivalente es que la app lea la notificación de Google Wallet (Fase 3). Samsung "Modos y Rutinas" se parece a Atajos, pero no está confirmado que pueda pasarle el monto y el comercio a otra app, así que no contamos con eso. |
| `25-busqueda-texto.png` | Búsqueda | Al tocar 🔍, el campo de búsqueda queda **abajo** (pastilla blanca) con un ✕ circular al lado, y el teclado se abre. **Se ocultan las barras y los chips de gasto/ingreso.** El Total se recalcula con los resultados (- 222,520). Aparece un tercer selector: "**Ingresos y gastos ⌃⌄**". La lista se agrupa por fecha ("9/9/25"). La fila muestra "+1" cuando hay más etiquetas de las que caben. Se busca por descripción y por categoría. |
| `26-busqueda-etiqueta.png` | Búsqueda por etiqueta | Al escribir `#ropadeverano` se convierte en un **chip-token** dentro del campo, seguido del placeholder "Buscar". Según la transcripción, se pueden **combinar varios filtros** (etiqueta + categoría + texto). |
| `27-editar-categorias-error-eliminar.png` | Editar categorías | Reutiliza la pantalla "Elige tus categorías" en una hoja con ✕. Las categorías van en **orden alfabético** y todas en su color pastel (Auto rosado, Comer afuera naranja, Compras lima, Domicilios arena, Lujo celeste, Mascotas beige, Plan celular gris, Ropa azul lavanda, Tecnología gris claro). La última celda es `+` con borde punteado. **Toast de error abajo:** ⊗ rojo "No se puede eliminar la categoría — La categoría ya está en tus transacciones". No se puede borrar una categoría que tenga movimientos. |
| `28-editar-etiquetas.png` | Hoja "Etiquetas" | Campo de entrada arriba ("#nu") y debajo un contenedor gris con chips (#bancolombia, #comida, #credito, #efectivo, #ropadeverano, #terpel, #tranporte). Las etiquetas van **en minúscula y sin espacios** ("ropa de verano" → #ropadeverano). |
| `29-transacciones-recurrentes.png` | "Lista de transacciones recurrentes" | Cada fila tiene la burbuja con el emoji y un **badge 🔁 pequeño en la esquina inferior derecha**. Va el título (2 líneas o con "…") y el subtítulo "**Categoría · próxima fecha · frecuencia**" ("Cuotas de manejo · 14/9 · Mensualmente"). Debajo, las etiquetas. El monto va en una pastilla, y en MonAi **se corta** ("- $10…"), lo cual es un bug que no hay que copiar. |
| `30-tus-listas.png` | Hoja "Tus listas" (encima de Configuración) | Subtítulo "Choose your current list" (no está traducido). Botones `+` y ✕. Cada fila tiene emoji (🤫 privada / 🤝 compartida), nombre (que puede llevar emoji: "✍️ Pruebas", "🍉 Charlie") y debajo "👤 Solo tú". La lista activa lleva ✓. Las listas múltiples son de una fase futura. |

### Ingresos y apariencia (31–34)
| Archivo | Pantalla | Detalles |
|---|---|---|
| `31-transaccion-ingreso.png` | Ingreso | "Sueldo 3 millones de pesos": el toggle **`+` está activo en verde** y el monto "$3,000,000" va **en verde**. Como no había categoría de ingreso, ninguna aparece seleccionada en la fila. Tiene la etiqueta #bancolombia. |
| `32-inicio-con-ingreso-1.png` | Inicio en modo ingresos | Total "+ 2,918,480 $". Chips: "- $581,520.00" (sin seleccionar) y **"+ $3,500,000.00" en un chip lima seleccionado**. **Al tocar un chip, las barras cambian entre gastos e ingresos.** Hay una barra 🤑 de 3.5M. La fila de ingreso lleva el monto en una **pastilla oscura con texto blanco y ⊕** ("⊕ $3,500,000.00"), a diferencia de la pastilla gris de los gastos. Lista "Gastos pareja". |
| `33-inicio-con-ingreso-2.png` | Duplicado de 32 | Es la misma pantalla con otro recorte. |
| `34-apariencia.png` | Hoja "Apariencia" | Opciones 📱 Sistema ✓, 🌑 Oscuro y 🌕 Claro. Detrás se ve Moneda "COP" y el convertidor "Convirtiendo de EUR a COP ahora". |

---

## TikTok/ (más reciente)

### Presupuestos (01–10, 18–19). Misma interfaz que el video, con presupuestos agregados
| Archivo | Pantalla | Detalles |
|---|---|---|
| `01-inicio-con-presupuestos.png` | Inicio con presupuestos | El título "Presupuestos" es del video. Chip de gastos **oscuro** ("- $706,521.00"), mientras que en el video era rojo. Barras: 🥑 250K 71%, 🍔 192K 77%, 🐶 125K 42%, 🚗 85K, y una quinta cortada. El **contorno punteado** marca el presupuesto. El emoji, el monto y el % van dentro de la barra, abajo. En las barras bajas, el emoji y el monto van en una sola línea. Se ve el **ícono de chat** abajo (`+ 💬 🔍`). |
| `02-inicio-sin-presupuestos.png` | Inicio antes de los presupuestos, con una barra presionada | Se está presionando la barra 🐶 125K: **queda resaltada y las demás se desvanecen**. |
| `03-configuracion-presupuestos.png` | Configuración nueva | **"💰 Presupuestos"** aparece como segunda fila en "Contenido", debajo de Editar categorías. El subtítulo de la lista ahora lleva emoji: "En tu lista actual \"✍️ Pruebas\"". |
| `04-editar-presupuesto.png` | Editar presupuesto de "Mercado" | Hoja apilada sobre "Presupuestos". ✕ a la izquierda y **✓ en un círculo amarillo-verde** a la derecha. Nombre "Mercado", emoji 🥑 en un cuadro de color, "Cambiar color del presupuesto" con una fila de círculos pastel (el elegido lleva anillo oscuro), input "$|" y teclado numérico. Ojo: aquí la categoría se llama **Mercado** (antes era "Compras"). |
| `05-inicio-primer-presupuesto.png` | Inicio con un solo presupuesto | Solo 🥑 tiene contorno punteado y % (alrededor de 52%, no se lee bien). Las otras barras salen como cuadros bajos. Puede ser un frame a mitad de la animación. |
| `06-menu-barra-anadir-presupuesto.png` | Mantener presionada una barra (sin presupuesto) | Aparece un popover con "**↑ Añadir presupuesto**" en negrita, debajo un monto gris ("$193,521.00", probablemente el gasto de esa categoría; no es seguro) y "**↓ Nueva transacción**". Así se crea un presupuesto o un movimiento directamente en esa categoría. |
| `07-widget-presupuestos.png` | Widget de iOS | Es un widget pequeño con 3 filas. Cada una lleva el emoji dentro de un **anillo de progreso punteado**, el monto y un estado: 🚗 **"$70K Excedido" en rojo**, 🐶 "$75K Restante", 🍔 "$108.5K Restante". O sea, el widget muestra **lo que queda del presupuesto** y no lo gastado. |
| `08-inicio-presupuesto-excedido.png` | Inicio con presupuesto excedido | 🥑 250K 62%, 🐶 225K 75%, 🍔 192K 64%, 🚗 85K. Las barras se **ordenan por gasto**. **Todas las barras usan una escala común:** la altura es proporcional al monto, tanto en el relleno como en el contorno (400K de Mercado se ve más alto que 300K de Mascotas). Esto corrige la nota anterior, donde decía que cada barra tenía su propia escala. **Presupuesto excedido:** 🚗 (presupuesto de $15.000) se ve **rosado/rojo, con el contorno punteado rojo por dentro de la barra**, porque es más bajo que el relleno. La línea roja curva es una edición del video. |
| `09-presupuestos.png` | Hoja "Presupuestos" | Tarjeta "🔔 Alertas de presupuesto" con switch apagado. "**Recomendaciones**": 🥑 Mercado $400,000, 🍔 Comer afuera $300,000, 🐶 Mascotas $300,000, 🚗 Auto $15,000 y 💎 Lujo (sin monto, con un subtítulo gris tenue). "**Otras**": 👖 Ropa y 🤑 Salario. Cada fila lleva el emoji en un cuadro redondeado de color y un chevron ›. |
| `10-presupuestos-alertas-umbral.png` | Alertas activadas | El switch se pone **rojo coral** (no verde). Aparece "Umbral de alerta" con **85%** a la derecha y un slider de pista roja con el resto en gris. |
| `18-menu-barra-editar-presupuesto-1.png` | Mantener presionada una barra (con presupuesto), zoom | Popover con "↑ Editar presupuesto", debajo "**$22.3K restante**" y "↓ Nueva transacción". La barra presionada (🎮 68K, rosada) se resalta y el resto se desvanece. Lista "🍉 Charlie". |
| `19-menu-barra-editar-presupuesto-2.png` | La misma pantalla completa | **El Total muestra 68,879.56, que es el monto de la categoría presionada** (68K). Al seleccionar una barra, el Total pasa a ser el de esa categoría. Fila "Domicilios · Masa 70 · #domicilio". |

### Rediseño de la pantalla principal (`v2-*`, 11–17). Versión más nueva de MonAi
| Archivo | Pantalla | Detalles |
|---|---|---|
| `12-v2-inicio.png` | **Inicio nuevo** | Cambios frente a la versión anterior: (1) el selector de lista va **arriba a la izquierda** ("Personal ⌄") y desaparecen los chips "Este mes / en lista"; (2) arriba a la derecha hay un **ícono de calendario** y el engranaje; (3) el encabezado va **centrado**, con una línea pequeña "**$218,650** sobre presupuesto" (monto en rojo), luego "⊕ 3,646,350 $", y debajo **"🔴 3,853,650" y "🟢 7,500,000" como punto + número, sin chips**. Barras: 💡 1.16M 116% (verde), 🛍️ 829K 92%, 🍔 684K 91%, 🎮 565K 113%, ❤️ 50… Cuando se excede el presupuesto, el **relleno sobrepasa el contorno punteado**. En las filas, el monto va **como texto plano con "-"** y no en pastilla. Hay ejemplos colombianos: "Salud · Suplementos del gimnasio #gimnasio - $99,000", "Servicios · Factura de agua - $120,000", "Transporte · TransMilenio diario - $17,500". Encabezado "ayer" con -$330,300 a la derecha. |
| `11-v2-menu-listas.png` | Menú de listas (v2) | Desplegable desde "Personal ⌄" con "Opa!", ✓ Personal, Trabajo y 🌵 Finanzas con Dios. Abajo tiene una fila de acciones: **Compartir**, **Editar** y **Nueva**. El estilo es de vidrio esmerilado (iOS 26). |
| `13-v2-filtro-meses.png` | Tira de meses | Al filtrar por mes aparece una **tira horizontal de meses** debajo del encabezado (julio, **agosto $3,646,…**) para deslizar. El ícono de calendario lleva un ✕ pequeño (filtro activo, tocar para quitarlo). |
| `14-v2-menu-periodo.png` | Menú del calendario | ✓ **Mes**, 📅 **Año**, ∞ **Todo el tiempo**, 📅 **Rango personalizado…** y, separado, ⚙️ **Cambiar período predeterminado**. |
| `15-v2-rango-personalizado-1.png` | Rango personalizado, inicio | Con el modo Año aparece una **tira de años** (2024, 2025, **2026 $21,244,850**, 2027, 2028). Hoja con ✕, "Agosto de 2026 ›" (chevron rojo), semana **de lunes a domingo** y el día de hoy (4) en rojo. Pie de página: "Toca una fecha para comenzar tu rango". |
| `16-v2-rango-personalizado-2.png` | Rango seleccionado | "Julio de 2026" con flechas ‹ ›. Los días 20 a 31 van en **círculos oscuros rellenos** y el pie dice "jul 20 – 31". |
| `17-v2-periodo-predeterminado.png` | Hoja "Período predeterminado" | "Si no quieres que tu vista de inicio se reinicie cada mes, puedes cambiarlo aquí." Muestra una vista previa deslizable de períodos ("jul 6 – ago 5" con su monto, y los vecinos desvanecidos). Opciones: **Frecuencia: Mensual ⌄** y **Desfase: 6 ⌄**. Botón oscuro `✓ Aplicar`. **Sirve para que el "mes" empiece el día de pago** (p. ej. del 6 al 5). |

---

## Decisiones (31 oct 2026)
1. Pantalla principal: **rediseño v2 tal cual** (`TikTok/12`–`17`).
2. Voz con varios gastos: **movimientos separados** + pantalla de resumen; al tocar uno se edita.
3. Gastos/ingresos: el `-` / `+` del encabezado v2 se resalta en **rojo / verde** al tocarlo.
4. Onboarding: sí, sin paywall.
5. Listas con categorías propias; sin compartir por ahora.
6. Panel de cuentas a la derecha del inicio: maqueta hardcodeada (`src/components/accounts/AccountsPanel.tsx`).
