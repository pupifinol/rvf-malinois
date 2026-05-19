# RVF Malinois — Arquitectura de Interfaz y Experiencia (UI/UX)

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

# Parte I — Fundamentos de Diseño

## 1. Cómo Leer Este Documento y Filosofía

Este documento define la arquitectura de interfaz y experiencia de RVF Malinois: cómo se ve, cómo se navega y cómo se siente la plataforma para quienes la usan en operaciones reales de Well Testing. No contiene código; define el diseño que el equipo de desarrollo deberá implementar.

Cada sección se explica primero en lenguaje sencillo, con ejemplos de operaciones de petróleo y gas (separadores, choke manifold, EMGAD, EMMAD, sensores SignalFire), y luego con la especificación de diseño precisa. Los esquemas de pantalla son bocetos de arquitectura (wireframes): muestran la estructura y la jerarquía de la información, no el aspecto gráfico final.

**La referencia mental.** RVF Malinois debe verse y comportarse como el software industrial de SLB, Halliburton, Baker Hughes, Honeywell o Emerson: serio, denso de información cuando hace falta, calmado cuando todo está normal, y absolutamente confiable. No debe parecer un panel de una startup con medidores de colores. La sobriedad es una señal de seriedad operativa.

## 2. Principio Rector: Monitoreo, No Control

En esta etapa RVF Malinois NO controla válvulas, chokes, separadores ni equipos de campo de forma remota. Es una plataforma de adquisición de telemetría, monitoreo en tiempo real, historiador, alarmas, analítica de producción y visibilidad operativa.

**Esto es una decisión de diseño visible, no una limitación.** En software industrial serio, una interfaz que solo observa debe verse claramente como tal. No debe haber un solo botón, palanca o control que parezca accionar un equipo. Cada válvula, choke o separador se representa únicamente como estado (abierto/cerrado, presión, nivel), nunca como un control operable. Una insignia visible “SOLO LECTURA” en las pantallas de pozo y equipo comunica esto al operador y al cliente.

**Por qué importa.** En una sala de control, la peor confusión posible es que un operador crea que puede cerrar un pozo desde la pantalla cuando no puede, o que el cliente piense que RVF está operando su equipo a distancia. La claridad sobre el alcance es un asunto de seguridad y de credibilidad, exactamente como lo tratan los grandes proveedores de servicios.

## 3. Estructura General de la Plataforma

La plataforma se organiza en cuatro niveles de información, del más amplio al más específico. El usuario siempre puede ubicarse: “¿estoy viendo toda la flota, un pozo, un equipo o un sensor?”

| **Nivel** | **Qué muestra**                        | **Ejemplo de operación**                                                    |
|-----------|----------------------------------------|-----------------------------------------------------------------------------|
| Flota     | Todos los pozos en prueba a la vez     | El supervisor ve de un vistazo que 7 pozos están en prueba y 1 tiene alarma |
| Pozo      | Un pozo y su prueba en curso           | El ingeniero abre CN-014 y ve presiones, caudales y el separador EMMAD      |
| Equipo    | Una unidad o equipo del tren de prueba | Estado del separador horizontal, choke manifold, quemador o tanque          |
| Sensor    | Un instrumento SignalFire individual   | Batería, señal RF y última lectura del Pressure Scout PS-118                |

Toda pantalla pertenece a uno de estos niveles y permite “bajar” (de flota a pozo a equipo a sensor) o “subir” con un solo gesto. Esto es lo que en SCADA se llama conservar la conciencia situacional: el operador nunca se pierde.

## 4. Jerarquía de Navegación

La navegación principal es una barra lateral fija, siempre visible, como en las consolas SCADA industriales. No se usan menús ocultos ni hamburguesas en la sala de control: lo que el operador necesita debe estar a un clic.

| **Sección** | **Para qué sirve**                                              |
|-------------|-----------------------------------------------------------------|
| Operaciones | Centro de operaciones en tiempo real (pantalla de inicio)       |
| Multipozo   | Mosaico de estado de todos los pozos (modo pantalla mural)      |
| Pozos       | Lista y detalle de cada pozo en prueba                          |
| Trabajos    | Los “jobs” de Well Testing: unidad asignada a un pozo y período |
| Equipos     | Estado de separadores, choke, quemador, tanques, EMGAD/EMMAD    |
| Sensores    | Salud de la red SignalFire (batería, RF, malla)                 |
| Alarmas     | Centro de alarmas y eventos                                     |
| Tendencias  | Gráficos históricos multivariable                               |
| Analítica   | Producción, GOR, corte de agua, comparativas de pozos           |
| Reportes    | Reportes de prueba y exportaciones                              |
| Auditoría   | Línea de tiempo de quién hizo qué                               |

- **Barra superior fija.** Logo RVF Malinois, selector de cliente (solo personal RVF), banner global de alarmas activas y reloj con turno. El banner de alarmas es persistente: siempre se sabe si hay algo anormal en la flota, sin importar en qué pantalla se esté.

- **Migas de pan.** Flota › CN-014 › EMMAD-07 › PS-118. El operador siempre sabe dónde está y vuelve atrás sin perder contexto.

## 5. Las Dos Caras: Consola RVF y Portal del Cliente

Es el mismo sistema con dos experiencias, decididas por el rol (ver el documento de Fundación Técnica). No son dos productos: es una sola base con permisos.

**Consola de Operaciones RVF (la herramienta de trabajo).** Acceso a todos los pozos de todos los clientes a la vez, salud de sensores, gestión de trabajos, configuración de alarmas, reportes de campo. Es densa, operativa y es lo que diferencia el servicio de RVF. La usan el centro de operaciones, los ingenieros de campo, los analistas y los supervisores.

**Portal del Cliente (la vitrina).** El cliente (Repsol y futuros) entra y ve únicamente sus pozos, en tiempo real, con una vista limpia, profesional y de solo lectura. No ve datos de otros clientes, no configura nada. Es más simple y más pulida que la consola interna: su objetivo es transmitir confianza y profesionalismo, no exponer toda la operación.

- **Misma identidad visual, distinta densidad.** El portal del cliente usa la misma marca y los mismos componentes, pero con menos densidad y sin las herramientas internas. El cliente ve “su” operación, no la sala de control de RVF.

# Parte II — Pantallas Principales

## 6. Centro de Operaciones en Tiempo Real

Es la pantalla de inicio de la consola RVF y el corazón de la operación: la vista de toda la flota de Well Testing en vivo. Responde en cinco segundos a la pregunta del supervisor: “¿está todo bien?”

![Esquema de pantalla](./RVF_Malinois_UX_Arquitectura_media/media/a3920644020e4154e1361d5e30e149273b2470c8.png)

*Esquema — Centro de Operaciones en Tiempo Real (consola RVF)*

- **Franja de KPIs de flota.** Pozos en prueba, alarmas activas, sensores en línea, porcentaje de datos en vivo, unidades activas. Un número grande con un punto de color de estado; si todo está normal, la franja es sobria.

- **Mosaico de pozos.** Una tarjeta por pozo en prueba: identificador, cliente, valores clave (presión de entrada, temperatura, caudal de petróleo, corte de agua), una minigráfica de tendencia y la unidad/trabajo asociado. El borde y el punto de estado solo cambian de color si hay anormalidad.

- **Regla de los cinco segundos.** Si el supervisor no puede evaluar el estado de toda la flota en cinco segundos, el diseño falló. Por eso el color se reserva para lo anormal: un pozo en alarma “salta” porque es el único con color fuerte en una pantalla calmada.

## 7. Supervisión Multipozo

Pensada para la pantalla mural del centro de operaciones: un mosaico grande, legible desde varios metros de distancia, donde cada pozo es un panel con sus variables principales y su tendencia. Es la vista que queda proyectada todo el turno.

![Esquema de pantalla](./RVF_Malinois_UX_Arquitectura_media/media/8945b17ce11cad268a2dd69648d39b2b9b83d931.png)

*Esquema — Supervisión Multipozo (modo pantalla mural)*

- **Legible a distancia.** Tipografía grande, alto contraste, pocas variables por panel (las que importan en una prueba: presión de entrada y separador, temperatura, caudal de petróleo y gas, corte de agua).

- **El color es la excepción.** Con 8 pozos normales la pared es gris y tranquila. Cuando BL3-22 entra en alarma, su panel se enmarca en rojo y es lo único que llama la atención en toda la sala. Así trabaja un centro de operaciones serio.

## 8. Detalle de Pozo

La pantalla donde el ingeniero de Well Testing vive durante una prueba. Reúne, en una sola vista, el estado del pozo, el esquema del separador, las tendencias en vivo y las alarmas y eventos de ese pozo.

![Esquema de pantalla](./RVF_Malinois_UX_Arquitectura_media/media/bcdbae85cbd1dd6e3cf0090d6c97f37745ed64ed.png)

*Esquema — Detalle de Pozo (con insignia SOLO LECTURA)*

- **Encabezado de contexto.** Pozo, trabajo (job), unidad (EMMAD-07), cliente, hora de inicio y tiempo transcurrido de la prueba. Insignia “SOLO LECTURA” siempre visible.

- **Franja de KPIs con tendencia.** Cada variable clave muestra su valor grande y, debajo, una minigráfica: el operador necesita el número y hacia dónde va. Un valor de presión sin su tendencia es la mitad de la información.

- **Mímico de proceso a la izquierda.** Esquema del separador horizontal con los valores ubicados donde físicamente ocurren (presión de entrada en la entrada, nivel en el cuerpo, gas arriba, petróleo y agua en las salidas). Sin controles.

- **Tendencias en vivo a la derecha.** Presión, temperatura y caudal apiladas y alineadas en el tiempo, para correlacionar de un vistazo (por ejemplo, ver cómo cae la presión cuando se cambia el choke).

- **Alarmas y eventos del pozo abajo.** La historia reciente del pozo: cuándo se inició la prueba, cuándo se cambió el choke, cuándo se disparó una alarma.

## 9. Trabajo de Well Testing (Job)

El “trabajo” (job) es el contrato operativo: una unidad de RVF asignada a un pozo de un cliente durante un período. Esta pantalla es la vista administrativa-operativa de esa prueba completa, de principio a fin.

- **Ficha del trabajo.** Cliente, pozo, unidad asignada (EMGAD o EMMAD), fechas de inicio y fin previstas, ingeniero responsable, estado (programado, en curso, finalizado).

- **Resumen de la prueba.** Producción acumulada de petróleo y gas, promedios de presión y temperatura, corte de agua y GOR del período, número de alarmas, tiempo efectivo de prueba.

- **Línea de tiempo del trabajo.** Hitos: montaje, inicio de prueba, cambios de choke, eventos relevantes, fin. Es la base del reporte de prueba.

- **Acceso al reporte.** Desde el trabajo se genera el reporte de Well Testing del cliente (sección 15).

## 10. Monitoreo de Equipos

El tren de Well Testing es más que sensores: separador horizontal, choke manifold, quemador (flare), tanques, EMGAD/EMMAD, cabina de adquisición. Esta pantalla muestra el estado de cada equipo del tren, no solo las variables del pozo.

| **Equipo**            | **Qué se muestra (solo estado)**                                                    |
|-----------------------|-------------------------------------------------------------------------------------|
| Separador horizontal  | Presión, nivel de líquido, temperatura; rango de operación del modelo (48″/42″/30″) |
| Choke manifold        | Tamaño de choke en uso (p. ej. 24/64), presión aguas arriba y aguas abajo           |
| Quemador / flare      | Estado de llama, caudal de gas enviado a quema                                      |
| Tanques               | Nivel y volumen acumulado (100 / 400 / 500 bls)                                     |
| EMGAD / EMMAD         | Estado de la unidad, instrumentos activos, computador de flujo                      |
| Cabina de adquisición | Estado del enlace, Node-RED, Gateway Stick                                          |

**Regla clave.** Cada equipo se representa como estado, nunca como control. El choke muestra qué reductor está instalado; no ofrece cambiarlo. El quemador muestra si hay llama; no ofrece encenderlo. Esto es coherente con el principio rector (sección 2).

## 11. Salud de Sensores SignalFire

Esta es una pantalla que la mayoría de las plataformas olvida y que para RVF es crítica. La telemetría llega de sensores inalámbricos SignalFire alimentados por batería (Pressure Scout, Sentinel RTD, Wireless Totalizer) sobre una malla de 900 MHz hacia el Gateway Stick. Un sensor con batería agotada o señal débil se ve, en el resto del sistema, exactamente igual que un pozo que dejó de producir.

![Esquema de pantalla](./RVF_Malinois_UX_Arquitectura_media/media/396223bc51c47155670eabe3e9e4d689962db887.png)

*Esquema — Salud de Sensores SignalFire (batería, RF, malla, última lectura)*

- **Tabla de sensores.** Por cada instrumento: tipo (Pressure Scout / Sentinel RTD / Wireless Totalizer), pozo, batería con barra, señal RF en dB, número de saltos en la malla, hace cuánto reportó y estado.

- **Topología de malla.** Un mapa simple Gateway Stick ↔ nodos que muestra qué sensores están conectados, por cuántos saltos y cuáles cayeron. Refleja la realidad de la red mesh 900 MHz FHSS.

- **Por qué es diferenciador.** Cuando una variable se “congela”, el operador necesita distinguir en segundos entre “el pozo cambió” y “se agotó la batería del Sentinel RTD”. Esta pantalla evita decisiones operativas equivocadas y es un argumento de venta del servicio frente a la competencia.

- **Alarmas de salud.** Batería por debajo de umbral, señal débil sostenida o sensor sin reportar generan su propia alarma, separada de las alarmas de proceso, para no contaminar el centro de alarmas operativas.

## 12. Centro de Alarmas

El lugar donde se reconocen, filtran y contextualizan las alarmas. Sigue los principios de la norma ISA-18.2 de gestión de alarmas de proceso, que es el estándar que usan los grandes operadores.

![Esquema de pantalla](./RVF_Malinois_UX_Arquitectura_media/media/e766e6c440cf663fab1a77666ab1d41e441ff5e6.png)

*Esquema — Centro de Alarmas (ISA-18.2: prioridad, reconocimiento, contexto)*

- **Tabla priorizada.** Prioridad (chip de color), hora, pozo, fuente (p. ej. p_inlet), condición (HI_HI, LO, sin dato), valor y estado (activa, reconocida, en estante).

- **Contexto a la derecha.** Al seleccionar una alarma se ve su detalle y la tendencia de la variable en las horas previas: nunca se reconoce una alarma a ciegas; se ve qué pasó.

- **Reconocer es una acción operativa, no de control.** Reconocer documenta que un operador vio la alarma; no actúa sobre el campo. Queda registrado en auditoría.

- **Separación de dominios.** Las alarmas de proceso (presión, caudal) y las de salud de sensores (batería, RF) se muestran y filtran por separado para no mezclar problemas operativos con problemas de instrumentación.

## 13. Tendencias Históricas

La memoria de la prueba: gráficos multivariable sobre el historiador (TimescaleDB). Es donde el ingeniero analiza el comportamiento del pozo a lo largo de horas o días.

- **Multivariable y alineado en el tiempo.** Varias curvas apiladas con el mismo eje de tiempo (presión de entrada, presión de separador, caudal de petróleo) para correlacionar: ver cómo responde la producción a un cambio de choke.

- **Selección de rango y resolución.** Última hora, últimas 6 h, últimas 24 h, toda la prueba. Para rangos largos, el servidor reduce la resolución para que el gráfico siga siendo rápido (ver Fundación Técnica, historiador).

- **Calidad visible.** Los tramos de dato malo o estimado se dibujan distintos (línea tenue o punteada); jamás se presenta un dato dudoso como si fuera bueno.

- **Huecos visibles.** Si el satélite o un sensor cayó, el hueco se muestra como hueco, no se interpola en silencio. Un hueco no es producción cero.

## 14. Analítica de Producción

Convierte la telemetría en información de negocio para el ingeniero y el supervisor (no es IA todavía; es analítica operativa).

- **Producción de la prueba.** Petróleo y gas acumulados, promedios, GOR y corte de agua del período, con comparación contra etapas previas de la misma prueba.

- **Comparativa entre pozos.** Ranking simple de los pozos en prueba por producción, corte de agua o GOR, para que el supervisor priorice atención.

- **Condiciones estándar.** Caudales a condiciones estándar (como en el tablero Well-Ion actual): el ingeniero necesita el dato corregido, no solo el crudo.

- **Espacio reservado para IA.** La pantalla se diseña para que más adelante se agreguen detección de anomalías y predicción de corte de agua sin rediseñarla (ver Fundación Técnica, IA).

## 15. Reportes

El entregable tangible del servicio: el reporte de prueba de pozo que el cliente recibe. Debe verse tan profesional como estos documentos.

- **Reporte de prueba por trabajo.** Encabezado con cliente, pozo, unidad y fechas; resumen de producción; tablas de presión/temperatura/caudal; eventos; gráficos clave. Exportable a PDF con la marca RVF Malinois.

- **Generado, no improvisado.** El reporte se arma a partir del historiador y de la línea de tiempo del trabajo; el ingeniero lo revisa y aprueba, no lo reescribe a mano.

- **Exportaciones de datos.** Descarga de la serie temporal del período en formato compatible para análisis técnico del cliente (toda exportación queda en auditoría).

## 16. Auditoría y Línea de Tiempo de Eventos

Una línea de tiempo inmutable de quién hizo qué y de qué ocurrió en la operación. Es lo que da confianza a un cliente como Repsol.

- **Dos capas en una línea de tiempo.** Eventos de operación (inicio de prueba, cambio de choke, fin) y eventos de auditoría (reconocimiento de alarma, cambio de límite, exportación de datos, ingreso de usuario).

- **Filtrable y trazable.** Por pozo, por trabajo, por usuario, por tipo. Cada entrada es inmutable y no editable.

- **También se audita al cliente.** Qué vio o exportó el cliente desde su portal queda registrado, sin exponer datos sensibles en el propio registro.

# Parte III — Biblioteca de Componentes

## 17. Tarjetas KPI

La tarjeta KPI es el ladrillo básico de las pantallas. Patrón fijo para que el operador la lea siempre igual.

```
+---------------------------------------+
| P. ENTRADA (●) | <- etiqueta + punto de estado
| |
| 1245 psi | <- valor grande + unidad
| ↗ +12 psi / 5 min | <- variación reciente
| ▁▂▃▅▇▆▅▃▂▁▂▃▅ | <- minigráfica (sparkline)
+---------------------------------------+
```

- **Siempre valor + tendencia.** Nunca un número solo. Una presión sin su dirección no sirve para decidir en una prueba.

- **Estado por color, con moderación.** El punto de color solo cambia ante anormalidad; en estado normal la tarjeta es neutra.

- **Calidad explícita.** Si el dato es estimado o viejo, la tarjeta lo indica (texto “estimado” / “dato 9 min”), no finge precisión.

## 18. Gráficos de Tendencia

- **Eje de tiempo compartido.** Cuando hay varias variables, se apilan con el mismo eje temporal alineado para correlacionar visualmente.

- **Líneas sobrias, sin relleno.** Líneas finas y claras; nada de áreas degradadas ni efectos. La señal es el dato, no la decoración.

- **Banda de límites.** Los umbrales de alarma (lo_lo, lo, hi, hi_hi) se muestran como líneas de referencia tenues para ver de inmediato cuán cerca está el valor del límite.

- **Calidad y huecos diferenciados.** Dato malo punteado; hueco como hueco; dato tardío marcado. Coherente con la Fundación Técnica.

- **Sin auto-escala engañosa.** El eje no debe “ampliar” ruido pequeño hasta que parezca un evento; rangos estables y razonables.

## 19. Visualización de Alarmas

- **Color por prioridad, consistente en todo el sistema.** Rojo = crítica/alta, ámbar = advertencia, gris = sin dato. El mismo código en tarjetas, mosaico, centro de alarmas y mímicos. Nunca cambia de significado.

- **Forma además de color.** Por accesibilidad (daltonismo, sala con poca luz) la prioridad también se distingue por posición y etiqueta, no solo por color.

- **Banner global persistente.** El conteo de alarmas activas vive en la barra superior en todas las pantallas; el operador nunca “pierde” una alarma por estar en otra vista.

- **Estados claros.** Activa, reconocida, en estante (shelved), normalizada. El estado “en estante” siempre con motivo y caducidad, registrado en auditoría.

## 20. Mapas

El mapa es secundario en una operación de Well Testing (los pozos están dispersos y la prueba es puntual), pero útil para ubicación y para el portal del cliente.

- **Mapa de ubicación de pozos en prueba.** Marcadores con el color de estado del pozo; al tocar un marcador, acceso directo al detalle del pozo.

- **No es la pantalla principal.** En operaciones, el mosaico de pozos manda; el mapa complementa, no reemplaza, la conciencia situacional.

- **Topología de malla SignalFire.** El “mapa” más útil a nivel de sitio no es geográfico sino la topología Gateway ↔ sensores (sección 11).

## 21. Mímicos tipo SCADA

Un mímico es la representación esquemática de un equipo con sus valores ubicados donde físicamente ocurren. Es el lenguaje visual del SCADA industrial. Se diseña según ISA-101 (Parte V).

![Esquema de pantalla](./RVF_Malinois_UX_Arquitectura_media/media/2d90adb6a9b37da6ed95699bdf55760673b0c0ac.png)

*Esquema — Mímico del separador horizontal de prueba, estilo ISA-101 (fondo neutro, color solo si hay anormalidad, sin controles)*

- **Esquemático, no realista.** No es un dibujo bonito del separador; es un esquema legible que ubica presión de entrada, presión de separador, nivel, salida de gas, petróleo y agua donde el operador los espera.

- **Fondo neutro.** Gris/beige apagado. El equipo “normal” casi no tiene color; una condición anormal aparece en rojo o ámbar y resalta sola.

- **Sin controles.** Ni una válvula operable. El mímico refleja el estado del tren EMGAD/EMMAD; no lo opera.

# Parte IV — Sistema de Diseño

## 22. Paleta de Color Industrial

La paleta sigue la disciplina de la HMI de alto rendimiento (ISA-101): base neutra, color reservado para el significado. Coherente con la marca RVF (azul corporativo).

| **Muestra** | **Hex**  | **Nombre** | **Uso**               |
|-------------|----------|------------|-----------------------|
|             | #0E1824 | 0E1824     | Fondo sala de control |
|             | #16202C | 16202C     | Superficie oscura     |
|             | #1F5FA8 | 1F5FA8     | Azul RVF              |
|             | #39B6E8 | 39B6E8     | Cian RVF              |
|             | #3DA56B | 3DA56B     | Verde estado          |
|             | #E0A12E | E0A12E     | Ámbar                 |
|             | #D24A3D | D24A3D     | Rojo                  |
|             | #8A95A2 | 8A95A2     | Gris neutro           |
|             | #F4F6F8 | F4F6F8     | Fondo claro           |

**La regla de oro del color.** En estado normal, la pantalla es 90% neutra. El verde se usa con sobriedad; el rojo y el ámbar casi no aparecen. Cuando aparecen, significan algo y el ojo va directo. Una pantalla llena de colores es una pantalla donde nada destaca: ese es el error que separa una herramienta industrial de un panel de demostración.

## 23. Tipografía

- **Una sola familia, sin serifas, industrial.** Tipo de letra geométrica y legible (familia tipo Inter, Roboto o IBM Plex Sans). Una sola familia en toda la plataforma.

- **Números tabulares y monoespaciados para datos.** Los valores numéricos (presiones, caudales) usan cifras de ancho fijo para que no “bailen” al actualizarse cada pocos segundos. Es un detalle que distingue al software industrial serio.

- **Jerarquía clara y limitada.** Pocos tamaños: valor grande, etiqueta, texto secundario. La consistencia reduce la fatiga en turnos largos.

- **Tamaños generosos.** Pensados para verse en un monitor de sala de control a distancia y en una tablet con guantes a plena luz.

## 24. Modo Oscuro y Modo Claro

- **Modo oscuro por defecto en la sala de control.** Fondo profundo, bajo brillo: reduce la fatiga visual en turnos de 12 horas y evita que la pantalla mural ilumine la sala.

- **Modo claro de alto contraste para tablet a la intemperie.** En campo, bajo sol directo, el modo oscuro es ilegible. El tablet del ingeniero necesita un modo claro de alto contraste y brillo. Es un requisito operativo real, no una preferencia.

- **Mismos significados de color en ambos modos.** Rojo es alarma en oscuro y en claro. El usuario no debe reaprender la interfaz al cambiar de modo.

- **Portal del cliente: claro por defecto.** Más cercano a un informe profesional; el cliente no está en una sala de control.

## 25. Densidad de Información

La densidad correcta depende de quién mira y desde dónde:

| **Contexto**              | **Densidad** | **Razón**                                   |
|---------------------------|--------------|---------------------------------------------|
| Mosaico mural (multipozo) | Baja         | Se ve a distancia; pocas variables, grandes |
| Consola del operador RVF  | Alta         | De cerca; necesita ver mucho a la vez       |
| Detalle de pozo           | Media-alta   | Equilibrio entre contexto y profundidad     |
| Portal del cliente        | Media-baja   | Claridad y confianza sobre exhaustividad    |
| Tablet de campo           | Baja         | Guantes, sol, movimiento; objetivos grandes |

**Principio.** Densidad alta no es desorden. Un avión de combate tiene alta densidad pero todo está donde el piloto lo espera. La densidad se gana con consistencia y jerarquía, no con relleno.

## 26. Comportamiento Responsive

RVF Malinois debe funcionar bien en dos mundos muy distintos, no en “cualquier pantalla” genérica:

- **Monitor de sala de control (grande, horizontal, a distancia).** Aprovecha el ancho: mosaico amplio, varias tendencias a la vez, banner siempre visible. Es el escenario principal.

- **Tablet de campo (mediano, táctil, guantes, sol).** Objetivos táctiles grandes, una variable o pozo a la vez, alto contraste, gestos simples. El ingeniero junto al separador no navega menús finos.

- **No es “mobile-first” genérico.** Es “control-room-first y field-tablet-second”. El teléfono es un visor de consulta y alerta, no la herramienta de trabajo.

## 27. UX Móvil y Tablet

- **Teléfono: consulta y alerta.** Notificación de alarma, estado rápido de un pozo, confirmar que la prueba sigue bien. No es para operar ni configurar.

- **Tablet en cabina: visor operativo.** Detalle de pozo, tendencias, salud de sensores. El ingeniero la usa junto al EMMAD y la cabina de adquisición.

- **Gestos mínimos y predecibles.** Tocar para ver, deslizar para cambiar de pozo. Nada de gestos ocultos: en campo, con guantes y prisa, lo oculto no existe.

- **Tolerante a conexión intermitente.** Igual que el borde, la app muestra claramente “dato de hace X” cuando la conexión satelital falla, en vez de mostrar un dato viejo como si fuera actual.

# Parte V — Reglas Operativas

## 28. UX para Turnos de 12 Horas

Los operadores de un centro de operaciones trabajan turnos largos mirando la misma pantalla. El diseño debe cuidar su atención durante 12 horas, no solo durante una demostración de 5 minutos.

- **Calma por defecto.** Cuando todo está normal, la pantalla está quieta y oscura. Nada parpadea ni se anima sin motivo. El movimiento se reserva para lo que de verdad requiere atención.

- **Sin animaciones decorativas.** Transiciones mínimas y funcionales. Una animación innecesaria, repetida mil veces en un turno, es fatiga.

- **Consistencia absoluta.** El mismo dato siempre en el mismo lugar, con el mismo formato. La memoria muscular del operador es un activo de seguridad.

- **Reducir el ruido visual.** Menos bordes, menos sombras, menos cajas. El operador debe ver datos, no decoración.

- **Cambio de turno.** Una vista de “entrega de turno” que resume qué pasó en las últimas horas, alarmas pendientes y pozos a vigilar, para que el relevo no empiece a ciegas.

## 29. Prevención de Fatiga de Alarmas

La fatiga de alarmas es el problema número uno de seguridad en salas de control: si todo suena, los operadores ignoran todo. El diseño debe combatirla activamente (principios ISA-18.2).

- **Cada alarma debe significar una acción.** Si una alarma no requiere que alguien haga algo, no debe ser una alarma; a lo sumo es un evento. Menos alarmas y mejores.

- **Prioridades reales, no todo “crítico”.** Una jerarquía honesta de prioridad. Si todo es crítico, nada lo es.

- **Banda muerta y retardo.** Una presión que oscila alrededor del límite no debe generar 40 alarmas por minuto. Histéresis y retardo evitan el “parpadeo” (coherente con la Fundación Técnica).

- **Agrupar alarmas relacionadas.** Si un sensor cae y arrastra tres variables, se presenta como un problema, no como cuatro alarmas independientes.

- **Sin sonidos ni rojos gratuitos.** El rojo y el sonido son recursos finitos de atención. Gastarlos en lo trivial los vuelve inútiles cuando de verdad importan.

- **Separar salud de instrumentación de proceso.** Una batería baja de un Pressure Scout no debe sonar igual que una sobrepresión en el separador.

## 30. Principios Visuales tipo SCADA (ISA-101)

Resumen de la filosofía que hace que RVF Malinois se vea como Honeywell o Emerson y no como un panel genérico. Estos principios gobiernan todo lo anterior:

1.  La pantalla normal es gris y aburrida. La salud del sistema se comunica por la AUSENCIA de color, no por su presencia.

2.  El color es lenguaje, no decoración. Cada color significa exactamente una cosa, siempre la misma, en todo el sistema.

3.  El dato manda. Se elimina todo lo que no sea dato: degradados, sombras, brillos, medidores tridimensionales.

4.  Mostrar tendencia, no solo valor. El operador necesita hacia dónde va, no solo dónde está.

5.  Conciencia situacional en cinco segundos. Desde cualquier pantalla, el estado general debe captarse de un vistazo.

6.  Jerarquía de la información: flota → pozo → equipo → sensor, siempre navegable, nunca perdido.

7.  Mostrar la incertidumbre. Dato malo, viejo o estimado se ve distinto; nunca se disfraza de dato bueno.

8.  Solo lectura se ve como solo lectura. Si no se controla el campo, la interfaz no aparenta controlarlo.

# Parte VI — Implementación

## 31. Qué Debe Existir en V1 y Qué Postergar

Debe existir en la versión 1

- Centro de Operaciones en tiempo real (flota) y Detalle de Pozo.

- Supervisión Multipozo (modo pantalla mural).

- Centro de Alarmas con reconocimiento y contexto (ISA-18.2 básico).

- Salud de Sensores SignalFire (batería, RF, última lectura) — es diferenciador y crítico.

- Tendencias históricas multivariable con calidad y huecos visibles.

- Reporte de prueba por trabajo, exportable a PDF con marca RVF.

- Portal del Cliente de solo lectura, limpio y aislado por cliente.

- Sistema de diseño base: paleta ISA-101, tipografía, modo oscuro (sala) y claro (campo).

- Línea de tiempo de auditoría y eventos.

Postergar (cuando haya base y necesidad real)

- Analítica avanzada e IA (anomalías, predicción de corte de agua).

- Mímicos SCADA completos y animados de todo el tren de equipos (empezar con el separador y lo esencial).

- App móvil nativa (en V1, un visor web responsive de consulta es suficiente).

- Mapas geográficos elaborados.

- Personalización de tableros por usuario (configurable) — primero estandarizar, luego flexibilizar.

- Flujos avanzados de “estante” de alarmas y árboles de escalamiento.

## 32. Errores de Diseño a Evitar

9.  Pantalla “arcoíris”: medidores y colores por todas partes. Hace que lo anormal no resalte. Es el error que vuelve el software un juguete.

10. Mostrar valores sin tendencia ni calidad: un número sin contexto no permite decidir en una prueba.

11. Aparentar control: botones o controles que parezcan accionar válvulas o chokes cuando el sistema solo monitorea.

12. Olvidar la salud de sensores: sin esa pantalla, una batería agotada parece un pozo muerto y lleva a decisiones equivocadas.

13. Interpolar huecos en silencio: un hueco de datos dibujado como línea continua es una mentira operativa.

14. Auto-escalar gráficos hasta que el ruido parezca un evento.

15. Inundación de alarmas con prioridades infladas: destruye la confianza del operador en el sistema.

16. Animaciones y parpadeos decorativos: fatigan en un turno de 12 horas.

17. Diseñar “mobile-first” genérico en vez de “sala de control y tablet de campo”.

18. Modo oscuro único: ilegible en una tablet bajo sol directo en el pozo.

19. Inconsistencia: el mismo dato en distinto lugar o formato en cada pantalla destruye la memoria muscular del operador.

20. Exponer la complejidad interna de RVF al cliente: el portal debe ser una vitrina, no la sala de control.

21. Densidad mal entendida: amontonar no es informar; la densidad se gana con jerarquía y consistencia.

## 33. Glosario UX / SCADA

| **Término**             | **Significado**                                                                        |
|-------------------------|----------------------------------------------------------------------------------------|
| HMI                     | Interfaz humano-máquina: la pantalla con la que el operador supervisa el proceso       |
| SCADA                   | Sistema de supervisión y adquisición de datos de procesos industriales                 |
| ISA-101                 | Norma de diseño de HMI de alto rendimiento (pantallas calmadas, color con significado) |
| ISA-18.2                | Norma de gestión de alarmas para industrias de proceso                                 |
| Mímico                  | Esquema de un equipo con sus valores ubicados donde físicamente ocurren                |
| Conciencia situacional  | Capacidad de captar el estado general de un vistazo                                    |
| Sparkline               | Minigráfica de tendencia sin ejes, junto a un valor                                    |
| KPI                     | Indicador clave: una variable importante mostrada de forma destacada                   |
| Banda muerta            | Margen que evita que un valor oscilante dispare alarmas repetidas                      |
| En estante (shelved)    | Alarma silenciada temporalmente, con motivo y caducidad, registrada                    |
| Fatiga de alarmas       | Cuando hay tantas alarmas que el operador deja de atenderlas                           |
| Modo oscuro / claro     | Tema visual para sala de control (oscuro) o campo a pleno sol (claro)                  |
| Portal del cliente      | La vista de solo lectura y acotada que ve Repsol u otro cliente                        |
| Densidad de información | Cuánta información se muestra por pantalla, según el contexto de uso                   |

*
