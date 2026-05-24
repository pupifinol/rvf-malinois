# RVF Malinois — F2 Runtime Integration Notes v1.0

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

## 1. Propósito del Documento

Este documento es una nota técnica de integración runtime de la Fase F2 de RVF Malinois. Captura, de forma fechada, cómo quedó integrada la arquitectura runtime después de las entregas F2A, F2B y F2C, qué patrones se establecieron, qué errores se corrigieron y qué reglas debe respetar la próxima fase F2D.

**Lo que este documento NO es.** No reemplaza ADR-005 ni el documento principal F2 — Arquitectura de Telemetría en Tiempo Real. No introduce decisiones nuevas de arquitectura. No autoriza protocolos industriales en el navegador. No reabre la pantalla Units ni Settings.

**Lo que este documento sí es.** Un puente operativo entre F2C y F2D: un punto de control que registra el estado real del runtime y deja a Claude Code instrucciones precisas para no romperlo cuando construya el BackendWebSocketTelemetryAdapter.

## 2. Estado Actual del Proyecto después de F2A, F2B y F2C

Las tres primeras sub-fases de F2 quedaron entregadas y tagueadas. F2A creó la fundación de telemetría (modelos, simulador, store, evaluador de alarmas, detector stale, hooks base). F2B conectó la pantalla Operations al runtime y demostró el render en vivo sin lógica de telemetría en componentes. F2C extendió el mismo runtime a la pantalla Alarms con ciclo de vida active/acknowledged/cleared y separación de alarmas de proceso, calidad de dato y comunicación. El Client Portal de producción quedó diseñado aparte como vista de solo lectura sin alarmas internas.

| **Fase**                            | **Estado**       | **Entrega**                                                                       | **Tag**                       |
|-------------------------------------|------------------|-----------------------------------------------------------------------------------|-------------------------------|
| F2A — Telemetry Domain Foundation   | Entregada        | Modelos, simulator adapter, store, evaluator, stale detector, hooks base, tests   | v0.3-telemetry-foundation     |
| F2B — Live Operations UI            | Entregada        | Operations consume live values, alarm states, stale/offline, communication status | v0.4-live-operations-ui       |
| F2C — Alarm Center Integration      | Entregada        | Alarms consume el mismo runtime, ack local, lifecycle, separación de categorías   | v0.5-alarm-center-integration |
| Client Portal — Production Overview | Diseñado, aparte | Read-only de producción (crudo, gas, corte de agua); sin alarmas internas         | —                             |
| F2D — Backend WebSocket Adapter     | Pendiente        | Adapter de stream normalizado para reemplazar el simulador sin tocar UI           | —                             |

## 3. Flujo Runtime Actual de Telemetría Simulada

El runtime actual emula el stream normalizado del backend RVF. No habla con dispositivos de campo y no implementa protocolos industriales: emite mensajes con la misma forma que entregará el backend cuando esté listo, para que la sustitución posterior sea quirúrgica.

```
F2A / F2B / F2C — RUNTIME ACTUAL (simulado)
SimulatedNormalizedTelemetryAdapter
| normalized messages (reading / frame / alarm / connection / heartbeat)
v
TelemetryStore (fuera de React)
| ring buffer por (jobId, canonicalTag)
v
Selectors · AlarmEvaluator · StaleDetector
|
v
Hooks (useLiveValue, useAlarmState, useAlarmCenter, useConnectionStatus, ...)
|
+-----------------------------+
v v
Operations UI Alarms UI
Client Portal (read-only) NO se conecta a este runtime de alarmas internas.
```

**Lo que esto significa.** El simulador imita el stream normalizado del backend, no dispositivos. Operations y Alarms son consumidores tontos del store; toda la lógica vive entre el adapter y los selectores.

## 4. Runtime Compartido

Operations y Alarms comparten una sola instancia de runtime. No existe un “Operations runtime” distinto de un “Alarms runtime”: ambos consumen del mismo store y del mismo adapter. Este punto es crítico para la corrección y para el rendimiento.

- **Una sola instancia (singleton).** El runtime se monta una vez y se reutiliza. Si dos componentes lo “arrancan”, no se crean dos adapters: ref-count incrementa y decrementa; el último “stop” apaga el simulador.

- **Idempotencia.** start() y stop() pueden llamarse repetidamente sin efectos secundarios. Esto cubre Strict Mode de React 19 (que monta-desmonta-monta) y Hot Module Replacement de Next.js.

- **No duplicar intervals.** El simulador usa intervalos internos para emitir mensajes. Si se duplica, la app sufre re-renders dobles, lecturas inconsistentes y alarmas “fantasma”. La protección es ref-counting y nombres de módulo estables.

- **Strict Mode y HMR.** Ambos provocan ciclos de montaje extra. El runtime debe tolerarlos: en desarrollo no debe crear adapters duplicados, no debe registrar listeners duplicados, no debe acumular suscriptores muertos.

## Nota de nombrado

El módulo se llama “operationsRuntime” por origen histórico (se introdujo en F2B). Su rol práctico desde F2C es ser el runtime compartido del front. Se recomienda mantener el nombre estable hasta F2D para no introducir cambios mecánicos innecesarios; el renombrado a “sharedTelemetryRuntime” o equivalente queda como tarea cosmética posterior, opcional, y solo si el equipo lo considera necesario al cerrar F2D.

## 5. TelemetryStore y Ring Buffer

- **Store fuera de React.** Las suscripciones viven en un módulo plano, no en estado de React. Los componentes acceden vía useSyncExternalStore.

- **Ring buffer por (jobId, tag canónico).** Cada combinación tiene su propia memoria circular: el último valor + una ventana corta para sparklines. Tamaño fijo, sin crecimiento ilimitado.

- **Selectores finos.** Una lectura nueva de p_inlet del job J solo despierta a los componentes suscritos a (J, p_inlet). Una caída de q_gas no re-renderiza nada de presión.

- **API de consulta.** getLatest(jobId, tag), getWindow(jobId, tag, n), subscribe((jobId, tag) =\> void). Sin React. Sin promesas. Síncrono.

- **Por qué evita re-render masivo.** El re-render se restringe al componente cuya “rebanada” cambió. El resto del tablero permanece inmóvil — coherente con la regla de calma del sistema de diseño industrial.

- **Por qué los componentes no procesan raw streams.** Si un componente React procesara mensajes brutos del adapter, cada mensaje provocaría un setState y un re-render. El store + selectores rompen esa cadena, que es la fuente número uno de jank en SCADA de frontend.

## 6. Active Job / Commissioning Snapshot como Fuente de Verdad

ADR-005 lo establece y este runtime lo respeta: los umbrales efectivos que evalúan alarmas viven en el snapshot del trabajo activo. El catálogo de Units aporta defaults sugeridos al comisionar; nunca son la fuente final.

| **Elemento**                             | **Fuente de verdad**                     | **Consumidores**                       |
|------------------------------------------|------------------------------------------|----------------------------------------|
| Umbrales efectivos (warning/alarm Lo-Hi) | CommissioningSnapshot del trabajo activo | Operations, Alarms                     |
| Mapeo sensor → registro → tag canónico   | CommissioningSnapshot                    | Adapter, Store, Reports (futuro)       |
| Identidad del equipo, ratings, P&ID      | Catálogo de Units                        | Units screen, Reports (referencia)     |
| Defaults sugeridos de umbrales           | Catálogo de Units                        | Comisionamiento (solo como sugerencia) |
| Estado de alarma vigente                 | AlarmEvaluator (calcula contra snapshot) | Alarms, header indicator, Operations   |
| Estado stale/offline por tag             | StaleDetector                            | Operations, Alarms, banner conexión    |
| Producción para cliente                  | Read-model derivado (futuro)             | Client Portal (sin alarmas internas)   |

> **Recordatorio operativo.** Si en algún momento un desarrollador (o Claude Code) intenta que Operations o Alarms lean umbrales desde Units, eso reabre ADR-005 y rompe la trazabilidad histórica que protege a Repsol. La regla es absoluta: los umbrales viven en el snapshot del trabajo, no en el catálogo.

## 7. Hooks Actuales y Reglas de Estabilidad React 19

Los hooks de F2 usan useSyncExternalStore. React 19 es estricto con la estabilidad de identidad: si getSnapshot devuelve objetos nuevos en cada llamada, React entra en bucle. Estas reglas son obligatorias para todo hook que toque el store; varias aprendidas a la mala durante F2B y F2C.

## Reglas obligatorias

- getServerSnapshot debe devolver una referencia estable (constante a nivel de módulo o useRef cache).

- No usar Date.now() dentro de getSnapshot: introduce no determinismo y rompe el caching de React.

- Si hace falta “ahora”, capturarlo una vez por render con useNowTick y pasarlo como entrada estable.

- Empty snapshots (vacíos) deben ser constantes singleton a nivel de módulo, preferentemente Object.freeze().

- Arrays vacíos: una sola constante EMPTY_ARRAY congelada y compartida; nunca \[\] inline.

- Objetos vacíos: una sola constante EMPTY_OBJECT congelada; nunca {} inline.

- Cache estructural con useRef: si el resultado lógico no cambió, devolver la referencia previa.

- Igualdad estructural ignora metadata cambiante (timestamps de “tick”, contadores de debug) que no define el estado visual.

- subscribe(...) debe ser memoizado (useCallback con deps estables) o módulo-level.

- Inputs como arrays de jobs deben ser estables: módulo-level o useMemo con deps escalares.

- Callbacks como tag labellers deben pasarse estables (useCallback o módulo-level).

- Nunca devolver objetos nuevos si el estado lógico no cambió, ni siquiera “para ser explícito”.

## Tabla por hook

| **Hook**                        | **Qué retorna**                                    | **Riesgo principal**                          | **Patrón de estabilidad**                     |
|---------------------------------|----------------------------------------------------|-----------------------------------------------|-----------------------------------------------|
| useLiveValue(jobId, tag)        | Lectura actual: {value, unit, quality, ts, status} | Re-render por nuevo objeto en cada tick       | useRef cache + igualdad por value/quality/ts  |
| useAlarmState(jobId, tag)       | AlarmEvaluationResult vigente                      | Re-render por evaluación recalculada          | Cache hasta que cambie state/threshold/value  |
| useUnitTelemetrySnapshot(jobId) | Vista agregada por tag para una unidad             | Snapshot nuevo cada llamada                   | Snapshot estructural con cache; clave job     |
| useHistoryBuffer(jobId, tag, n) | Array de últimas N lecturas (sparkline)            | Array nuevo cada read                         | Singleton EMPTY_ARRAY; cache si seq no cambió |
| useAlarmSummary()               | Conteo activo por prioridad                        | Objeto nuevo cada render                      | Cache por (counts, maxPriority)               |
| useAlarmCenter()                | AlarmCenterSnapshot completo                       | Snapshot nuevo cada deriveAlarmCenterSnapshot | EMPTY_ALARM_CENTER_SNAPSHOT singleton + cache |
| useConnectionStatus()           | CommunicationStatus actual                         | Objeto nuevo en cada heartbeat                | Cache por kind + lastDataTs                   |
| useActiveJobSnapshot()          | ActiveJobSnapshot \| null                          | Snapshot recomputado                          | Identity stable; null estable como singleton  |
| useNowTick(intervalMs)          | number (ms) seguro de hidratación                  | Hydration mismatch en SSR                     | SSR fixed seed; setInterval solo en cliente   |

## 8. Errores Detectados en F2B/F2C y Lecciones Aprendidas

Estos errores se detectaron y corrigieron en producción de F2B y F2C. Quedan documentados para que F2D no los repita.

| **Error**                                 | **Causa**                                             | **Corrección**                                      | **Regla preventiva**                                  |
|-------------------------------------------|-------------------------------------------------------|-----------------------------------------------------|-------------------------------------------------------|
| Hydration mismatch en reloj del Topbar    | Date.now() en render del servidor distinto al cliente | useNowTick con SSR fixed seed; tick solo en cliente | SSR debe ser determinista; nada de Date.now en render |
| getServerSnapshot should be cached        | Devolvía objetos nuevos en cada llamada               | Constante módulo-level (EMPTY_SNAPSHOT)             | Empty snapshots singleton congelados                  |
| getSnapshot should be cached              | Reconstrucción del snapshot cada call                 | useRef cache + structural equality                  | Cache estructural; mismo input → misma ref            |
| Maximum update depth exceeded             | subscribe no memoizado; identidad cambiante           | subscribe módulo-level o useCallback estable        | Toda dep de useSyncExternalStore es estable           |
| Selectores devolviendo objetos nuevos     | Reconstrucción {value, ts, quality} cada vez          | useRef cache; igualdad por campos relevantes        | Nunca objeto nuevo si el estado lógico no cambió      |
| Date.now() dentro de getSnapshot          | No determinismo en el snapshot                        | Pasar nowMs como input desde useNowTick             | getSnapshot debe ser función pura de inputs           |
| ringBuffer.toArray() devolvía array nuevo | Array creado cada lectura                             | Cache por seq; EMPTY_ARRAY singleton                | Buffer expone array estable hasta nueva inserción     |
| deriveAlarmCenterSnapshot recompute       | Snapshot recalculado en cada hook call                | Cache en useAlarmCenter con cmp estructural         | Derivación memoizada por (jobs, deps)                 |

## 9. Operations como Consumidor Vivo

- **Monta el runtime (idempotente).** Al entrar a la pantalla, llama start(); al salir, stop(). El ref-count del runtime hace que abrir/cerrar Operations no duplique adapters.

- **Muestra contexto del trabajo activo.** ActiveJobSnapshot: pozo, equipo, comisionamiento, hora de inicio. Visible siempre.

- **Consume valores vivos.** Cada KpiTile usa useLiveValue(jobId, tag). Se actualiza solo el componente del tag que cambia.

- **Consume estados de alarma.** useAlarmState(jobId, tag) devuelve normal/warning/alarm/no_data/disabled, calculado contra el snapshot.

- **Consume stale/offline.** El KpiTile lo refleja como atenuado + “sin reportar hace X” cuando aplica.

- **Consume estado de comunicación.** Banner de conexión — sin disfraz: si el adapter está reconectando, el banner lo dice.

- **Muestra tendencias desde el ring buffer.** Sparkline y mini-trend leen del buffer; el gráfico no se recrea por dato.

- **Cero lógica de telemetría dentro.** Los componentes no evalúan, no calculan stale, no leen Units, no conocen el adapter.

## 10. Alarms como Consumidor Vivo

- **Comparte runtime con Operations.** No monta un runtime propio. start() es idempotente; el ref-count se incrementa.

- **Usa useAlarmCenter().** Recibe el AlarmCenterSnapshot derivado: lista de eventos vigentes, agrupaciones, conteos.

- **Deriva LiveAlarmEvents.** Cada cambio de AlarmEvaluationResult del store engendra (o cierra) un evento; el AlarmCenter los acumula con su ciclo de vida.

- **Tres categorías separadas.** Alarmas de proceso, alarmas de calidad de dato y alarmas de comunicación. No se mezclan visualmente ni en el conteo.

- **Acknowledge local en memoria.** En F2C el ack vive en el cliente; en backend real (futuro) será una llamada a API. La forma del estado ya está lista para esa migración.

- **Lifecycle active → acknowledged → cleared.** El estado es derivado, no inventado en la UI.

- **Solo interna RVF.** Nunca aparece en Client Portal.

- **Sin backend persistence en F2C.** Lo que se reconoce hoy no sobrevive a un refresh; persistirá en una fase posterior con el backend real.

## 11. Client Portal Fuera de Alarmas Internas

El Client Portal es la vitrina hacia el cliente. Es read-only, sobrio, y muestra producción — nada más.

- **Qué muestra.** Producción de crudo, gas y corte de agua del pozo del cliente; tendencias de producción; metadatos del trabajo.

- **Qué NO muestra.** Alarm Center, diagnósticos internos, estado de protocolos, ni nombres de tecnología (Node-RED, ThingsBoard, MQTT, Modbus, Gateway, PLC).

- **Por qué.** Las alarmas internas son responsabilidad operativa de RVF; mostrarlas al cliente le da visibilidad de cosas que no le tocan operar y compromete información sensible.

- **Cómo se alimentará a futuro.** Mediante un read-model filtrado de producción servido por el backend; el navegador del cliente no recibe el stream interno de alarmas.

- **Hoy.** No consume el runtime de Operations/Alarms. Está aislado por diseño.

## 12. Frontera del Navegador según ADR-005

Repetido con voz firme para que F2D no flaquee aquí: el frontend habla un único idioma con el backend, el stream normalizado. Nada más.

## Frontend permitido

- Normalized WebSocket stream (telemetría viva, eventos de alarma, heartbeat, estado de conexión).

- REST/API del backend RVF (snapshots, configuración, historial, reportes).

## Frontend prohibido

- MQTT directo.

- Modbus directo.

- OPC-UA directo.

- PLC directo.

- Gateway Stick directo.

- Node-RED directo.

- ThingsBoard directo.

- Historian directo.

## Cadena real (futura, fuera del navegador)

```
REAL FUTURE CHAIN
Sensor / Instrument
-> Gateway / Edge
-> Node-RED
-> MQTT / ThingsBoard
-> RVF Backend
-> normalized WebSocket / REST
|
v
Browser (solo consume normalized; nada más)
```

## 13. Qué Debe Hacer F2D

F2D — Backend WebSocket Adapter / Normalized Stream Boundary.

1.  Introducir BackendWebSocketTelemetryAdapter como una nueva implementación de NormalizedTelemetryAdapter, con la misma interfaz que el simulador.

2.  Respetar el contrato NormalizedTelemetryMessage exactamente como lo emite el simulador hoy. El cambio es de implementación, no de contrato.

3.  Permitir elegir entre SimulatedAdapter y BackendAdapter por feature flag o variable de entorno. Default: simulador, mientras el backend no esté listo.

4.  Implementar reconnect con backoff exponencial + jitter, heartbeat y catch-up conceptual (o placeholder si el backend aún no tiene endpoint).

5.  Mantener contract tests: ambos adapters cumplen la misma forma y secuencia de mensajes.

6.  No duplicar el runtime. El BackendAdapter se inserta detrás del runtime existente, no a su lado.

7.  No tocar Operations ni Alarms más allá del cableado mínimo del flag y, si es necesario, la creación/elección del adapter.

8.  No tocar Client Portal.

9.  No implementar MQTT, Modbus, OPC-UA, PLC, Node-RED ni ThingsBoard en el frontend.

10. Documentar el resultado en docs/architecture (un breve F2D_RESULT.md con qué se construyó y cómo se prueba).

## 14. Qué NO Debe Hacer F2D

11. No conectar MQTT desde el frontend.

12. No conectar Modbus desde el frontend.

13. No conectar OPC-UA desde el frontend.

14. No conectar PLC desde el frontend.

15. No conectar Node-RED directo.

16. No conectar ThingsBoard directo.

17. No conectar Gateway Stick directo.

18. No meter umbrales efectivos en Units.

19. No crear umbrales globales de operación.

20. No poner lógica de alarmas en JSX.

21. No reescribir Operations.

22. No reescribir Alarms.

23. No meter alarmas en Client Portal.

24. No crear un segundo telemetry store paralelo.

25. No crear un segundo runtime paralelo.

26. No romper la identidad estable que exige useSyncExternalStore (ver sección 7).

## 15. Riesgos Técnicos antes de F2D

- **Duplicación de adapters.** Si F2D no respeta el ref-count del runtime, un montaje doble durante Strict Mode genera dos conexiones WebSocket.

- **Mezcla de simulador y backend real.** Si el feature flag no es exclusivo, ambos pueden coexistir y producir lecturas contradictorias.

- **Ruptura del singleton runtime.** Importar el runtime por una ruta distinta crea otra instancia en memoria. Importar siempre desde el mismo módulo.

- **Re-introducción de bucles de useSyncExternalStore.** Cualquier cambio en hooks puede romper la identidad estable y reintroducir los errores de F2B.

- **Acoplamiento de UI al adapter.** Si Operations o Alarms importan el adapter, la migración futura se vuelve imposible. Solo el runtime conoce el adapter.

- **Filtración de alarmas al Client Portal.** Cualquier hook compartido por error podría arrastrar alarmas internas a la vista del cliente. Mantener las dos aplicaciones lógicamente separadas.

- **Pérdida de trazabilidad del snapshot.** Si en F2D se evalúa contra otra fuente “porque es más fácil”, se viola ADR-005 y se rompe la integridad histórica para reportes.

- **Convertir Units en live Operations.** Tentación recurrente. Units es catálogo y defaults; jamás runtime.

- **Meter protocolos industriales en el browser.** La tentación más peligrosa. Cero excepciones.

## 16. Checklist antes de Iniciar F2D

27. git status limpio en la rama base; v0.5-alarm-center-integration en HEAD.

28. Operations abre limpio (sin errores en consola, sin warnings de hooks).

29. Alarms abre limpio (sin loops, sin advertencias de useSyncExternalStore).

30. Client Portal NO muestra alarmas internas.

31. Suite de tests pasa (Vitest verde).

32. Build de producción pasa.

33. Runtime compartido documentado y entendido por el equipo.

34. Hooks revisados frente a la tabla de la sección 7.

35. Interfaz NormalizedTelemetryAdapter revisada y congelada.

36. ADR-005 visible y leído por Claude Code antes de cualquier prompt.

37. Sin cambios pendientes en Client Portal, Units ni Settings.

## 17. Checklist para Validar F2D cuando se Implemente

38. SimulatedAdapter sigue funcionando exactamente como antes (no se desactiva al introducir el backend adapter).

39. BackendWebSocketAdapter puede montarse sin cambios en Operations ni Alarms.

40. Operations funciona con el adapter seleccionado por flag.

41. Alarms funciona con el adapter seleccionado por flag.

42. Sin loops de React, sin warnings de useSyncExternalStore.

43. Sin hydration mismatch (SSR determinista).

44. Sin protocolos industriales en el frontend (no aparece import de mqtt, modbus, opcua, etc.).

45. Contract tests entre simulador y backend adapter pasan.

46. Fallback automático al simulador si el backend no está disponible (configurable).

47. Reconexión no duplica intervals (verificable con conteo de listeners).

48. Client Portal sigue sin mostrar alarmas internas.

## 18. Decisión Recomendada

- **F2A–F2C están funcionales y tagueadas.** Hay base sólida para avanzar.

- **Se recomienda una estabilización corta F2C.5 (este documento + revisión).** Sin código nuevo: solo asegurar que el runtime, los hooks y el contrato del adapter estén comprendidos y consistentes.

- **F2D debe limitarse a BackendWebSocketAdapter y normalized stream boundary.** Nada más. Sin cambios de UI, sin nuevos protocolos, sin nuevos stores.

- **La frontera del navegador sigue inviolable.** Si surge presión para acortar caminos (“es más fácil si el frontend habla MQTT”), la respuesta es no, siempre.

## 19. Anexo A — Resumen para Claude Code antes de F2D

Checklist que Claude Code debe leer y respetar antes de cualquier acción en F2D:

49. Leer ADR-005 íntegro.

50. Leer este documento (F2 Runtime Integration Notes v1.0).

51. Leer el documento principal F2 — Arquitectura de Telemetría en Tiempo Real.

52. No tocar Client Portal.

53. No tocar Units.

54. No tocar Settings.

55. No conectar protocolos industriales en el frontend (MQTT, Modbus, OPC-UA, PLC, Node-RED, ThingsBoard, Gateway Stick, Historian).

56. No duplicar el runtime existente. Una sola instancia compartida.

57. No romper la identidad estable de los hooks de useSyncExternalStore.

58. Implementar solo el límite del adapter: BackendWebSocketTelemetryAdapter conforme a NormalizedTelemetryAdapter.

59. Mantener el simulador funcional y por defecto hasta que el backend esté listo.

60. Entregar F2D_RESULT.md con: archivos creados/modificados, decisiones, cómo probar, y verificación de los checklists 16 y 17 de este documento.

## 20. Anexo B — Glosario

| **Término**                         | **Definición**                                                                                              |
|-------------------------------------|-------------------------------------------------------------------------------------------------------------|
| NormalizedTelemetryAdapter          | Interfaz única que el frontend conoce para recibir el stream del backend; implementaciones intercambiables. |
| SimulatedNormalizedTelemetryAdapter | Implementación de F2A/F2B/F2C que emite mensajes con la misma forma que tendrá el backend real.             |
| BackendWebSocketTelemetryAdapter    | Implementación de F2D que conecta al backend real por WebSocket, respetando el mismo contrato.              |
| TelemetryStore                      | Almacén fuera de React que recibe del adapter y expone selectores a los hooks.                              |
| Ring Buffer                         | Memoria circular de tamaño fijo por (jobId, tag) para último valor y ventana corta.                         |
| ActiveJobSnapshot                   | Vista de runtime del trabajo activo: identidad + su snapshot congelado.                                     |
| CommissioningSnapshot               | Foto inmutable de la configuración del equipo y umbrales del pozo al comisionar.                            |
| CanonicalTag                        | Nombre oficial y fijo de una variable (p_inlet, q_gas, etc.).                                               |
| AlarmEvaluator                      | Función pura que compara una lectura contra los umbrales del snapshot.                                      |
| StaleDetector                       | Lógica que clasifica cada tag como live / delayed / stale / offline.                                        |
| AlarmCenterSnapshot                 | Vista derivada y memoizada de las alarmas activas, reconocidas y resueltas.                                 |
| Client Portal Read Model            | Vista filtrada de producción (futura) servida por el backend al portal del cliente; sin alarmas internas.   |

*
