# RVF Malinois — Sistema de Diseño Industrial

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

# Parte I — Filosofía y Lenguaje Visual

## 1. Filosofía Visual de RVF Malinois

Un sistema de diseño industrial no existe para que la plataforma se vea “bonita”, sino para que un operador, en la hora once de un turno de doce, pueda evaluar el estado de una prueba de pozo en cinco segundos sin equivocarse. Cada token de color, cada tamaño de letra y cada borde de este documento sirve a esa meta.

**La idea central.** El trabajo del sistema de diseño es la contención, no la expresión. Lo que hace que el software de SLB, Honeywell o Emerson se vea serio es precisamente lo que se niega a hacer: sin degradados, sin sombras para separar, sin esquinas tipo pastilla, sin medidores arcoíris, sin parpadeos, sin iconos decorativos. La sobriedad disciplinada es la estética; no es ausencia de diseño, es diseño maduro.

**La filosofía en una frase.** RVF Malinois se ve calmado cuando todo está normal, denso de información sin estar abarrotado, y absolutamente honesto sobre la calidad del dato. El color es un lenguaje de cuatro palabras (normal, advertencia, alarma, sin dato), no decoración. Esta filosofía gobierna las 37 secciones de este documento y se retoma, ya razonada, en la Parte VII.

## 2. Lenguaje Visual Industrial

El lenguaje visual de la plataforma se basa en cinco rasgos que comparten Honeywell Forge, Emerson DeltaV, AVEVA PI Vision y los sistemas de SLB y Baker Hughes:

- **Neutralidad de base.** Lienzos y superficies grises o casi negras. La pantalla “en calma” es la pantalla normal.

- **Color con significado.** El color saturado se reserva para estado anormal, la marca y el indicador de dato en vivo. Nada más lleva color fuerte.

- **Densidad ordenada.** Mucha información por pantalla, pero siempre en el mismo sitio y con la misma forma. La densidad se gana con jerarquía, no con relleno.

- **Geometría sobria.** Bordes finos de 1 px, esquinas poco redondeadas, sin sombras difusas. La nitidez comunica precisión.

- **Honestidad del dato.** Un dato malo se ve distinto a uno bueno; un hueco se ve como hueco. El sistema nunca aparenta más certeza de la que tiene.

## 3. Disciplina de Color ISA-101

ISA-101 es la norma de interfaces humano-máquina de alto rendimiento. Su principio central rige toda la paleta de RVF Malinois: en estado normal, la pantalla es ~90% neutra; el color satura solo lo anormal.

- **El verde se usa con sobriedad.** “Todo bien” se comunica por la AUSENCIA de alarma, no por un mar de verde. El verde es a lo sumo un punto pequeño, nunca un relleno grande.

- **El rojo y el ámbar son recursos finitos de atención.** Si todo es rojo, nada es rojo. Gastarlos en lo trivial los inutiliza cuando de verdad importan (una sobrepresión en el separador).

- **Un color, un significado, siempre.** Rojo es alarma en la tarjeta, en el mosaico, en el mímico y en el centro de alarmas. Jamás cambia de sentido entre pantallas.

**Por qué esto es lo más importante del documento.** La diferencia entre un panel que parece de Honeywell y uno que parece un juguete es, casi por completo, esta disciplina de color. Un solo gráfico con relleno degradado o un medidor 3D arcoíris destruye la credibilidad de toda la plataforma ante un cliente como Repsol.

## 4. Serio vs Amateur en Software Industrial

La frontera entre verse “serio” y verse “amateur” es concreta y se puede listar.

| **Se ve SERIO (Honeywell/Emerson)**       | **Se ve AMATEUR (SaaS/startup)**            |
|-------------------------------------------|---------------------------------------------|
| Paleta neutra; color = significado        | Degradados y colores por todas partes       |
| Bordes de 1 px para separar               | Sombras suaves y grandes para separar       |
| Cifras tabulares de ancho fijo            | Cifras proporcionales que “bailan”          |
| Radio de esquina contenido (0–4 px)       | Todo tipo “pastilla” muy redondeado         |
| Iconos de línea, monocromos               | Iconos de colores, emojis, mascotas         |
| Estados vacíos sobrios y útiles           | Ilustraciones grandes y simpáticas          |
| Movimiento mínimo y con sentido           | Animaciones rebote, parpadeos               |
| Calidad y huecos mostrados con honestidad | Dato malo disfrazado de bueno               |
| Densidad ordenada y consistente           | Tarjetas grandes con poco dato y mucho aire |

**La prueba decisiva.** Si una pantalla de RVF Malinois se pusiera junto a una captura de AVEVA PI Vision, deberían pertenecer al mismo mundo. Si se parece más a un panel de marketing de una startup, el sistema de diseño falló.

## 5. Anti-patrones de UI a Evitar

Lista de verificación negativa. Ninguno de estos elementos debe aparecer en RVF Malinois:

1.  Medidores o diales 3D/skeuomórficos. Son el sello del software industrial amateur.

2.  Gráficos con relleno degradado o área de color bajo la curva.

3.  Sombras difusas para separar tarjetas (usar bordes de 1 px).

4.  Color sin significado (decorar con verde/azul porque “se ve lindo”).

5.  Alarmas que parpadean en bucle (fatiga; contrario a ISA-18.2).

6.  Interpolar un hueco de datos para que la curva “se vea continua”.

7.  Auto-escalar el eje Y hasta que el ruido parezca un evento.

8.  Cifras proporcionales en valores que se actualizan en vivo.

9.  Emojis o iconos juguetones; ilustraciones tipo mascota en estados vacíos.

10. Menú hamburguesa en la consola de sala de control.

11. Ocultar la calidad del dato para que “se vea limpio”.

12. Diseño “mobile-first” genérico en vez de “sala de control + tablet de campo”.

13. Botones tipo “pastilla” gigantes y estética de página de aterrizaje.

14. Tomar la apariencia por defecto de ThingsBoard como si fuera el producto.

# Parte II — Tokens Fundamentales

## 6. Sistema de Tokens de Color

Un token es un nombre con significado al que se le asigna un valor. El componente pide el significado (“estado de advertencia”); el tema decide el color exacto. Esto permite cambiar entre modo oscuro y claro sin tocar los componentes.

![Especimen de diseño](./RVF_Malinois_Sistema_Diseno_media/media/59ba2aef4ceb6f922f461c6f02690a9582134ec8.png)

*Especimen — Sistema de tokens de color (modo oscuro, modo claro, semántico)*

- **Nombres semánticos, jamás literales.** Se usa status/warning, nunca “amarillo-500”. El componente no sabe ni le importa qué hex es; solo conoce el significado.

- **Tres familias.** Estructura (fondos, bordes, texto), marca (azul y cian RVF) y estado (normal, advertencia, alarma, sin dato, info, crítico).

- **Paleta de series para gráficos.** Categórica y desaturada: las curvas se distinguen sin gritar. Nunca colores puros y saturados en una tendencia.

## 7. Reglas de Color Semántico

| **Token**       | **Significado operativo**        | **Ejemplo en Well Testing**                  |
|-----------------|----------------------------------|----------------------------------------------|
| status/normal   | Variable dentro de rango         | Presión de entrada estable a 1245 psi        |
| status/warning  | Acercándose a un límite          | Batería de un Sentinel RTD \< 20 %           |
| status/alarm    | Límite superado, requiere acción | Nivel del separador en HI                    |
| status/critical | Crítico extremo (HI_HI)          | Sobrepresión peligrosa en el separador       |
| status/stale    | Sin dato / sensor caído          | Pressure Scout sin reportar hace 9 min       |
| brand/accent    | Dato en vivo / foco              | Indicador de que el caudal es en tiempo real |

- **Regla de aplicación.** El color de estado se aplica como un punto, un chip o un borde; nunca como un relleno grande de tarjeta. Una tarjeta no se “pinta” de rojo: muestra un punto o un borde rojo.

- **El estado normal no necesita color.** Lo ideal es que una pantalla totalmente normal casi no tenga verde. La calma comunica salud mejor que el verde.

## 8. Modo Oscuro y Modo Claro

- **Oscuro por defecto en sala de control.** Lienzo profundo, baja luminancia, texto que NO es blanco puro (#E6EDF3): reduce el halo y la fatiga en turnos de 12 horas y evita que la pantalla mural ilumine la sala.

- **Claro de alto contraste para tablet de campo.** Bajo sol directo el modo oscuro es ilegible. El tablet del ingeniero junto al EMMAD necesita fondo claro y alto contraste. Es un requisito operativo, no una preferencia.

- **Portal del cliente: claro por defecto.** Más cercano a un informe profesional; el cliente no está en una sala de control.

- **Mismos significados en ambos modos.** Rojo es alarma en oscuro y en claro. El usuario no reaprende la interfaz al cambiar de tema. Solo cambian los valores de fondo y texto; los tokens de estado se mantienen equivalentes.

## 9. Escala Tipográfica

Pocos tamaños, jerarquía clara. La consistencia tipográfica reduce la fatiga y construye la memoria visual del operador.

![Especimen de diseño](./RVF_Malinois_Sistema_Diseno_media/media/076a9637fdeaf02f04efe7d6f22c6448024d2fea.png)

*Especimen — Escala tipográfica y reglas de tipografía numérica*

## 10. Familias Tipográficas

- **Una sola familia de interfaz, sin serifas, geométrica y legible.** Recomendada: Inter (alternativas: IBM Plex Sans, Roboto). Debe incluir cifras tabulares.

- **Una familia monoespaciada para códigos.** Recomendada: IBM Plex Mono. Para identificadores (PS-118), nombres de tag (p_inlet), horas y registros: el ancho fijo evita ambigüedad.

- **Nada de fuentes decorativas.** Ni serifas, ni condensadas, ni display. Una familia, pocos pesos (regular, medium, bold).

## 11. Tipografía Numérica

El detalle que más distingue al software industrial serio. Los datos son números que cambian; deben comportarse como en un instrumento, no como en un blog.

```
REGLAS NUMÉRICAS (innegociables)
proporcional: 1245 -> 998 -> 1011 (las cifras se desplazan)
tabular: 1245 -> 0998 -> 1011 (columnas estables) <-- usar
· Cifras tabulares (font-variant-numeric: tabular-nums) SIEMPRE
· Precisión por tag, definida en el diccionario:
p_inlet -> 0 dec water_cut -> 1 dec gor -> 0 dec
· Unidad en peso menor y apagado, junto al valor
· Números alineados a la derecha en tablas
· Nunca abreviar valores vivos: jamás "1.2k psi"
· Separadores de miles consistentes en toda la app
```

**Por qué importa.** Un valor de presión que se actualiza cada 5 segundos con cifras proporcionales “baila” horizontalmente y obliga al ojo a reposicionarse en cada lectura. Con cifras tabulares el valor es una columna estable, como un instrumento de campo. Es la clase de detalle que un ingeniero de Repsol percibe de inmediato.

## 12. Espaciado, Grilla, Borde y Elevación

![Especimen de diseño](./RVF_Malinois_Sistema_Diseno_media/media/46aa297efe7c53335d7376deb34a8e1557aa55a4.png)

*Especimen — Escala de espaciado, radio, borde y elevación*

- **Espaciado base 4 px.** Escala: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Interno de componente 4/8/12; padding de tarjeta 16; separación de secciones 24/32.

- **Grilla de 12 columnas fluida.** Canalón 16 px (escritorio), 12 px (tablet). Sin ancho máximo en tableros de operación (a pantalla completa); el contenido de lectura (reportes) sí limita a ~1200 px.

- **Bordes, no sombras.** Separación con bordes de 1 px. Sombra MUY tenue permitida solo en elementos transitorios (menús, modales), jamás en tarjetas fijas. Es el diferenciador “serio vs amateur” más visible.

- **Radio contenido.** 0 px en tablas y mímicos; 2 px en chips; 4 px en tarjetas; 6 px en modales. La moderación del radio señala industria; el radio grande señala SaaS.

- **Elevación mínima.** Solo dos niveles reales: superficie (borde 1 px) y overlay transitorio. La jerarquía se logra con borde y fondo, no con profundidad simulada.

# Parte III — Componentes

## 13. Sistema de Tarjetas

La tarjeta es el contenedor base. Patrón único para que el operador la lea siempre igual.

- **Estructura fija.** Encabezado (etiqueta en mayúsculas micro + punto de estado), cuerpo, pie opcional con metadatos apagados. Superficie plana, borde 1 px, padding 16 px.

- **Sin sombra.** La tarjeta se separa por su borde, no por una sombra. Coherente con la disciplina de elevación.

- **El estado se comunica con moderación.** Un punto de color, o un borde de 2 px solo en alarma. Nunca se “pinta” toda la tarjeta de color.

## 14. Componente KPI

El KPI es el ladrillo más repetido de la plataforma (presión, temperatura, caudal, corte de agua). Su anatomía es fija.

![Especimen de diseño](./RVF_Malinois_Sistema_Diseno_media/media/597b70809cfdc3ac486b155c2cd0e52827e0c0a4.png)

*Especimen — Anatomía del componente KPI y sus variantes de estado*

- **Siempre valor + tendencia + calidad.** Nunca un número solo. Una presión sin su dirección y sin su sparkline es la mitad de la información que el ingeniero necesita en una prueba.

- **Sparkline sobrio.** 1.5 px, sin relleno, sin eje, en color de acento o de estado si es anormal. Da el “hacia dónde va” de un vistazo.

- **Calidad explícita.** Si el dato es estimado o viejo, la tarjeta lo dice (“estimado”, “dato 9 min”). Jamás finge precisión.

## 15. Componentes de Alarma

![Especimen de diseño](./RVF_Malinois_Sistema_Diseno_media/media/472bc17f66875252d7eeb5914f328b6729cf2e02.png)

*Especimen — Chips de prioridad, anatomía de fila y estados de alarma*

- **Chip de prioridad sólido.** Bloque de color, no texto coloreado. Cuatro prioridades fijas, mismo color en todo el sistema.

- **Fila densa y escaneable.** Prioridad, hora (monoespaciada), pozo, fuente (monoespaciada), condición, valor, estado. Selección = barra de acento a la izquierda.

- **Jamás parpadeo continuo.** Un solo pulso de atención al llegar la alarma; luego, estática. El parpadeo en bucle es fatiga y contradice ISA-18.2.

- **Banner global persistente.** El conteo de alarmas activas vive en la barra superior en todas las pantallas; su color es la prioridad activa más alta.

## 16. Diseño de Tablas

- **Densas pero ordenadas.** Filas de 32–40 px, encabezado en mayúsculas micro apagado, sin líneas de grilla pesadas (solo separadores horizontales tenues).

- **Números a la derecha, tabulares.** Toda columna numérica alineada a la derecha con cifras de ancho fijo; identificadores y tags en monoespaciada.

- **Encabezado fijo.** Al desplazar una lista larga de sensores o alarmas, el encabezado permanece. El operador nunca pierde el contexto de columnas.

- **Cebra sutil o nula.** Si hay alternancia de fondo, debe ser casi imperceptible. La tabla es para leer datos, no para decorar.

## 17. Gráficos de Tendencia

La filosofía de graficado es la del instrumento, no la del informe de marketing.

- **Solo líneas, sin relleno.** Línea de 1.5 px, paleta de series desaturada. Nada de áreas degradadas, 3D ni brillos.

- **Eje de tiempo compartido y estable.** Varias variables apiladas con el mismo eje temporal para correlacionar (ver caer la presión al cambiar el choke). El eje Y no auto-amplía el ruido.

- **Líneas de límite.** Umbrales lo/hi como referencias punteadas tenues: se ve de inmediato cuán cerca está el valor del límite.

- **Calidad y huecos honestos.** Dato malo punteado y atenuado; hueco dibujado como hueco. Coherente con la Fundación Técnica.

- **Tooltip de cruceta.** Una guía vertical muestra todos los valores de las series en ese instante, con la hora en UTC.

## 18. Mímicos SCADA y Símbolos

El mímico es la representación esquemática de un equipo con sus valores donde físicamente ocurren. Es el lenguaje del SCADA industrial.

![Especimen de diseño](./RVF_Malinois_Sistema_Diseno_media/media/b2cbc46f54bbf8574c4e25aa505221eb59e2a884.png)

*Especimen — Disciplina de mímico ISA-101: el mismo separador, normal vs anormal*

- **Esquemático 2D, jamás 3D.** Nada de recipientes foto-realistas ni skeuomórficos. Un esquema legible que ubica presión de entrada, presión y nivel de separador, salida de gas, petróleo y agua.

- **Biblioteca de símbolos consistente.** Recipiente, tubería, válvula-como-estado, flecha de flujo, choke, quemador. El mismo símbolo significa lo mismo en todo el sistema (EMGAD, EMMAD, separador, choke manifold).

- **Gris en normal; color solo en anormal.** El separador “sano” casi no tiene color; una condición anormal aparece y resalta sola.

- **Sin controles operables.** El mímico refleja, no acciona. Coherente con el alcance de solo lectura.

## 19. Navegación, Barra Superior y Banner

- **Barra lateral fija, siempre visible.** Como en las consolas SCADA: sin menús ocultos ni hamburguesa en la sala de control. Lo que el operador necesita está a un clic. El ítem activo se marca con la marca RVF.

- **Barra superior persistente.** Logo, selector de cliente (solo personal RVF), banner global de alarmas y reloj con turno. Presente en todas las pantallas.

- **Banner de alarmas.** Conteo de alarmas activas siempre visible; color = prioridad activa más alta; al tocarlo lleva al Centro de Alarmas. El operador nunca “pierde” una alarma por estar en otra vista.

- **Migas de pan.** Flota › CN-014 › EMMAD-07 › PS-118. Ubicación siempre clara, retroceso sin perder contexto.

## 20. Iconografía

- **Iconos de línea, trazo 1.5 px, rejilla 20/24 px.** Geométricos, monocromos, heredan el color del texto. Conjunto mínimo y funcional.

- **Sin iconos de relleno juguetones, sin emojis.** El icono informa o etiqueta; no decora ni entretiene. Coherente con el tono industrial.

- **Significado estable.** Un icono = un concepto en todo el sistema (alarma, sensor, pozo, equipo, tendencia).

# Parte IV — Layout y Densidad

## 21. Sistema de Densidad

La densidad correcta depende de quién mira y desde dónde. Densidad alta no es desorden: un avión de combate es denso pero todo está donde el piloto lo espera.

| **Contexto**              | **Densidad** | **Razón**                                   |
|---------------------------|--------------|---------------------------------------------|
| Mosaico mural (multipozo) | Baja         | Se ve a distancia; pocas variables, grandes |
| Consola del operador RVF  | Alta         | De cerca; necesita ver mucho a la vez       |
| Detalle de pozo           | Media-alta   | Equilibrio entre contexto y profundidad     |
| Portal del cliente        | Media-baja   | Claridad y confianza sobre exhaustividad    |
| Tablet de campo           | Baja         | Guantes, sol, movimiento; objetivos grandes |

## 22. Layout de Escritorio (sala de control)

- **Aprovecha el ancho.** Es el escenario principal: barra lateral fija + área de trabajo amplia. Mosaico de pozos, varias tendencias a la vez, banner siempre visible.

- **Grilla de 12 columnas.** Tarjetas con ancho mínimo (KPI 220 px, tile de pozo 360 px, panel de gráfico 480 px); la grilla auto-rellena según el monitor.

- **Sin scroll horizontal jamás.** En una sala de control, el desplazamiento lateral es una falla de diseño.

## 23. Layout de Pantalla Mural

- **Legible a varios metros.** Tipografía grande, alto contraste, pocas variables por panel. Es la vista proyectada todo el turno.

- **Máxima calma.** Con 8 pozos normales la pared es gris y quieta. El pozo en alarma es lo único con color: salta solo.

- **Sin interacción fina.** La pared se mira, no se opera. Cero elementos que requieran precisión de cursor.

## 24. Layout de Tablet de Campo

- **Objetivos táctiles grandes.** Mínimo 44 px; el ingeniero usa guantes junto al separador. Una variable o un pozo a la vez.

- **Alto contraste y modo claro.** Bajo sol directo. Brillo y contraste sobre estética.

- **Gestos mínimos y predecibles.** Tocar para ver, deslizar para cambiar de pozo. Nada oculto: con guantes y prisa, lo oculto no existe.

## 25. Layout de Alerta Móvil

- **El teléfono es visor de alerta, no herramienta de trabajo.** Notificación de alarma, estado rápido de un pozo, confirmar que la prueba sigue bien.

- **Una cosa por pantalla.** Sin densidad: la alarma, el pozo, el valor. Suficiente para decidir si hay que actuar.

- **Honesto con la conexión.** Si el satélite falla, muestra “dato de hace X”, nunca un dato viejo como si fuera actual.

## 26. Comportamiento Responsive

RVF Malinois no es “mobile-first” genérico: es “sala-de-control-primero y tablet-de-campo-después”. Tres puntos de quiebre con intención, no infinitas variantes:

- **Monitor de sala (ancho).** Layout completo, máxima densidad, banner y barra lateral fijos.

- **Tablet (medio, táctil).** Densidad reducida, objetivos grandes, modo claro disponible, una columna principal.

- **Teléfono (estrecho).** Solo consulta y alerta; una tarjeta a la vez. No se intenta meter la consola completa.

## 27. Jerarquía Visual Industrial

En cada pantalla, el ojo debe ir primero a lo que importa para la seguridad y la operación, en este orden:

15. Estado anormal (alarma o sin dato): lo único con color fuerte.

16. La variable crítica de esa pantalla (p. ej. presión del separador en el detalle de pozo).

17. Tendencia y contexto (hacia dónde va, comparado con su límite).

18. Metadatos y navegación (apagados, presentes pero secundarios).

La jerarquía se construye con tamaño, peso, posición y —con moderación— color; nunca con decoración.

# Parte V — Estados y Calidad de Dato

## 28. Estados de Carga, Vacío y Error

- **Carga (skeleton).** Bloques neutros con la forma final del contenido, pulso lento (1.5 s). Sin spinners para contenido; el spinner se reserva para acciones puntuales.

- **Vacío.** Una línea y un icono sutil que explican por qué (“No hay pruebas activas”). Sin ilustraciones grandes ni mascotas: el vacío también debe verse profesional.

- **Error.** Factual: qué falló y qué hacer, con acción de reintento. Sin dramatismo de pantalla roja. Nunca culpar al usuario.

## 29. Estado de Sensor Desconectado

Crítico para RVF: la telemetría llega de sensores SignalFire a batería. Un sensor caído NO debe verse como un pozo en cero.

- **Estado explícito.** “Sin reportar — hace 9 min”, con el color status/stale (gris), no rojo de alarma de proceso.

- **Último valor conocido, atenuado y fechado.** Se muestra tenue y con su hora real; jamás como si fuera el valor actual.

- **Alarma de instrumentación separada.** Un sensor sin reportar genera su propia alarma, distinta de las de proceso, para no contaminar el centro de alarmas operativas.

## 30. Calidad de Dato y Huecos Históricos

![Especimen de diseño](./RVF_Malinois_Sistema_Diseno_media/media/0b14cddccf789832906ea55d47f9d5c6ba6cd8f3.png)

*Especimen — Calidad de dato, huecos históricos y estados de pantalla*

- **La calidad se ve.** Bueno: línea normal. Estimado: punteado con marcador. Incierto: atenuado. Malo: atenuado y punteado, jamás como bueno. Leyenda de calidad siempre visible.

- **El hueco se ve como hueco.** Si el satélite o un sensor cayó, la curva se interrumpe y se etiqueta (“sin datos 14:02–14:38”). Jamás se interpola: un hueco no es producción cero.

# Parte VI — Movimiento y Accesibilidad

## 31. Filosofía de Animación y Movimiento

El movimiento comunica cambio de estado y causalidad; nunca decora. En una sala de control, una animación innecesaria repetida mil veces en un turno es fatiga.

- **Calma por defecto.** Si todo está normal, nada se mueve. El movimiento se reserva para lo que de verdad requiere atención.

- **Actualización de valor sutil.** A lo sumo, un desvanecimiento de 150 ms del dígito que cambió; nunca se anima la tarjeta entera.

- **Alarma: un solo pulso.** Una llamada de atención no repetitiva al llegar; luego estática. Nunca parpadeo en bucle.

- **Sin rebotes ni resortes.** Las animaciones tipo “spring” juguetón son estética de SaaS; aquí, transiciones funcionales y sobrias.

## 32. Tiempos de Transición

```
TOKENS DE MOVIMIENTO
motion/fast 120 ms cambios pequeños (hover, foco)
motion/base 180 ms paneles, navegación
motion/slow 240 ms modales, overlays
easing ease-out cubic-bezier(0.2, 0, 0, 1)
· Nunca curvas con rebote / overshoot
· Respetar SIEMPRE prefers-reduced-motion (desactiva todo)
```

## 33. Accesibilidad y Daltonismo

- **Contraste AA o superior.** Texto ≥ 4.5:1; texto grande y elementos de UI ≥ 3:1. Por eso el texto en modo oscuro es #E6EDF3, no blanco puro.

- **Nunca solo color.** El estado se distingue además por forma, posición y etiqueta: un chip de alarma tiene color Y texto Y posición. Un operador con daltonismo rojo-verde debe poder operar igual.

- **El normal es ausencia, no verde.** Como “todo bien” se comunica por la falta de alarma y no por verde, el daltonismo rojo-verde no compromete la seguridad.

- **Foco visible y teclado completo.** Anillo de foco de 2 px; toda la consola operable por teclado. Objetivo táctil mínimo 44 px en campo.

## 34. UX para Turnos de 12 Horas

- **Calma sostenida.** Pantalla quieta y oscura en estado normal. Nada parpadea ni se anima sin motivo.

- **Consistencia absoluta.** El mismo dato siempre en el mismo lugar, con el mismo formato. La memoria muscular del operador es un activo de seguridad.

- **Bajo ruido visual.** Menos bordes, menos cajas, menos decoración. El operador debe ver datos, no adornos.

- **Entrega de turno.** Una vista que resume las últimas horas, alarmas pendientes y pozos a vigilar, para que el relevo no empiece a ciegas.

# Parte VII — Implementación

## 35. Recomendaciones para React / Next.js

Sin generar código todavía, estas son las decisiones de implementación que mantienen el sistema de diseño íntegro:

- **Tokens como variables CSS.** Definir todos los tokens como custom properties y cambiar de tema con un atributo data-theme (dark/light). Los componentes usan el nombre semántico, jamás un hex literal.

- **Configurar Tailwind/estilos contra los tokens.** Si se usa Tailwind, su tema se mapea a los tokens semánticos. Prohibido escribir colores arbitrarios en los componentes (regla de lint que rechace hex literales).

- **Primitivas reutilizables.** Construir una sola vez: Card, KpiTile, AlarmRow, DataTable, TrendChart, MimicCanvas, StatusDot, QualityBadge. Las pantallas se componen con ellas; nunca se reinventa un KPI.

- **Formateador numérico central.** Una utilidad única aplica la precisión por tag y cifras tabulares. Prohibido un toFixed suelto en cada componente.

- **Librería de gráficos con control total.** Una que permita desactivar lo decorativo (sin degradados, sin área, sin auto-zoom) y forzar fuentes tabulares; reducción de resolución en el servidor para rangos largos (ver Fundación Técnica).

- **Contexto de densidad y de tema.** Un parámetro de densidad (cómoda para tablet, compacta para sala) y el tema (oscuro/claro) viven en contexto, no repartidos por la app.

- **Movimiento centralizado.** Un único archivo de tokens de movimiento; respetar prefers-reduced-motion de forma global.

- **Independiente de la fuente de datos.** El sistema de diseño no depende de ThingsBoard: los componentes consumen la API propia de RVF (patrón de envoltura de la Fundación Técnica), no el aspecto por defecto de ThingsBoard.

## 36. Lista de Verificación del Sistema (V1)

Lo mínimo que debe existir para que la versión 1 sea coherente:

- Tokens de color (oscuro + claro + semántico) y de tipografía, espaciado y movimiento.

- Modo oscuro (sala) y modo claro (campo/portal) funcionando con el mismo set de tokens.

- Primitivas: Card, KpiTile, AlarmRow, DataTable, TrendChart, StatusDot, QualityBadge.

- Formateador numérico con cifras tabulares y precisión por tag.

- Gráfico de tendencia con líneas de límite, calidad y huecos honestos.

- Estados: skeleton, vacío, error, sensor sin reportar.

- Disciplina ISA-101 aplicada (revisión: ¿la pantalla normal es ~90% neutra?).

- Accesibilidad: contraste AA, estado nunca solo por color, foco visible.

- Un mímico base (separador) con la biblioteca de símbolos inicial.

Postergar: animaciones avanzadas, mímicos completos de todo el tren, personalización de tableros por usuario, temas adicionales. Primero estandarizar; luego flexibilizar.

## 37. Glosario

| **Término**            | **Significado**                                                             |
|------------------------|-----------------------------------------------------------------------------|
| Token                  | Nombre con significado al que el tema asigna un valor                       |
| Token semántico        | Nombre por significado (status/warning), no por color literal               |
| ISA-101                | Norma de HMI de alto rendimiento: pantallas calmadas, color con significado |
| ISA-18.2               | Norma de gestión de alarmas para industrias de proceso                      |
| Cifras tabulares       | Números de ancho fijo: no se desplazan al actualizarse                      |
| Sparkline              | Minigráfica de tendencia sin ejes, junto a un valor                         |
| Mímico                 | Esquema de un equipo con sus valores donde físicamente ocurren              |
| Skeuomórfico           | Que imita objetos reales en 3D (evitar; sello de software amateur)          |
| Skeleton               | Estado de carga con bloques neutros con la forma final                      |
| Elevación              | Jerarquía visual; aquí por borde y fondo, no por sombra                     |
| Modo oscuro / claro    | Tema para sala de control (oscuro) o campo a pleno sol (claro)              |
| Densidad               | Cantidad de información por pantalla según el contexto de uso               |
| prefers-reduced-motion | Ajuste del usuario que pide desactivar animaciones                          |

*
