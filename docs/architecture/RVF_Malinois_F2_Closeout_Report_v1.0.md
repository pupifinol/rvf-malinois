# RVF Malinois — F2 Closeout Report v1.0

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

## 1. Propósito del Documento

Este documento cierra formalmente la Fase F2 del proyecto RVF Malinois. Resume qué se construyó entre las sub-fases F2A y F2D, qué quedó validado, qué quedó pendiente, qué decisiones de arquitectura quedaron firmes, qué riesgos siguen abiertos y cuál es la siguiente fase recomendada.

**Lo que este documento NO es.** No reemplaza los ADR (especialmente ADR-005), ni el documento principal F2 — Arquitectura de Telemetría en Tiempo Real, ni las F2 Runtime Integration Notes, ni el F2D_RESULT. Es un reporte de cierre y transición; no introduce decisiones nuevas y no propone cambios de implementación más allá de recomendaciones expresamente marcadas como futuras.

**Audiencias.** El equipo técnico de RVF, Claude Code para su trabajo en fases siguientes, auditoría interna del proyecto y, en lo procedente, los clientes (Repsol y futuros) para sustentar trazabilidad.

## 2. Resumen Ejecutivo

F2 llevó a RVF Malinois de una interfaz estática/mock a una consola con arquitectura real de telemetría. La plataforma hoy tiene una columna vertebral de tiempo real que respeta la frontera definida en ADR-005 y deja preparada la conexión al backend cuando esté listo.

- **De UI mock a consola con runtime real.** Existe un store fuera de React con ring buffer por trabajo/tag, evaluador de alarmas como lógica pura, detector stale/offline y hooks livianos.

- **Operations consume datos vivos.** KPIs, tendencias, contexto del trabajo activo, estado de comunicación honesto, indicador de alarma; toda la lógica vive en el runtime, no en JSX.

- **Alarms consume eventos vivos.** Centro de alarmas con ciclo de vida active / acknowledged / cleared, separación de proceso, calidad de dato y comunicación.

- **WebSocket adapter preparado.** F2D introdujo BackendWebSocketTelemetryAdapter detrás del mismo contrato del simulador. La sustitución por el backend real será un cambio quirúrgico, no una reescritura.

- **Client Portal aislado.** Read-only de producción (crudo, gas, corte de agua); sin alarmas internas, sin diagnósticos, sin protocolos.

- **Units como catálogo, Settings como global.** Mantienen su rol. Units no se convirtió en Operations; Settings no se convirtió en fuente de umbrales operativos.

- **Cero protocolos industriales en el navegador.** Ni MQTT, ni Modbus, ni OPC-UA, ni PLC, ni Node-RED, ni ThingsBoard, ni Gateway Stick, ni Historian. Inviolable.

## 3. Alcance de F2

Lo que SÍ entró en F2

- Telemetría simulada normalizada (contrato del backend, no del dispositivo).

- TelemetryStore frontend con ring buffer por (jobId, tag).

- Operations conectada al runtime (live values, contexto del trabajo, tendencias, stale/offline).

- Alarms conectada al mismo runtime (events derivados, ack local, lifecycle).

- Adapter boundary: NormalizedTelemetryAdapter con SimulatedAdapter (default) y BackendWebSocketTelemetryAdapter (placeholder).

- AlarmEvaluator como lógica pura contra CommissioningSnapshot.

- Stale/Offline detector con tiempos por defecto.

- Runtime compartido (ref-counted, idempotente, Strict Mode/HMR safe).

- Client Portal UI read-only para producción.

Lo que NO entró en F2

- Backend real (la API que servirá WebSocket y REST).

- Base de datos real (PostgreSQL/TimescaleDB del modelo de dominio).

- Protocolos industriales en frontend (MQTT, Modbus, OPC-UA, PLC, etc.) — explícitamente prohibidos.

- Ingestión real desde campo (Gateway Stick, Node-RED, ThingsBoard).

- Persistencia de alarmas (acknowledge/cleared vive en memoria por ahora).

- Reportes históricos reales (la UI de Reports sigue mock).

- Autenticación, roles y multi-tenant final.

- Client Portal con data API real (read-model filtrado por backend).

## 4. Estado por Fase

| **Fase**                          | **Tag**                        | **Estado** | **Entrega principal**                                                     | **Validación**                      |
|-----------------------------------|--------------------------------|------------|---------------------------------------------------------------------------|-------------------------------------|
| v0.2 — Settings/Units Freeze      | v0.2-settings-units-freeze     | Congelada  | Settings y Units como baseline previa a F2                                | Visual + funcional, sin regresiones |
| F2A — Telemetry Domain Foundation | v0.3-telemetry-foundation      | Entregada  | Modelos, simulator adapter, store, evaluator, stale, hooks, tests         | Unit tests + script demo            |
| F2B — Live Operations UI          | v0.4-live-operations-ui        | Entregada  | Operations consume live values/alarm/stale/comm; trends desde ring buffer | Smoke visual + tests de hooks       |
| F2C — Alarm Center Integration    | v0.5-alarm-center-integration  | Entregada  | Alarms consume runtime; lifecycle ack/cleared; summary                    | Smoke + tests de regresión          |
| F2D — Backend WebSocket Adapter   | v0.6-backend-websocket-adapter | Entregada  | Adapter WS, factory, env switch, reconnect/heartbeat, contract tests      | Contract tests sim↔WS               |

## 5. Arquitectura Final después de F2

Al cierre de F2, la arquitectura runtime del frontend queda así:

```
ARQUITECTURA F2 (estado al cierre)
SimulatedNormalizedTelemetryAdapter (default; F2A/B/C/D)
|
| BackendWebSocketTelemetryAdapter (F2D; selectable)
| |
+-------------+
| seleccionado por adapterFactory(env)
v
Shared Telemetry Runtime (ref-counted, idempotente)
|
v
TelemetryStore (fuera de React)
· ring buffer por (jobId, tag canónico)
· selectores finos
|
+-----------+------------+--------------------+
v v v
AlarmEvaluator StaleDetector Selectors planos
| | |
+-----------+------------+--------------------+
v
Hooks (useLiveValue, useAlarmState, useAlarmCenter,
useConnectionStatus, useActiveJobSnapshot, ...)
|
+-----------+----------------+
v v
Operations UI Alarms UI
Client Portal (read-only) — NO conectado a este runtime de alarmas
```

## 6. Normalized Telemetry Boundary

La frontera más importante de toda F2 es el contrato del stream normalizado. Es la línea que el navegador no cruza, y es la línea que el backend respetará cuando entregue datos reales.

- **Qué significa normalized.** Mensajes con forma canónica (reading, frame, alarm, heartbeat, connection) cuyo significado es independiente del origen físico. El navegador no conoce sensores, registros Modbus, ni protocolos.

- **Por qué es la frontera correcta.** Aísla el frontend de la complejidad industrial, hace que el adapter sea el único punto de cambio entre simulación y producción, y respeta ADR-005 al pie de la letra.

- **Contrato compartido por simulador y WebSocket adapter.** Ambos implementan NormalizedTelemetryAdapter; los contract tests de F2D verifican que la forma y secuencia son idénticas.

- **Cómo F2D habilita la sustitución sin tocar UI.** adapterFactory elige por env. Cambiar el flag de “simulated” a “backend” no toca Operations, Alarms, hooks ni el store; solo el adapter.

- **Por qué el frontend no conoce MQTT/Modbus/OPC-UA.** Esos protocolos viven en edge/backend. El navegador no debe —ni puede— hablarlos. F2 lo respetó al 100 %.

## 7. Runtime Compartido

- **Singleton ref-counted.** Una sola instancia compartida por Operations y Alarms. start() y stop() llevan referencia; el último stop() apaga el adapter.

- **Idempotencia.** Strict Mode de React 19 monta-desmonta-monta; el runtime no crea adapters duplicados ni acumula listeners.

- **HMR-safe.** El Hot Module Replacement de Next.js no genera intervalos ni adapters huérfanos.

- **Simulator default.** Mientras el backend no esté listo, el simulador es el adapter activo por configuración.

- **Adapter factory como punto único de cambio.** La elección entre simulator y backend ocurre en un solo lugar; el resto del runtime no se entera.

## 8. TelemetryStore, Ring Buffer y Hooks

- **Store fuera de React.** Las suscripciones viven en un módulo plano. Los componentes acceden vía useSyncExternalStore.

- **Ring buffer por (jobId, tag).** Tamaño fijo; último valor + ventana corta para sparklines. Sin crecimiento ilimitado.

- **useSyncExternalStore con disciplina React 19.** Identidad estable, snapshots cacheados, sin Date.now() en getSnapshot, empty constants módulo-level.

- **Lecciones aprendidas.** Documentadas en las F2 Runtime Integration Notes; este documento las consolida en la tabla siguiente.

| **Patrón**                               | **Problema que evita**                                     | **Aplicación**                               |
|------------------------------------------|------------------------------------------------------------|----------------------------------------------|
| EMPTY_* singleton congelado            | “getServerSnapshot should be cached”, identity churn       | Empty arrays, empty objects, empty snapshots |
| useRef cache + igualdad estructural      | “getSnapshot should be cached”, re-render por nuevo objeto | Selectores y derive*() de hooks             |
| subscribe memoizado / módulo-level       | “Maximum update depth exceeded”                            | Cualquier useSyncExternalStore hook          |
| Inputs estables (módulo-level o useMemo) | Re-creación de array de jobs/tags                          | Pasar listas estables al hook                |
| useNowTick + SSR seed                    | Hydration mismatch en relojes                              | Topbar clock, banners de tiempo              |
| No Date.now() en getSnapshot             | No determinismo en snapshot                                | Cualquier hook que dependa de tiempo         |
| Buffer toArray() con cache por seq       | Array nuevo en cada lectura                                | useHistoryBuffer y sparklines                |
| Snapshot derivation memoizada            | Recompute por hook call                                    | useAlarmCenter, useUnitTelemetrySnapshot     |

## 9. Active Job / Commissioning Snapshot

ADR-005 lo establece y F2 lo respetó: los umbrales efectivos viven en el CommissioningSnapshot del trabajo activo. Esta es la línea que separa una plataforma trazable de una rígida.

- **Thresholds efectivos en el snapshot.** warningLow/High y alarmLow/High por tag canónico vienen del snapshot, congelados al comisionar.

- **Units solo aporta defaults sugeridos.** Capacidades nominales, rangos de diseño, ratings; jamás la fuente final para evaluar alarmas en vivo.

- **Operations y Alarms evalúan contra el snapshot.** No contra Settings, no contra defaults del catálogo, no contra valores hardcoded.

- **Reports futuro reconstruirá histórico usando snapshot.** Cualquier alarma del pasado se interpreta con los umbrales que estaban vigentes ese día.

- **Client Portal recibirá read-model filtrado.** Producción derivada del backend, sin alarmas internas.

> **Compromiso histórico.** Esta regla es lo que protege la trazabilidad frente a clientes como Repsol o Chevron: un reporte entregado se lee hoy igual que el día en que se generó, aunque el catálogo se edite después. F2 dejó esta integridad funcionando.

## 10. Operations — Estado al Cierre F2

- **KPIs vivos.** Cada KpiTile usa useLiveValue(jobId, tag); solo el tile del tag que cambia se re-renderiza.

- **Active job context visible.** Pozo, equipo, comisionamiento, hora de inicio mostrados en todo momento.

- **Tendencias desde el ring buffer.** Sparklines y mini-trends leen del buffer; el gráfico no se recrea por dato.

- **Communication status honesto.** El banner refleja la realidad del adapter (live / reconnecting / disconnected); nada de “siempre verde”.

- **Header alarm indicator conectado.** Ya no muestra falsamente “No active alarms” cuando hay alarmas en el centro.

- **Unit #3 OFFLINE cuando no levanta data.** Caso visual corregido: si no hay telemetría, la unidad se muestra OFFLINE, no en TESTING.

- **Cero lógica de telemetría en JSX.** Los componentes solo consumen hooks; no evalúan, no calculan stale, no leen Units, no conocen el adapter.

## 11. Alarms — Estado al Cierre F2

- **Alarm Center vivo.** Lista de eventos derivados del store con conteos por prioridad.

- **LiveAlarmEvents derivados.** Cada cambio de AlarmEvaluationResult engendra o cierra eventos del centro.

- **Lifecycle active / acknowledged / cleared.** Estado derivado, no inventado en la UI.

- **Acknowledge local en memoria.** En F2C el ack vive en el cliente; persistencia llegará con backend real.

- **Separación process / data quality / communication.** Tres categorías distintas en conteo y en presentación.

- **Sin persistencia backend todavía.** Un refresh hoy reinicia los ack/cleared; pendiente para F3.

- **Uso interno RVF solamente.** Jamás expuesto al Client Portal.

## 12. Client Portal — Estado al Cierre F2

- **Read-only y client-facing.** Vista sobria para el cliente final, separada lógicamente de Operations y Alarms.

- **Production overview.** Producción de crudo, gas y corte de agua; tendencias de producción; metadatos del trabajo.

- **Selector de pozo.** Cuando el cliente tiene varios pozos, puede elegir cuál ver.

- **Sin alarmas internas.** No muestra Alarm Center.

- **Sin diagnósticos internos.** No muestra estado de protocolos ni nombres de tecnología (Node-RED, ThingsBoard, MQTT, Modbus, Gateway, PLC).

- **Pendiente read-model real desde backend.** Hoy es UI; el read-model filtrado lo entregará F3/F6.

## 13. Units, Sensors, Reports y Settings

| **Pantalla** | **Rol al cierre F2**                                                                                                   | **Estado**                                               | **Pendiente**                                                   |
|--------------|------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------|-----------------------------------------------------------------|
| Units        | Catálogo de equipos: identidad, capacidades nominales, sensores disponibles, defaults sugeridos, preparación de fuente | Funcional (freeze v0.2 respetado); no es Operations live | Edición de defaults sugeridos, vínculo con commissioning real   |
| Sensors      | Inventario / salud por equipo                                                                                          | Mock/static por ahora                                    | Salud real (batería, RF, saltos) cuando exista backend          |
| Reports      | Reportes operativos / auditoría                                                                                        | UI mock/static                                           | Histórico real con snapshot por trabajo y trazabilidad          |
| Settings     | Preferencias globales de la plataforma                                                                                 | Funcional (freeze v0.2)                                  | Auth/roles/tenant, no thresholds efectivos por unidad o trabajo |

## 14. Validaciones Realizadas durante F2

| **Validación**                                    | **Resultado esperado**              | **Estado** |
|---------------------------------------------------|-------------------------------------|------------|
| Lint                                              | Sin errores; warnings controlados   | OK         |
| Typecheck (TypeScript strict)                     | Sin errores de tipo                 | OK         |
| Tests unitarios (evaluator, detector, hooks)      | Verde                               | OK         |
| Build de producción                               | Compila sin errores                 | OK         |
| Smoke tests visuales (Operations, Alarms, Portal) | Sin regresiones visuales            | OK         |
| No alarmas internas en Client Portal              | Cero presencia                      | OK         |
| No protocolos industriales en frontend            | Cero imports de mqtt/modbus/opcua   | OK         |
| Contract tests Sim ↔ WS adapter                   | Mismo contrato y secuencia          | OK (F2D)   |
| Strict Mode / HMR (dev)                           | Sin adapters duplicados ni warnings | OK         |
| Identidad estable en useSyncExternalStore         | Sin warnings de cache/loops         | OK         |

## 15. Errores Importantes Detectados y Corregidos

| **Error**                             | **Fase** | **Causa**                                 | **Corrección**                          | **Lección**                                 |
|---------------------------------------|----------|-------------------------------------------|-----------------------------------------|---------------------------------------------|
| Hydration mismatch Topbar             | F2B      | Date.now() en render del servidor         | useNowTick con SSR fixed seed           | SSR debe ser determinista                   |
| getServerSnapshot should be cached    | F2B      | Objetos nuevos en cada llamada            | EMPTY_SNAPSHOT módulo-level             | Empty snapshots singleton congelados        |
| getSnapshot should be cached          | F2B      | Reconstrucción de snapshot cada call      | useRef cache + igualdad estructural     | Misma entrada → misma referencia            |
| Maximum update depth exceeded         | F2B/F2C  | subscribe no estable, identidad cambiante | subscribe memoizado / módulo-level      | Toda dep de useSyncExternalStore es estable |
| useAlarmCenter identity loop          | F2C      | deriveAlarmCenterSnapshot recompute       | Cache estructural + EMPTY singleton     | Derivación memoizada por inputs             |
| Unit #3 TESTING estando OFFLINE      | F2B      | Falta de fallback al ausencia de stream   | Reflejar OFFLINE si no hay data del job | Honestidad sobre el estado real             |
| Header “No active alarms” con alarmas | F2B      | Indicador no conectado al store           | Cableado al AlarmCenter derivado        | Una sola fuente de verdad en todo el UI     |

## 16. Decisiones Arquitectónicas Confirmadas

1.  El frontend solo consume el stream normalizado del backend (WebSocket + REST).

2.  Ningún protocolo industrial (MQTT, Modbus, OPC-UA, PLC, Node-RED, ThingsBoard, Gateway Stick, Historian) puede vivir en el navegador.

3.  Los umbrales efectivos provienen del CommissioningSnapshot del trabajo activo; Units es catálogo de defaults.

4.  El store de telemetría vive fuera de React; los componentes solo consumen hooks.

5.  La UI no contiene lógica de alarmas, stale ni evaluación de calidad; todo es módulo puro consumido por hooks.

6.  El Client Portal nunca expone alarmas internas ni diagnósticos; es vista de producción.

7.  Units no es Operations live; mantenerlos separados es regla, no preferencia.

8.  El simulador es el adapter default; el backend adapter se elige por configuración cuando el backend exista.

9.  adapterFactory es el único punto de cambio entre simulador y backend; aguas arriba no se entera.

## 17. Lo que Queda Pendiente después de F2

Pendiente técnico

- Backend real (servicio que sirva WebSocket + REST normalizado).

- REST/API para snapshots, configuración, historial y reportes.

- WebSocket real conectado y verificado contra el adapter de F2D.

- Persistencia de alarmas (estado y ciclo de vida acknowledge/cleared).

- Reportes históricos reales con reconstrucción por snapshot.

- Catch-up real al reconectar (no solo placeholder).

- Autenticación y roles definitivos.

- Multi-tenant real con aislamiento a nivel de fila.

- Audit trail inmutable de operaciones (acknowledge, ediciones, comisionamiento).

Pendiente producto / UI

- Reports reales (hoy mock/static).

- Sensors reales (salud y batería desde backend).

- Client Portal con read-model alimentado por backend.

- Unit deployment status real (comisionamiento ligado a Units).

- Alarm trend 24h real (con histórico).

- Identidad de operador real para acknowledge (hoy es local).

## 18. Riesgos Abiertos

- **Duplicación de runtime al conectar el backend real.** Si se importa el runtime por una ruta distinta, se crea otra instancia. Importar siempre desde el mismo módulo.

- **Romper la identidad de useSyncExternalStore.** Cualquier hook nuevo o refactor puede reintroducir los errores de F2B. Validar contra la tabla de patrones de la sección 8.

- **Confundir Units con Operations.** Tentación recurrente al evolucionar la UI. Units es catálogo; jamás runtime.

- **Exponer alarmas al Client Portal.** Un hook compartido por error puede filtrar alarmas internas. Mantener las dos aplicaciones lógicamente separadas.

- **Conectar protocolos industriales directo.** Tentación al ver presión de plazos. Cero excepciones.

- **Perder trazabilidad de snapshots.** Si Reports o Alarms evalúan contra fuente distinta del snapshot del trabajo, se rompe la integridad histórica.

- **Mezclar simulator y backend sin control.** El feature flag debe ser exclusivo; el fallback debe ser explícito.

- **No persistir acknowledge/cleared.** Hasta F3 los ack son volátiles; comunicar el comportamiento al equipo operativo.

- **Reports sin snapshot histórico.** Si Reports llega antes que el modelo de snapshot histórico, hay que evitar evaluar reportes contra el catálogo actual.

## 19. Recomendación de Siguiente Fase

**Recomendación.** F3 — Backend / API Foundation.

F3 debe crear la base backend que alimentará el WebSocket normalizado y los endpoints REST que el frontend ya espera. La frontera ya está negociada (la del simulador), y el adapter de F2D ya está esperando del otro lado: F3 es ponerle al adapter un servidor real al cual hablarle.

Objetivos de F3

- Servicio backend con WebSocket normalizado que cumpla el mismo contrato que el simulador.

- REST endpoints para active jobs, commissioning snapshots, telemetry read model, alarm persistence, reports/audit history y client portal read model.

- Persistencia (PostgreSQL para catálogo y operación; TimescaleDB para telemetría).

- Adapter de F2D apuntando al backend real y verificando contract tests.

- **Por qué F3 antes de sofisticar UI.** Avanzar más Operations/Alarms/Reports en frontend sin backend real construye sobre suposiciones; con F3 cada nueva característica de UI tendrá datos reales detrás.

- **Por qué F6 (Client Portal real) debe esperar.** El read-model del cliente depende de cómo F3 modele jobs/snapshots y cómo F5 estructure historial. Saltarse a F6 sin F3/F5 obliga a rehacer la integración después.

## 20. Propuesta de Roadmap después de F2

- **F3 — Backend / API Foundation.** Servicio backend, PostgreSQL/TimescaleDB, REST + WebSocket normalizado, contract tests del adapter contra el backend real, autenticación básica.

- **F4 — Field Ingestion Planning / Edge Integration.** Diseño e integración de la cadena real (Gateway Stick → Node-RED → MQTT/ThingsBoard → backend). Vive en edge/backend; el frontend no se entera.

- **F5 — Reports & Audit Trail.** Reportes históricos con reconstrucción por snapshot, registro inmutable de acciones operativas, exportación a PDF/Excel.

- **F6 — Client Portal Real Read Model.** Read-model filtrado de producción servido por backend; portal cliente consumiendo datos reales y separados.

- **F7 — Auth / Roles / Tenant Hardening.** SSO empresarial, RBAC final, multi-tenant con row-level security, alcance derivado del servidor.

- **F8 — Production Deployment Hardening.** Despliegue autoalojado, observabilidad (errores y métricas), backups, capacity planning, manual de operación.

## 21. Checklist de Cierre F2

10. Repositorio limpio (sin cambios pendientes en main; ramas integradas o documentadas).

11. Tags creados: v0.2, v0.3, v0.4, v0.5, v0.6.

12. Documentación de arquitectura actualizada (ADR adenda v1.3; F2 principal; F2 Runtime Integration Notes; F2D_RESULT).

13. Operations abre sin errores en consola.

14. Alarms abre sin loops ni advertencias de hooks.

15. Client Portal abre y NO muestra alarmas internas.

16. Units no fue convertido en live operations.

17. Settings sigue siendo configuración global (sin thresholds efectivos).

18. Tests pasan (unit + smoke + contract).

19. Build de producción pasa.

20. Sin imports de protocolos industriales en frontend.

21. ADR-005 respetado en todo el árbol de código.

## 22. Checklist antes de Iniciar F3

22. Leer ADR-005 íntegro.

23. Leer este F2 Closeout Report.

24. Leer las F2 Runtime Integration Notes.

25. No tocar UI innecesariamente (F3 es backend, no UI).

26. Definir las fronteras del backend (servicios y responsabilidades).

27. Definir contratos de API (REST + WebSocket normalizado, exactos al simulador).

28. Definir el modelo de persistencia (PostgreSQL + TimescaleDB conforme al Modelo de Dominio).

29. Definir el ciclo de vida del Active Job (creación, comisionamiento, cierre).

30. Definir la persistencia de alarmas (estado, ack, cleared, auditoría).

31. Definir el modelo de snapshot histórico para Reports y Audit Trail.

32. Definir el read-model del Client Portal (campos permitidos; alarmas excluidas).

## 23. Decisión Final de Cierre

- **F2 queda funcionalmente cerrada.** Las cinco sub-fases (freeze v0.2, F2A, F2B, F2C, F2D) están entregadas y validadas.

- **F2 estableció el runtime y la frontera de telemetría.** Store fuera de React, ring buffer, evaluador, detector stale, hooks, adapter boundary.

- **F2 dejó Operations y Alarms vivos.** Consumiendo el mismo runtime, con la disciplina de estabilidad React 19.

- **F2 dejó Client Portal separado.** Sin alarmas, sin diagnósticos, sin protocolos.

- **F2D dejó preparada la frontera WebSocket.** El backend real conecta sin tocar UI.

- **La siguiente fase recomendada es F3 — Backend / API Foundation.** Sin F3, ninguna fase posterior tiene datos reales sobre los cuales construir.

## 24. Anexo A — Inventario de Documentos Relacionados

| **Documento**                                            | **Tipo**               | **Rol en el expediente**                                                |
|----------------------------------------------------------|------------------------|-------------------------------------------------------------------------|
| RVF_Malinois_Adenda_Arquitectura_ADR_001_005_v1.3        | Registro de decisiones | ADR-001 a ADR-005; reglas firmes del proyecto                           |
| RVF_Malinois_F2_Arquitectura_Telemetria_Tiempo_Real_v1.0 | Arquitectura           | Documento principal de F2 (12 puntos + F2A–F2D)                         |
| RVF_Malinois_F2_Runtime_Integration_Notes_v1.0           | Nota técnica           | Estado runtime entre F2C y F2D + lecciones de hooks                     |
| RVF_Malinois_F2D_RESULT                                  | Resultado de fase      | Entrega de F2D (BackendWebSocketAdapter)                                |
| RVF_Malinois_F2_Closeout_Report_v1.0                     | Cierre de fase         | Este documento; cierre formal de F2 y transición a F3                   |
| RVF_Malinois_Modelo_Dominio (y los 5 fundacionales)      | Fundacionales          | Modelo de dominio, UX, sistema de diseño, ingeniería, fundación técnica |

## 25. Anexo B — Glosario

| **Término**                         | **Definición**                                                                      |
|-------------------------------------|-------------------------------------------------------------------------------------|
| F2A                                 | Telemetry Domain Foundation (modelos, simulator, store, evaluator, detector, hooks) |
| F2B                                 | Live Operations UI (Operations consumiendo el runtime)                              |
| F2C                                 | Alarm Center Integration (Alarms consumiendo el mismo runtime)                      |
| F2D                                 | Backend WebSocket Adapter Boundary (adapter intercambiable, factory)                |
| NormalizedTelemetryAdapter          | Interfaz única que el frontend conoce; implementaciones intercambiables             |
| SimulatedNormalizedTelemetryAdapter | Implementación de F2A/B/C/D que emite el contrato del backend                       |
| BackendWebSocketTelemetryAdapter    | Implementación de F2D que conectará al backend real cuando exista                   |
| TelemetryStore                      | Almacén fuera de React; recibe del adapter, expone selectores                       |
| RingBuffer                          | Memoria circular por (jobId, tag) con último valor + ventana corta                  |
| ActiveJobSnapshot                   | Vista de runtime del trabajo activo (identidad + snapshot congelado)                |
| CommissioningSnapshot               | Foto inmutable de la configuración y umbrales al comisionar                         |
| CanonicalTag                        | Nombre oficial y fijo de una variable (p_inlet, q_gas, etc.)                        |
| AlarmEvaluator                      | Función pura que compara lectura contra umbrales del snapshot                       |
| StaleDetector                       | Clasifica cada tag como live / delayed / stale / offline                            |
| AlarmCenterSnapshot                 | Vista derivada memoizada del estado de alarmas del trabajo activo                   |
| Client Portal Read Model            | Vista filtrada de producción (futura) que el backend servirá al cliente             |
| Runtime Singleton                   | Instancia única del runtime, compartida y ref-counted                               |
| Adapter Factory                     | Punto único donde se decide qué adapter usar (simulator vs backend)                 |

*
