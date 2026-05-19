# RVF Malinois — Arquitectura de Ingeniería del Producto

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

# Parte I — Filosofía de Ingeniería

## 1. Filosofía de Ingeniería de RVF Malinois

Este documento traduce los cinco documentos conceptuales anteriores en una arquitectura de ingeniería concreta: lo que Claude Code y el equipo de RVF construirán de verdad. No contiene código todavía; define las decisiones que el código deberá respetar.

**La filosofía en tres palabras: aburrido, confiable, observable.** Se prefieren herramientas maduras y bien entendidas sobre tecnología llamativa. Un sistema que monitorea pruebas de pozos para Repsol no puede caerse porque se eligió una librería de moda. La novedad es un riesgo; la fiabilidad y la mantenibilidad son la meta.

**El corazón es la tubería de tiempo real.** Casi todo RVF Malinois es React empresarial convencional. Lo único genuinamente difícil —y donde fracasan los proyectos— es renderizar telemetría en vivo de forma fluida sobre satélite. Esa tubería se diseña y se prueba primero, contra un simulador, antes de tocar hardware real.

**Fronteras duras.** El sistema de diseño y el cliente de API son fronteras innegociables. El navegador jamás habla MQTT ni ThingsBoard directo; siempre pasa por el backend de RVF. Cambiar el backend debe tocar una sola capa, no toda la aplicación. La plataforma es un instrumento, no un sitio web.

## 2. Decisiones Difíciles de Revertir

Estas decisiones son baratas de tomar bien hoy y carísimas de cambiar después. Se documentan primero porque enmarcan todo lo demás:

1.  Desacoplar el render de la ingesta de telemetría. Si se construye “re-renderizar React en cada mensaje”, rehacerlo después es reescribir el frontend.

2.  El cliente de API que envuelve el backend RVF (nunca ThingsBoard directo). Si los componentes hablan con ThingsBoard, migrar luego es imposible sin reescribir pantallas.

3.  El contrato de tokens de diseño. Si los componentes usan colores literales, cambiar de tema o de marca obliga a tocar todo.

4.  La estructura de monorepo y de rutas por cliente (consola RVF vs portal de cliente). Reorganizar esto tarde rompe imports y URLs en toda la base.

5.  El motor de gráficos para tiempo real. Elegir una librería lenta y descubrirlo con datos reales obliga a reescribir todas las tendencias.

6.  Autenticación por cookie httpOnly del lado del servidor, no tokens en JavaScript. Cambiar el modelo de sesión después es un riesgo de seguridad y de regresión enorme.

7.  Downsampling en el servidor para el historiador. Si el frontend se acostumbra a pedir datos crudos, corregirlo tarde implica rehacer toda la capa de consulta.

## 3. Stack Tecnológico — Recomendación Final

Decisiones por capa. Cada elección prioriza madurez, comunidad amplia y control total sobre lo visual y el rendimiento.

| **Capa**           | **Tecnología**                                     | **Por qué**                                                             |
|--------------------|----------------------------------------------------|-------------------------------------------------------------------------|
| Framework          | Next.js (App Router) + React + TypeScript estricto | Maduro, SSR para proteger rutas, gran comunidad, ideal para Claude Code |
| Estilos            | Tailwind CSS mapeado a tokens (variables CSS)      | Velocidad con disciplina; los tokens evitan el caos visual              |
| Estado servidor    | TanStack Query                                     | Caché, reintentos y cancelación para historiador y REST                 |
| Estado tiempo real | Zustand (store ligero, fuera de React)             | Ring buffer de telemetría sin re-render global                          |
| Transporte vivo    | WebSocket vía backend RVF                          | El navegador no habla MQTT; el backend hace de puente                   |
| Gráficos tendencia | uPlot                                              | Diseñado para series temporales densas; rapidísimo y minúsculo          |
| Gráficos ricos     | ECharts (donde haga falta)                         | Opción para vistas analíticas complejas                                 |
| Mímicos SCADA      | SVG + capa de datos React                          | Esquemas ISA-101 nítidos, escalables y accesibles                       |
| Mapas              | MapLibre GL (carga diferida)                       | Abierto, sin atadura de proveedor; secundario                           |
| Monorepo           | pnpm workspaces + Turborepo                        | Paquetes compartidos, builds rápidos e incrementales                    |
| Autenticación      | Sesión por cookie httpOnly (Clerk/Auth0/WorkOS)    | SSO empresarial; nunca tokens en el navegador                           |
| Pruebas            | Vitest · Testing Library · Playwright              | Unidad, componente y end-to-end de flujos críticos                      |
| Despliegue         | Contenedor Docker, autoalojado                     | Requisito empresarial de residencia de datos                            |
| CI/CD              | GitHub Actions (o GitLab CI)                       | Lint, tipos, pruebas y previsualización por PR                          |

**Lo que deliberadamente NO se usa.** Sin Redux (ceremonia innecesaria; el estado vive en tres lugares claros). Sin GraphQL (REST + WS es suficiente y más simple de operar). Sin microfrontends (complejidad que un equipo pequeño no puede operar con fiabilidad). Sin librerías de gráficos pesadas basadas en un nodo SVG por punto (colapsan con telemetría en vivo). Lo aburrido es una ventaja.

# Parte II — Arquitectura Frontend

## 4. Arquitectura Frontend y Next.js

La arquitectura sigue el principio de capas: cada capa solo conoce a la de abajo. Una pantalla compone primitivas; las primitivas leen del estado; el estado habla con el cliente de API; el cliente de API habla con el backend. Nada salta capas.

![Diagrama de arquitectura](./RVF_Malinois_Ingenieria_media/media/ec612c193de8c939229e378ca700edbb9b5bb221.png)

*Diagrama — Arquitectura frontend en capas (arquitectura limpia)*

- **Next.js con App Router.** Renderizado en servidor para proteger rutas antes de cargar la página (un cliente jamás recibe HTML de otra empresa). El grueso de las pantallas es interactivo del lado del cliente porque la telemetría es viva; el servidor protege y entrega el armazón.

- **Capas con fronteras duras.** Cambiar el backend toca solo el cliente de API. Cambiar la marca toca solo los tokens. Esto es lo que mantiene la plataforma mantenible a cinco años.

- **Aspectos transversales aislados.** Autenticación/tenant, theming, observabilidad, manejo de errores e idioma (es/en) son módulos transversales, no lógica repartida por las pantallas.

## 5. Monorepo y Estructura de Carpetas

Un solo repositorio con paquetes bien delimitados. El monorepo permite compartir el sistema de diseño y el cliente de API entre la web de hoy y la app móvil de mañana sin duplicar código.

```
rvf-malinois/ (monorepo · pnpm + Turborepo)
apps/
web/ Next.js — la plataforma RVF Malinois
packages/
tokens/ tokens de diseño -> variables CSS
ui/ primitivas (Card, KpiTile, AlarmRow...)
charts/ envoltura de uPlot/ECharts (config estricta)
api-client/ cliente REST tipado + cliente WebSocket
realtime/ store de tiempo real (ring buffer)
config/ eslint, tsconfig, tailwind compartidos
tooling/ scripts, simulador de telemetría
Dentro de apps/web/:
app/(rvf-console)/... rutas de la consola interna de RVF
app/(client-portal)/... rutas del portal del cliente (aislado)
app/(auth)/... login y sesión
```

- **Separación por grupos de ruta.** (rvf-console) y (client-portal) son grupos distintos con layout, navegación, densidad y tema por defecto distintos, pero usan las mismas primitivas. El aislamiento entre clientes empieza en la estructura de rutas.

- **El simulador de telemetría es parte del repo.** Una herramienta que emite telemetría sintética por WebSocket. Permite construir y probar el render en vivo sin hardware de campo. Es lo que evita que el proyecto se bloquee esperando un pozo real.

## 6. Componentes React y Jerarquía

Tres niveles, en orden estricto de composición:

- **Primitivas (packages/ui).** Piezas del sistema de diseño sin lógica de datos: Card, KpiTile, TrendChart, AlarmRow, DataTable, MimicCanvas, StatusDot, QualityBadge. Se construyen una vez contra datos de ejemplo.

- **Compuestos.** Combinaciones con sentido operativo: un “WellTile” (KpiTile + StatusDot + sparkline), un “AlarmPanel” (DataTable + AlarmRow). Conocen primitivas, no fuentes de datos.

- **Pantallas.** Componen compuestos y se conectan al estado. Una pantalla no contiene lógica de render de datos cruda; orquesta. El “Detalle de Pozo” coloca un WellHeader, una franja de KpiTiles, un panel de tendencias y un panel de alarmas.

**Regla de oro.** Si un desarrollador está copiando y pegando el dibujo de un KPI en una pantalla, la arquitectura falló. Las pantallas componen; nunca reimplementan.

## 7. Componentes Primitivos Reutilizables

El conjunto mínimo que sostiene toda la plataforma. Cada uno encapsula una regla del sistema de diseño para que esa regla no se pueda romper por accidente:

| **Primitiva**    | **Encapsula**                                                          |
|------------------|------------------------------------------------------------------------|
| KpiTile          | Valor tabular + unidad apagada + delta + sparkline + estado            |
| TrendChart       | uPlot con líneas de límite, calidad y huecos; sin relleno ni auto-zoom |
| AlarmRow         | Chip de prioridad sólido, estados, sin parpadeo                        |
| DataTable        | Cabecera fija, numéricos a la derecha, densidad por contexto           |
| MimicCanvas      | Mímico SVG ISA-101: gris en normal, color solo si anormal              |
| StatusDot        | Único punto de verdad para el color de estado                          |
| QualityBadge     | Marca de dato estimado/incierto/viejo; nunca se oculta                 |
| ConnectionBanner | Estado de conexión satelital: 'reconectando, dato 9 min'               |

## 8. Estándares TypeScript y de Código

- **TypeScript estricto, sin “any”.** Los tipos de la telemetría y de la API son contratos. Un valor de presión sin tipo es un error esperando ocurrir en producción.

- **Tipos generados desde el contrato de API.** Los tipos del cliente se generan desde la especificación OpenAPI del backend; no se escriben a mano ni se desincronizan.

- **Lint y formato automáticos.** ESLint + Prettier en configuración compartida. Una regla prohíbe colores hex literales en componentes (deben usar tokens) y prohíbe imports que salten capas.

- **Sin lógica en JSX.** Cálculos y formateo (precisión por tag, cifras tabulares) viven en utilidades, no incrustados en la vista.

- **Nombres en inglés en el código, dominio en español permitido.** Consistencia para el equipo y para Claude Code; la terminología de Well Testing puede conservar su forma habitual.

# Parte III — Sistema de Diseño en Código

## 9. Implementación de Tokens de Diseño

Los tokens del documento de Sistema de Diseño se implementan como variables CSS; el tema se cambia con un atributo en la raíz. Los componentes piden el significado; el tema decide el valor.

```
:root[data-theme='dark'] {
--bg-canvas: #0E1620; --bg-surface: #16202C;
--text-primary:#E6EDF3; --border-subtle:#243240;
--status-alarm:#D24A3D; --status-warn: #E0A12E;
}
:root[data-theme='light'] {
--bg-canvas: #F4F6F8; --bg-surface: #FFFFFF;
--text-primary:#16273D; --border-subtle:#D8E0E8;
}
· El componente usa var(--status-alarm), nunca '#D24A3D'
· Cambiar de modo oscuro a claro = cambiar un atributo
· packages/tokens es la única fuente de verdad
```

**Por qué así.** El tablet de campo a pleno sol necesita modo claro y la sala de control modo oscuro, con los mismos componentes. Si el color estuviera escrito en cada componente, soportar ambos sería reescribir la aplicación dos veces.

## 10. Arquitectura Tailwind

- **Tailwind mapeado a los tokens.** El tema de Tailwind no define colores propios: apunta a las variables CSS. Así “bg-surface” en una clase y el token son lo mismo.

- **Sin valores arbitrarios de color.** Prohibido por lint escribir un color suelto en una clase. La disciplina ISA-101 se hace cumplir por herramienta, no por buena voluntad.

- **Densidad por contexto.** Un atributo de densidad (cómoda para tablet, compacta para sala de control) ajusta espaciados desde el tema, no caso por caso.

## 11. Layout y Rutas

- **Layouts anidados de Next.js.** Un layout raíz (tema, providers), un layout por grupo (consola RVF / portal cliente) con su navegación y densidad, y la pantalla dentro. La barra superior y el banner de alarmas viven en el layout, presentes siempre.

- **Rutas que reflejan la jerarquía.** /operaciones, /pozos/\[id\], /pozos/\[id\]/equipos, /sensores, /alarmas, /tendencias. El portal del cliente vive bajo su propio grupo con guardia de servidor.

- **Protección en el servidor.** Un middleware de Next.js valida la sesión antes de renderizar; una ruta de consola RVF nunca llega al navegador de un usuario de cliente.

# Parte IV — Tiempo Real y Datos

## 12. De MQTT al Render: la Cadena Completa

Esta es la sección más importante del documento. Describe el camino del dato desde el sensor SignalFire hasta el píxel, y la regla que lo hace fluido y confiable.

![Diagrama de arquitectura](./RVF_Malinois_Ingenieria_media/media/29fd73ef6e047312e2f38ebbfce0a3269637becd.png)

*Diagrama — De los sensores al render: cadena de telemetría en tiempo real*

- **El navegador nunca habla MQTT ni ThingsBoard.** El backend de RVF recibe MQTT y lo convierte en WebSocket para el navegador. Esto desacopla el frontend de la infraestructura y es seguridad: el navegador no se conecta a sistemas industriales.

- **El render se desacopla de la ingesta.** Los mensajes WebSocket caen en un “ring buffer” (memoria circular) por (pozo, tag) que vive FUERA del ciclo de render de React. Un tick controlado (3 o 4 veces por segundo) lee el último valor y actualiza solo el componente suscrito a ese tag.

- **Por qué esto es no negociable.** Con 7 pozos × ~10 tags actualizándose cada 5 s (más caudal cada 2 s), re-renderizar React en cada mensaje colapsa la interfaz. El patrón de ring buffer + tick es exactamente lo que hace Honeywell y AVEVA.

## 13. Arquitectura WebSocket

- **Una conexión, multiplexada por suscripción.** El navegador abre un WebSocket y se suscribe a los pozos/tags visibles. Al cambiar de pantalla, cambia la suscripción; no se abren decenas de conexiones.

- **Reconexión con retroceso exponencial y jitter.** El satélite se cae. El cliente reintenta con esperas crecientes y aleatorizadas para no martillar el backend al volver la señal.

- **Catch-up tras reconexión.** Al reconectar, el cliente pide por REST una “foto” del último valor de cada tag y de las alarmas activas, y luego reanuda el stream. Nunca se asume que no pasó nada durante la caída.

- **Autenticado y con alcance de cliente.** La suscripción se valida contra la sesión: un usuario de Repsol solo puede suscribirse a pozos de Repsol. El alcance lo decide el servidor, no el navegador.

## 14. Renderizado de Telemetría en Tiempo Real

El detalle de implementación que separa una plataforma industrial de un prototipo:

8.  El mensaje llega al cliente WebSocket y se escribe en el ring buffer (último valor por tag, más una ventana corta para sparklines).

9.  Un tick por requestAnimationFrame, limitado a 3–4 Hz para KPIs, lee del buffer.

10. Solo los componentes suscritos a un tag que cambió se vuelven a dibujar (suscripción fina por selector).

11. Si llegan más mensajes que renders, se fusionan: gana el último por tag (los valores vivos son “último conocido”; el historial completo lo guarda el servidor).

12. Los gráficos en vivo añaden a un arreglo tipado y uPlot redibuja en su propio ciclo; el gráfico no se recrea jamás.

13. Detección de “dato viejo” en el cliente: si no llega un mensaje de un tag en N veces su intervalo esperado, se marca “sin dato” (gris). Nunca se muestra un valor congelado como si fuera vivo.

**Ejemplo de Well Testing.** En el Centro de Operaciones con 7 pozos en prueba, la presión de entrada del separador del pozo CN-014 actualiza cada 5 s. Solo el KpiTile de esa presión se redibuja; el resto del tablero permanece inmóvil. Si el Pressure Scout se queda sin batería, a los ~40 s ese KpiTile pasa a gris “sin dato hace X” en lugar de mentir con 1245 psi para siempre.

## 15. Streaming de Alarmas

- **Mismo WebSocket, canal distinto.** Las alarmas llegan por el mismo socket que la telemetría pero en su propio tipo de mensaje, con su ciclo de vida (activa, reconocida, normalizada).

- **El banner global se alimenta del stream.** El conteo de alarmas activas y su prioridad máxima se derivan del stream y del catch-up; visible en todas las pantallas.

- **Un solo pulso, sin bucle.** Una alarma nueva dispara una llamada de atención no repetitiva; el estado de alarma persiste, la animación no. Coherente con ISA-18.2 y el sistema de diseño.

- **Reconocer es una llamada a la API.** El frontend no “apaga” la alarma localmente: envía el reconocimiento al backend, que lo registra en auditoría y propaga el nuevo estado por el stream.

## 16. Arquitectura de Estado

Tres tipos de estado, separados y nunca mezclados. Mezclarlos es la causa número uno de bugs en frontends de tiempo real:

- **Estado de servidor (TanStack Query).** Datos que viven en el backend: historiador, metadatos de pozos, lista de trabajos, reportes. Con caché, reintentos y cancelación.

- **Estado de tiempo real (store dedicado).** Telemetría viva y alarmas. Vive fuera de React, en el ring buffer, y se consume con suscripciones finas.

- **Estado de UI (local).** Qué pestaña está abierta, qué rango de tiempo se eligió, filtros. Efímero y local al componente o a un store ligero de UI.

## 17. Cliente de API

- **Tipado y generado desde el contrato.** Un paquete (api-client) con funciones tipadas: getWellTelemetry(range, tags, resolution), listAlarms(filter), acknowledgeAlarm(id). Los tipos salen de la especificación OpenAPI.

- **La única puerta al backend.** Ningún componente hace fetch suelto. Si el backend cambia (o se migra desde ThingsBoard), solo cambia este paquete; las pantallas no se enteran.

- **Errores normalizados.** El cliente convierte cualquier fallo en un error tipado (no autorizado, sin conexión, dato no disponible) que la UI sabe representar con calma.

## 18. Historiador y Downsampling

La regla más importante de rendimiento de gráficos: el frontend nunca pide datos crudos para rangos largos.

- **Resolución por ancho de pixel.** Para un gráfico de 1000 px de ancho y 30 días, no tiene sentido traer cientos de miles de puntos crudos de 5 s. El frontend pide ~1–2 puntos por píxel; el servidor agrega (TimescaleDB, agregados continuos del documento de Fundación Técnica).

- **El servidor decide el detalle, no el cliente.** El backend expone niveles de resolución; el cliente pide el adecuado al rango y al tamaño del gráfico.

- **Caché por (tags, rango, resolución).** Volver al mismo rango no re-consulta. Cambiar de rango cancela la consulta en curso (abort) para no acumular peticiones.

## 19. Estrategia de Renderizado de Gráficos

- **uPlot para tendencias.** Minúsculo y diseñado para series temporales densas; dibuja decenas de miles de puntos sin tironeos. Recharts y similares (un nodo SVG por punto) colapsan con telemetría en vivo y quedan prohibidos para tendencias.

- **Una sola envoltura.** El paquete charts configura uPlot con la disciplina del sistema de diseño: solo líneas, sin relleno, sin auto-zoom del eje, líneas de límite punteadas, calidad y huecos honestos. Ninguna pantalla configura un gráfico a mano.

- **El gráfico nunca se recrea.** En vivo se hace append a un arreglo tipado y uPlot redibuja; recrear el gráfico en cada dato es un error de rendimiento clásico.

## 20. Renderizado de Mímicos SCADA

- **SVG, no canvas, no 3D.** Un esquema ISA-101 (separador, choke, EMGAD/EMMAD) tiene pocos elementos; SVG es nítido, escalable, accesible y fácil de mantener. Canvas solo si algún mímico llegara a ser extremadamente denso (no es el caso hoy).

- **Esquema estático + capa de datos.** El dibujo del separador es estático; una capa fina de React superpone los valores y el color de estado en los puntos correctos. El mímico refleja, no acciona (solo lectura).

- **Biblioteca de símbolos compartida.** Recipiente, tubería, válvula-como-estado, flecha de flujo: un componente por símbolo, reutilizado en todos los mímicos.

## 21. Renderizado de Mapas

- **Secundario y diferido.** El mapa no es la pantalla principal de una operación de Well Testing. Se carga solo cuando se necesita (lazy) para no penalizar el arranque.

- **MapLibre GL, sin atadura de proveedor.** Marcadores con el color de estado del pozo; tocar un marcador lleva al detalle. La topología de la malla SignalFire (Gateway ↔ sensores) es más útil que el mapa geográfico y se dibuja con SVG.

## 22. Renderizado de Calidad de Dato

- **La calidad es un atributo de primera clase.** Cada valor llega con su calidad (bueno, estimado, incierto, malo, viejo). Las primitivas KpiTile y TrendChart la representan: punteado, atenuado, marcador, etiqueta.

- **Nunca se oculta para “verse limpio”.** Un dato malo dibujado como bueno es una mentira operativa que puede costar una decisión equivocada en una prueba. La QualityBadge es obligatoria cuando la calidad no es “buena”.

- **El hueco se dibuja como hueco.** Si faltó dato (satélite o sensor), la curva se interrumpe y se etiqueta; jamás se interpola.

## 23. Caché

- **Caché de consultas (TanStack Query).** Historiador y metadatos: tiempos de validez por tipo de dato (metadatos largos, historiador medio, nada de cachear telemetría viva).

- **La telemetría viva no se cachea.** Es un stream; el “último valor” vive en el ring buffer, no en una caché de consultas.

- **Prefetch prudente.** Al pasar el cursor sobre un pozo se puede precargar su detalle; sin abusar para no saturar el enlace satelital del cliente.

## 24. Comportamiento Offline y Satélite

El frontend asume que la conexión es intermitente, igual que el borde:

- **Estado de conexión siempre visible.** Un ConnectionBanner muestra “en vivo”, “reconectando…” o “sin conexión — último dato hace 9 min”. El operador siempre sabe si lo que ve es actual.

- **Degradar con elegancia.** Sin stream, las pantallas muestran el último valor conocido, atenuado y fechado, y las consultas al historiador siguen funcionando cuando vuelva la red.

- **Nunca mentir sobre la frescura.** Un valor viejo presentado como vivo es el peor error posible en una sala de control. La regla anti-stale es de seguridad, no de estética.

# Parte V — Rendimiento, Seguridad, Escala

## 25. Rendimiento y Escalabilidad

- **El único problema de rendimiento real es el render en vivo.** Resuelto con ring buffer + tick + suscripción fina. El resto es React empresarial normal; no se optimiza de forma prematura lo que no es un cuello de botella.

- **Listas grandes virtualizadas.** El centro de alarmas o la lista de sensores con cientos de filas se virtualizan (solo se dibuja lo visible).

- **Código dividido por ruta.** Mapas, analítica y reportes se cargan bajo demanda; la consola arranca ligera.

- **Escala por suscripción, no por fuerza bruta.** Más pozos no significa más datos en el navegador: solo se suscribe a lo visible; el resto es un resumen ligero del backend.

## 26. Aislamiento Multi-cliente en el Frontend

- **El navegador jamás decide el cliente.** El alcance sale de la sesión, derivada en el servidor. Si un usuario de cliente fabrica una URL hacia un pozo de otra empresa, la API (seguridad a nivel de fila del documento de Fundación Técnica) no devuelve nada y la UI muestra un estado “sin acceso”.

- **Defensa en profundidad.** El guardado de rutas y el ocultado en la UI son comodidad; el servidor es la verdad. Nunca se confía solo en esconder un botón.

- **Grupos de ruta separados.** Consola RVF y portal de cliente son grupos distintos; un fallo de UI no puede “filtrar” una pantalla interna a un cliente.

## 27. Autenticación Frontend

- **Sesión por cookie httpOnly.** El navegador nunca ve el token; vive en una cookie que JavaScript no puede leer. Esto neutraliza el robo de sesión por scripts maliciosos.

- **Validación en el servidor (middleware).** Antes de renderizar una ruta protegida, Next.js valida la sesión. Sin sesión válida, no hay HTML que filtrar.

- **SSO empresarial para clientes.** Repsol entra con las credenciales de su organización (SAML/OIDC vía el proveedor del documento de Fundación Técnica); el frontend solo orquesta el flujo, no maneja contraseñas.

## 28. Seguridad Frontend

- **Sin secretos en el navegador.** Ninguna clave de API ni credencial vive en el código del cliente. Todo lo sensible pasa por el backend.

- **Cabeceras de seguridad y CSP.** Política de contenido estricta para mitigar inyección de scripts; conexiones solo por TLS.

- **Entrada y salida tratadas con cuidado.** Aunque es una plataforma de solo lectura, todo texto del backend se renderiza de forma segura; nada de HTML sin sanear.

- **Dependencias auditadas.** Revisión automática de vulnerabilidades en CI; menos dependencias es más seguridad.

## 29. Manejo de Errores

- **Errores tipados, no excepciones difusas.** El cliente de API entrega errores con forma conocida; la UI tiene una representación calmada para cada uno (sin acceso, sin conexión, dato no disponible).

- **Fronteras de error por pantalla.** Un fallo al cargar las tendencias no debe tumbar todo el Centro de Operaciones; cada panel falla de forma aislada y ofrece reintentar.

- **Sin dramatismo.** Mensajes factuales: qué pasó y qué hacer. Nunca culpar al usuario ni pantallas rojas de pánico (coherente con el sistema de diseño).

## 30. Observabilidad y Logging

- **Errores del frontend capturados (Sentry o equivalente).** Con contexto: qué pantalla, qué pozo, estado de conexión. En un sistema industrial hay que enterarse de cada fallo, no esperar a que el cliente lo reporte.

- **Métricas de salud del stream.** Reconexiones, latencia de telemetría, tasa de “sin dato”. Si los operadores empiezan a ver datos viejos, ingeniería debe saberlo antes que ellos.

- **Sin datos sensibles en los registros.** Se registra el hecho y el contexto técnico, nunca contenido de cliente ni información personal.

## 31. Responsive

- **Tres escenarios con intención, no infinitas variantes.** Monitor de sala (ancho, denso), tablet de campo (táctil, modo claro, objetivos grandes), teléfono (consulta y alerta). No es “mobile-first” genérico.

- **Densidad por contexto, desde el tema.** El mismo componente se compacta o se agranda según el escenario; no se reescriben las pantallas.

## 32. Compatibilidad Futura con App Móvil

- **El monorepo ya lo habilita.** Mañana una app móvil (React Native/Expo) reutiliza packages/api-client, packages/realtime y packages/tokens sin duplicar lógica ni romper el aislamiento de clientes.

- **La app móvil será un visor de alerta.** Coherente con la UX: el teléfono consulta y avisa; no es la herramienta de operación. No condiciona la arquitectura web de hoy, pero esta no le cierra la puerta.

# Parte VI — Proceso de Ingeniería

## 33. Estrategia de Pruebas

- **Unidad y componente (Vitest + Testing Library).** Las utilidades críticas (formateo numérico tabular, precisión por tag, detección de dato viejo) se prueban con rigor; un error aquí corrompe toda lectura.

- **End-to-end de flujos críticos (Playwright).** Iniciar sesión, ver un pozo en vivo, reconocer una alarma, consultar el historiador, y —clave— verificar que un cliente no ve pozos de otro.

- **Simulador de telemetría como banco de pruebas.** El render en vivo se prueba contra un stream sintético controlado: caídas de satélite, datos viejos, ráfagas. Esto se hace ANTES de tener hardware real.

- **Regresión visual del sistema de diseño.** Storybook con capturas comparadas: un cambio accidental en una primitiva se detecta antes de llegar a producción.

## 34. Workflow de Git

- **Trunk-based con ramas cortas.** Rama principal siempre desplegable; ramas de vida corta por tarea. Sin ramas eternas que divergen durante semanas.

- **Pull Request obligatorio con CI verde.** Lint, tipos, pruebas y build deben pasar antes de fusionar. Revisión por al menos otra persona.

- **Commits y PRs descriptivos.** El historial es documentación; un “fix” sin contexto es deuda técnica.

## 35. CI/CD y Despliegue

- **Integración continua por PR.** GitHub Actions ejecuta lint, tipos, pruebas, build y un despliegue de previsualización para revisar la UI antes de fusionar.

- **Despliegue contenedorizado y autoalojado.** Imagen Docker de Next.js en modo standalone, junto a la infraestructura del backend, por el requisito de residencia de datos de clientes como Repsol. Vercel solo como previsualización de desarrollo, no producción.

- **Despliegues pequeños y reversibles.** Entregas frecuentes y chicas, con vuelta atrás rápida. En software industrial, poder revertir en minutos vale más que una entrega grande.

## 36. Entornos de Desarrollo

| **Entorno**      | **Propósito**              | **Datos**                                  |
|------------------|----------------------------|--------------------------------------------|
| Local            | Desarrollo diario          | Simulador de telemetría + datos de ejemplo |
| Previsualización | Revisar cada PR            | Backend de pruebas + simulador             |
| Staging          | Ensayo previo a producción | Datos realistas, aislado de clientes       |
| Producción       | Operación real             | Telemetría real, autoalojado               |

- **El simulador es de primera clase.** Permite a cualquier desarrollador (y a Claude Code) trabajar sin esperar un pozo real. Es lo que mantiene el avance independiente del calendario de campo.

## 37. Estructura del Equipo de Ingeniería

- **Pequeño y enfocado.** Un líder/arquitecto frontend, uno o dos ingenieros frontend, el ingeniero de backend compartido (de los documentos previos), un diseñador a tiempo parcial (dueño del sistema de diseño) y QA compartido.

- **Claude Code amplifica, no reemplaza el juicio.** Claude Code construye gran parte del código bajo la dirección del líder frontend, que es quien sostiene las decisiones difíciles de revertir (sección 2).

- **El diseñador custodia el sistema de diseño.** Una sola persona vela por que las primitivas no se degraden con el tiempo; sin custodio, el sistema de diseño se erosiona.

# Parte VII — Ruta de Implementación

## 38. Fases de Implementación y Secuencia MVP

El orden importa: primero la “carretera pavimentada” (tooling y fronteras), luego la pieza más riesgosa (tiempo real) contra el simulador, y solo entonces el hardware real.

| **Fase**               | **Qué se construye**                                                      | **Resultado**                                          |
|------------------------|---------------------------------------------------------------------------|--------------------------------------------------------|
| F0 — Cimientos         | Monorepo, tooling, TypeScript, tokens, Tailwind, Storybook                | La 'carretera pavimentada' lista                       |
| F1 — Primitivas        | Card, KpiTile, TrendChart, AlarmRow, DataTable, MimicCanvas               | Sistema de diseño en código, con datos de ejemplo      |
| F2 — Datos             | Cliente de API tipado, cliente WebSocket, store de tiempo real, simulador | La tubería de tiempo real probada con datos sintéticos |
| F3 — Rebanada vertical | Detalle de Pozo de extremo a extremo (simulador → luego API real)         | La pieza riesgosa demostrada y funcionando             |
| F4 — Consola RVF       | Operaciones, Multipozo, Alarmas, Salud de Sensores, Tendencias            | La herramienta interna operativa                       |
| F5 — Portal cliente    | Portal aislado, reportes, auditoría                                       | La vitrina para Repsol                                 |
| F6 — Endurecimiento    | Rendimiento, seguridad, observabilidad, pruebas e2e                       | Listo para producción con un cliente                   |

## 39. Qué Debe Construir Claude Code Primero

Secuencia concreta para arrancar con Claude Code, en este orden estricto:

14. El monorepo con tooling: pnpm, Turborepo, TypeScript estricto, ESLint/Prettier con las reglas (sin hex literal, sin saltar capas), Tailwind apuntando a tokens, Storybook.

15. El paquete de tokens (variables CSS, modo oscuro y claro) y las primitivas del sistema de diseño contra datos de ejemplo, revisadas en Storybook.

16. El paquete de cliente de API tipado y el cliente WebSocket, más el simulador de telemetría.

17. El armazón de la app: layouts, navegación, barra superior, banner de alarmas, grupos de ruta consola/portal, theming.

18. La rebanada vertical: el Detalle de Pozo conectado al simulador, demostrando el ring buffer + tick + anti-stale. Solo cuando esto funcione con datos sintéticos, se conecta a la API real.

19. El resto de pantallas de la consola, luego el portal del cliente, luego endurecimiento.

**La regla de oro de la secuencia.** Probar la tubería de tiempo real contra el simulador antes de cablear ThingsBoard/MQTT real. Es la parte más riesgosa; demostrarla temprano elimina el mayor riesgo del proyecto.

## 40. Riesgos Técnicos

| **Riesgo**                                             | **Mitigación**                                               |
|--------------------------------------------------------|--------------------------------------------------------------|
| Re-render de React en cada mensaje (colapso)           | Ring buffer + tick + suscripción fina desde el día uno       |
| Pedir datos crudos de rangos largos                    | Downsampling en el servidor por ancho de pixel               |
| El navegador acoplado a ThingsBoard/MQTT               | Cliente de API que envuelve el backend; nunca acceso directo |
| Confiar en el cliente para el alcance de tenant        | Alcance derivado del servidor; defensa en profundidad        |
| Librería de gráficos lenta                             | uPlot para tendencias; prohibido un nodo SVG por punto       |
| No poder desarrollar sin hardware de campo             | Simulador de telemetría de primera clase en el repo          |
| Datos viejos mostrados como vivos tras caída satelital | Detección anti-stale + catch-up + banner de conexión         |
| Sobre-ingeniería (microfrontends, Redux, GraphQL)      | Mantener el stack aburrido y deliberadamente simple          |

## 41. Errores de Ingeniería a Evitar

20. Construir el render acoplado a la ingesta y “optimizarlo después”: después es reescribir el frontend.

21. Dejar que los componentes hagan fetch sueltos a ThingsBoard: acopla todo y rompe la migración futura.

22. Colores hex literales en componentes: destruye el theming y la disciplina ISA-101.

23. Interpolar huecos o esconder calidad para que “se vea limpio”: mentira operativa.

24. Asumir despliegue solo en Vercel cuando el cliente exige autoalojamiento por residencia de datos.

25. Tokens de sesión en localStorage: vector de robo de sesión; usar cookie httpOnly.

26. Empezar por las pantallas bonitas y dejar la tubería de tiempo real para el final.

27. Saltarse el simulador y bloquear al equipo esperando un pozo real.

28. Optimizar de forma prematura lo que no es cuello de botella e ignorar el único que sí lo es (render en vivo).

29. Microfrontends o Redux “porque sí”: complejidad que un equipo pequeño no puede operar con fiabilidad.

## 42. Filosofía Final de Ingeniería

Si todo este documento se redujera a una página, sería esto:

- **Aburrido, confiable, observable.** Herramientas maduras, decisiones conservadoras, todo medible. La novedad es riesgo; la fiabilidad es el producto.

- **La tubería de tiempo real es el corazón.** Se diseña, se prueba y se demuestra primero, contra un simulador. Todo lo demás es React empresarial convencional.

- **Fronteras duras que protegen el futuro.** El sistema de diseño y el cliente de API son murallas. Cambiar la marca o el backend toca una sola capa.

- **Honestidad sobre el dato por encima de todo.** Nunca mostrar un valor viejo como vivo, nunca esconder mala calidad, nunca interpolar un hueco. En una sala de control que supervisa pozos de Repsol, la honestidad del dato es seguridad, no estética.

- **Construir la pieza riesgosa primero.** El mayor riesgo del proyecto no es la UI; es el render en vivo sobre satélite. Demostrarlo temprano, con datos sintéticos, es lo que convierte este plan en un producto.

## 43. Glosario

| **Término**             | **Significado**                                               |
|-------------------------|---------------------------------------------------------------|
| Monorepo                | Un repositorio con varios paquetes que comparten código       |
| Primitiva               | Componente base del sistema de diseño, sin lógica de datos    |
| Ring buffer             | Memoria circular de tamaño fijo para el último valor por tag  |
| Render desacoplado      | El dibujo no ocurre en cada dato, sino en un tick controlado  |
| Tick (rAF)              | Pulso de actualización limitado a pocas veces por segundo     |
| WebSocket               | Canal persistente para empujar datos vivos al navegador       |
| Downsampling            | Reducir puntos a la resolución útil para el ancho del gráfico |
| TanStack Query          | Librería de estado de servidor (caché, reintentos)            |
| Catch-up                | Foto de estado que se pide tras reconectar el WebSocket       |
| Anti-stale              | Marcar 'sin dato' si un tag deja de reportar a tiempo         |
| Cookie httpOnly         | Sesión que JavaScript no puede leer (más segura)              |
| Defensa en profundidad  | Varias capas de control; el servidor es la verdad             |
| Trunk-based             | Flujo de Git con rama principal siempre desplegable           |
| Rebanada vertical       | Una pantalla completa de extremo a extremo como prueba        |
| Simulador de telemetría | Herramienta que emite datos sintéticos para desarrollar       |

*
