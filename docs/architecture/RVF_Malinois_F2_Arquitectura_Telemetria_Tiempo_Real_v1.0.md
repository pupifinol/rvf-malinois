# RVF Malinois — F2 Arquitectura de Telemetría en Tiempo Real

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

# Parte I — Encuadre

Resumen Ejecutivo

Esta es la especificación de la Fase F2 de RVF Malinois: la arquitectura de telemetría en tiempo real que se construirá debajo de la UI sin romper el freeze v0.2-settings-units-freeze. F2 no implementa todavía ningún protocolo industrial real; en su lugar, introduce los modelos, el store de tiempo real, el simulador y los hooks necesarios para que, cuando el backend RVF esté listo, sustituir el simulador por el WebSocket real sea cambiar un único adaptador.

**Lo que F2 entrega.** La columna vertebral de telemetría del frontend: modelos de dominio (catálogo de unidades, snapshot del trabajo activo, lecturas normalizadas, estados de alarma y conexión), un realtime store fuera de React con ring buffer por (job, tag), un simulador que emite exactamente la forma del stream normalizado del backend, un evaluador de alarmas que usa los umbrales del snapshot del trabajo activo, un detector stale/offline con tiempos por defecto, hooks livianos y un adapter interface preparado para la sustitución futura por WebSocket.

**Lo que F2 NO entrega.** Código de producción todavía; protocolos industriales reales (MQTT, Modbus, OPC-UA, PLC, historiador); rediseño de Settings o Units; umbrales globales de operación; lógica de alarmas dentro de componentes React; conexión del navegador a sistemas de campo.

**Por qué este orden.** F2 sigue el principio del documento de Ingeniería: construir primero la pieza riesgosa (el render en vivo con stream simulado), demostrarla con datos sintéticos creíbles y solo entonces conectar el backend real. Esto elimina el mayor riesgo del proyecto antes de que cueste rehacerlo.

Decisiones Técnicas Principales

1.  La cadena real de telemetría (sensor → Gateway → Node-RED → MQTT → ThingsBoard → backend) vive fuera del navegador y NO se implementa en F2; se queda como futura, en el borde y el backend.

2.  El frontend conoce únicamente un stream normalizado del backend: WebSocket para vivo, REST para histórico/configuración. F2 simula ese stream.

3.  Los umbrales efectivos para evaluar alarmas viven en el snapshot del trabajo activo (ADR-005, regla 1). El catálogo de Units aporta defaults sugeridos; nunca son la fuente final de la evaluación.

4.  Hay un único punto de entrada de datos al frontend: el NormalizedTelemetryAdapter. En F2 su implementación es el simulador; mañana es el cliente WebSocket. La UI no nota la diferencia.

5.  El render se desacopla de la ingesta: los mensajes caen en un ring buffer fuera de React; un tick controlado actualiza solo los componentes suscritos a un tag (coherente con el documento de Ingeniería).

6.  La pantalla Units del freeze mantiene su lugar (catálogo y preparación de fuente); los umbrales se editan y se congelan en el flujo de comisionamiento del trabajo.

7.  La evaluación de alarmas, la detección stale/offline y la lógica de calidad de dato son módulos puros (sin React), testeables, que el frontend consume mediante hooks livianos.

# Parte II — Los Doce Puntos de F2

## 1. Arquitectura General de Telemetría

La arquitectura de telemetría se entiende mejor en tres bandas: lo que queda fuera del navegador (la cadena real, futura), lo que F2 construye como simulación del backend, y lo que F2 construye debajo de la UI.

![Flujo de telemetría F2](./RVF_Malinois_F2_Telemetria_media/media/0139577f4bb178e8c58950d829691b961106811b.png)

*Diagrama — F2: flujo de telemetría y frontera de simulación*

## Componentes y su relación

- **Sensores de campo, Gateway Stick, Node-RED, MQTT/ThingsBoard, Backend RVF.** Cadena real (ADR-001). Vive en el borde y el backend. NO se implementa en F2. El frontend no la conoce.

- **Stream normalizado del Backend RVF.** La única interfaz que el navegador conoce. WebSocket para vivo, REST para histórico/configuración. En F2 lo provee el simulador con la forma exacta del contrato futuro.

- **Frontend Realtime Store.** Memoria circular por (job, tag) fuera de React. Recibe del adapter, alimenta a los hooks. F2 lo construye.

- **Alarm Evaluator.** Compara cada lectura contra los umbrales del snapshot del trabajo activo. F2 lo construye como módulo puro.

- **Stale/Offline Detector.** Marca cada tag como live, delayed, stale u offline. F2 lo construye con tiempos por defecto.

- **Operations UI / Alarms UI.** Las pantallas del freeze. F2 NO las rediseña; las hace consumir los hooks.

- **Reports / Audit.** Quedan futuros. F2 prepara los modelos para que reportes y auditoría reconstruyan históricamente cómo se evaluó cada operación.

## 2. Flujo de Datos

El flujo completo de la telemetría, identificando qué tramo es real y qué tramo es simulado en F2:

```
FLUJO COMPLETO (futuro, real)
Sensor / instrumento (Pressure Scout, Sentinel RTD, Wireless Totalizer)
-> Gateway Stick (Modbus RTU/TCP)
-> Node-RED (mapeo registro -> tag canónico, calidad, store-and-forward)
-> MQTT / ThingsBoard (ingestión)
-> Backend RVF (API + WebSocket gateway, stream NORMALIZADO)
=== FRONTERA DEL NAVEGADOR (ADR-005) ===
-> NormalizedTelemetryAdapter (interfaz única en el frontend)
-> Realtime Store (ring buffer por job+tag, fuera de React)
-> Alarm Evaluator (vs. umbrales del snapshot activo)
-> Stale/Offline Detector
-> Hooks (useLiveValue, useAlarmState, useConnectionStatus)
-> Operations UI / Alarms UI (consumo, sin lógica de telemetría)
-> Reports / Audit Trail (futuros, con datos ya etiquetados)
EN F2 SE SIMULA DESDE AQUI:
Simulador -> NormalizedTelemetryAdapter (impl: SimulatedAdapter)
El resto del flujo aguas abajo se construye TAL COMO QUEDARÁ EN PRODUCCIÓN.
```

## 3. Módulos y Servicios Recomendados

Cada módulo tiene una responsabilidad única y una frontera clara. Esto es lo que permite que el simulador se reemplace por el WebSocket real sin que el resto del sistema lo note.

| **Módulo**                   | **Responsabilidad**                                                            |
|------------------------------|--------------------------------------------------------------------------------|
| telemetry domain models      | Tipos puros: lecturas, frames, calidad, estados. Sin lógica.                   |
| unit catalog model           | Equipo del catálogo: identidad, capacidades, defaults sugeridos.               |
| commissioning snapshot model | Snapshot inmutable del trabajo activo: umbrales, mapeo, límites.               |
| active job snapshot model    | Vista de runtime del trabajo activo + su snapshot (lo que Operations usa).     |
| telemetry stream simulator   | Genera NormalizedTelemetryMessage con perfiles realistas, drift, ruido.        |
| normalized telemetry adapter | Interfaz única que la app consume. Implementaciones intercambiables.           |
| realtime store               | Ring buffer por (job, tag). Recibe del adapter, expone selectores.             |
| alarm evaluator              | Compara lectura contra umbrales del snapshot activo. Calcula estado de alarma. |
| stale/offline detector       | Calcula estado de conexión por tag (live/delayed/stale/offline).               |
| data quality classifier      | Interpreta el atributo quality del mensaje (good/estimated/uncertain/bad).     |
| telemetry hooks              | useLiveValue, useAlarmState, useConnectionStatus. Solo seleccionan.            |
| UI consumption layer         | Componentes del freeze. Consumen hooks; no contienen lógica.                   |
| audit/report integration     | Modelos preparados (datos etiquetados con job, snapshot, calidad).             |

> **Regla de no acoplamiento.** Ningún componente React importa el simulador, el evaluador de alarmas ni el adapter directamente. La UI solo conoce los hooks. Los hooks solo conocen el store. El store solo conoce el adapter. Esa cadena protege la migración futura.

## 4. Estructura Recomendada de Carpetas

Estructura por dominio, no por tipo de archivo. La idea: cada carpeta de lib es un módulo autocontenido y testeable; los hooks son una capa fina; los componentes consumen y no contienen.

```
apps/web/
lib/
telemetry/
models.ts tipos puros (TelemetryReading, etc.)
normalize.ts forma del mensaje normalizado
adapter.ts interfaz NormalizedTelemetryAdapter
adapters/
simulated.ts implementación F2: simulador
websocket.ts implementación futura: WS backend (placeholder)
simulator/
profiles.ts normal/warning/alarm/stale/high-flow/low-press
drift.ts drift natural, ruido, eventos creíbles
connection.ts caídas y recuperación de conexión
realtime/
store.ts ring buffer por (job, tag), fuera de React
selectors.ts selectores finos por tag/job
tick.ts rAF/throttle del render
alarms/
evaluator.ts evalúa lectura vs. snapshot activo
types.ts AlarmEvaluationResult, AlarmState
priority.ts alarm > warning > normal
quality/
classifier.ts good/estimated/uncertain/bad/stale
stale.ts live -> delayed -> stale -> offline
jobs/
activeJob.ts estado de trabajo activo + snapshot
snapshot.ts tipos y carga del snapshot (REST futuro)
catalog/
unit.ts modelos del catálogo de Units (defaults)
hooks/
useLiveValue.ts
useAlarmState.ts
useConnectionStatus.ts
useActiveJobSnapshot.ts
components/operations/ (UI del freeze; consume hooks)
components/alarms/ (UI del freeze; consume hooks)
components/units/ (UI del freeze; catálogo, sin umbrales efectivos)
docs/architecture/ (este documento + ADRs)
```

## 5. Modelos e Interfaces TypeScript Conceptuales

Las interfaces siguientes son conceptuales: definen el contrato del modelo, no la implementación. Los tipos finales pueden refinarse al codificar, pero las fronteras que aquí se establecen son ADR-005 hecho TypeScript.

## Catálogo de Units (defaults sugeridos)

```
interface UnitCatalogItem {
unitId: string // identidad estable del equipo
unitType: 'EMMAD' | 'EMGAD' | string
serial?: string
pidRef?: string // referencia al P&ID (ADR-004)
sensors: UnitSensorDefinition[] // sensores disponibles
nominalRatings?: NominalRatings // capacidades nominales
suggestedDefaults?: EffectiveThresholdSet // SOLO sugeridos, NO efectivos
telemetrySource?: TelemetrySourceMetadata // preparación de fuente
}
interface UnitSensorDefinition {
sensorId: string
sensorType: 'PressureScout' | 'SentinelRTD' | 'WirelessTotalizer' | string
canonicalTag: CanonicalTag // tag canónico al que mapea (ADR-003/004)
pidInstrumentTag?: string // p.ej. 'PIT-003'
modbusRegister?: string // registro en el Gateway Stick
designRange?: { min: number; max: number; unit: string }
}
```

## Snapshot del trabajo activo (umbrales efectivos congelados)

```
interface CommissioningSnapshot {
snapshotId: string
jobId: string
unitId: string // equipo del catálogo desplegado
wellId: string
tenantId: string
takenAt: string // ISO UTC; INMUTABLE desde aquí
sensors: FrozenSensorMapping[] // copia congelada del mapeo
effectiveThresholds: EffectiveThresholdSet // <-- la fuente de verdad
staleTimings?: StaleTimingsOverride // override por tag (opcional)
}
interface FrozenSensorMapping {
sensorId: string
canonicalTag: CanonicalTag
pidInstrumentTag?: string
modbusRegister?: string
enabled: boolean // sensores deshabilitados se ignoran
}
interface EffectiveThresholdSet {
// umbrales por tag canónico — vienen del snapshot, jamás de Units
[canonicalTag: string]: VariableThresholds
}
interface VariableThresholds {
warningLow?: number
warningHigh?: number
alarmLow?: number
alarmHigh?: number
unit: string
precision: number // decimales para mostrar
}
interface ActiveJobSnapshot {
jobId: string
tenantId: string
wellId: string
unitId: string
startedAt: string
closedAt?: string // si está cerrado: inmutable total
snapshot: CommissioningSnapshot // foto congelada al comisionar
}
```

## Stream normalizado, lecturas y calidad

```
type CanonicalTag = string // p.ej. 'p_inlet', 'q_gas'
type DataQuality = 'good' | 'estimated' | 'uncertain' | 'bad'
interface TelemetryReading {
ts: string // ISO UTC (medida en el borde)
jobId: string // <-- llave maestra del modelo
tag: CanonicalTag
value: number | null // null si quality='bad' y se quiere transmitir
unit: string
quality: DataQuality
sensorId?: string // origen físico (trazabilidad ADR-004)
seq?: number // secuencia para detectar pérdidas
}
interface TelemetryFrame {
// varios tags del mismo job en el mismo timestamp (opcional, optimiza red)
ts: string
jobId: string
readings: TelemetryReading[]
}
type NormalizedTelemetryMessage =
| { kind: 'reading'; reading: TelemetryReading }
| { kind: 'frame'; frame: TelemetryFrame }
| { kind: 'alarm'; alarm: AlarmEvent }
| { kind: 'snapshot-update'; snapshot: CommissioningSnapshot } // raro
| { kind: 'heartbeat'; ts: string }
| { kind: 'connection'; status: CommunicationStatus }
```

## Estados, evaluación y conexión

```
type AlarmState =
| 'normal' | 'warning_low' | 'warning_high'
| 'alarm_low' | 'alarm_high' | 'no_data' | 'disabled'
interface AlarmEvaluationResult {
jobId: string
tag: CanonicalTag
state: AlarmState
value: number | null
thresholdHit?: 'warningLow'|'warningHigh'|'alarmLow'|'alarmHigh'
quality: DataQuality
evaluatedAt: string // ISO UTC
thresholdsSource: 'commissioning_snapshot' // siempre — nunca otra cosa
}
type TelemetryStatus = 'live' | 'delayed' | 'stale' | 'offline'
interface StaleState {
jobId: string
tag: CanonicalTag
status: TelemetryStatus
lastTs?: string
ageSec?: number
}
type CommunicationStatus =
| { kind: 'connected'; since: string }
| { kind: 'reconnecting'; lastDataTs?: string }
| { kind: 'disconnected'; lastDataTs?: string }
interface UnitTelemetrySnapshot {
// 'vista actual' que un componente de Operations puede consumir de un golpe
jobId: string
generatedAt: string
byTag: { [tag: string]: { reading?: TelemetryReading; alarm: AlarmState; stale: TelemetryStatus } }
}
```

## 6. Estrategia de Simulación

La simulación debe parecer un stream del backend real, no números aleatorios. Esto se logra combinando tres elementos: perfiles operativos, drift natural y eventos discretos creíbles.

## Perfiles operativos

- **Unidad normal.** Variables centradas dentro de su rango; drift lento; ruido pequeño; calidad good.

- **Unidad en warning.** Una o dos variables rozan los umbrales de advertencia; los demás normales.

- **Unidad en alarm.** Una variable cruza un umbrale de alarma de forma sostenida; calidad good.

- **Unidad offline / stale.** El simulador deja de emitir para esa unidad durante un período; al volver, hace catch-up.

- **Unidad high-pressure / high-flow.** Centrada en la parte alta del rango; útil para probar visualmente la densidad de tendencia.

- **Unidad low/medium-pressure.** Centrada en la parte baja; útil para validar formatos numéricos y precisión por tag.

## Modelo de variación natural

- **Drift gradual.** Caminata aleatoria de baja amplitud sobre una línea base que cambia lento; no salta abruptamente.

- **Ruido pequeño.** Componente gaussiano de varianza acotada al instrumento (mayor en caudal, menor en temperatura).

- **Eventos operacionales creíbles.** Cambio de choke, paro/arranque de prueba: producen escalones realistas en presión/caudal.

- **Calidad degradada esporádica.** De vez en cuando un mensaje llega con quality estimated o uncertain; ocasionalmente bad.

- **Pérdida y recuperación de conexión.** Cortes ocasionales de N segundos; al volver, el simulador emite un evento 'connection' y reanuda.

> **Regla de oro de la simulación.** Cualquiera que mire la pantalla de Operations en F2B debe creer que está viendo un pozo de verdad. Si la simulación se nota “fake”, no sirve para validar la arquitectura. La carga semántica (drift, eventos, calidad, caídas) es más importante que la sofisticación matemática.

## 7. Lógica de Evaluación de Alarmas

La evaluación es una función pura: dada una lectura y los umbrales del snapshot del trabajo activo, devuelve un AlarmEvaluationResult. No tiene estado, no toca React, es trivialmente testeable.

## Reglas firmes

8.  Los umbrales SIEMPRE provienen del CommissioningSnapshot del trabajo activo. Nunca de Settings, nunca de defaults de Units, nunca hardcodeados en la UI.

9.  Prioridad: alarm \> warning \> normal. Si una lectura cruza warningHigh y alarmHigh, gana alarmHigh.

10. Sensores deshabilitados (enabled: false en el snapshot) NO se evalúan; su estado es 'disabled'.

11. Calidad bad o stale: el estado de alarma es 'no_data', no normal. Nunca un dato malo se interpreta como bueno.

12. Alarma de comunicación por (job, tag): si TelemetryStatus es 'offline', se genera una alarma de instrumentación distinta de las de proceso, para no contaminar el centro de alarmas operativas.

13. Estado visual y estado de alarma están separados: el componente UI puede atenuar, parpadear UNA VEZ o pintar; pero el AlarmState es el dato, calculado en el evaluador.

## Pseudocódigo de la evaluación

```
function evaluate(reading, snapshot): AlarmEvaluationResult {
const t = snapshot.effectiveThresholds[reading.tag]
const mapping = snapshot.sensors.find(s => s.canonicalTag === reading.tag)
if (!t || !mapping || !mapping.enabled) return state('disabled', reading)
if (reading.quality === 'bad') return state('no_data', reading)
const v = reading.value
if (v == null) return state('no_data', reading)
if (t.alarmHigh != null && v >= t.alarmHigh) return hit('alarm_high', 'alarmHigh', reading)
if (t.alarmLow != null && v <= t.alarmLow) return hit('alarm_low', 'alarmLow', reading)
if (t.warningHigh != null && v >= t.warningHigh) return hit('warning_high', 'warningHigh', reading)
if (t.warningLow != null && v <= t.warningLow) return hit('warning_low', 'warningLow', reading)
return state('normal', reading)
}
// thresholdsSource: 'commissioning_snapshot' — siempre
```

## 8. Lógica Stale / Offline

Cuatro estados, calculados continuamente por (job, tag) a partir de la edad de la última lectura recibida.

| **Estado** | **Significado**                                | **Default sugerido**      |
|------------|------------------------------------------------|---------------------------|
| live       | Dato reciente; todo bien                       | edad \< delayedAfterSec   |
| delayed    | Dato un poco viejo; la UI lo muestra apagado   | ≥ delayedAfterSec (10 s)  |
| stale      | Sin dato; la UI muestra 'sin reportar hace X'  | ≥ staleAfterSec (30 s)    |
| offline    | Sin dato prolongado; alarma de instrumentación | ≥ offlineAfterSec (120 s) |

- **De dónde vienen los tiempos.** Default global del sistema (los valores sugeridos arriba). Si un snapshot define staleTimingsOverride para un tag, ese override gana. Esto da flexibilidad operativa sin globalizar la configuración.

- **Stale aplica también a heartbeat de conexión.** Si no llega NINGÚN mensaje (ni de un tag concreto, sino heartbeat) por offlineAfterSec, se considera la conexión completa caída y se dispara reconexión.

- **Anti-mentira (ADR del documento de Ingeniería).** Cuando un tag es stale, la UI NUNCA muestra el último valor como si fuera vivo: se muestra atenuado y fechado, o se reemplaza por “sin dato hace X”.

## 9. Estrategia de Integración con la UI

Operations, Alarms y Units consumen telemetría a través de hooks. Los componentes NO contienen lógica de telemetría, NO evalúan alarmas, NO calculan stale, NO conocen el adapter.

## Hooks recomendados

```
useLiveValue(jobId, tag) -> { value, unit, quality, ts, status }
useAlarmState(jobId, tag) -> AlarmEvaluationResult
useConnectionStatus() -> CommunicationStatus
useActiveJobSnapshot() -> ActiveJobSnapshot | null
useUnitTelemetrySnapshot(jobId) -> UnitTelemetrySnapshot
· Cada hook se suscribe SOLO al slice del store que necesita
· Un cambio en una presión re-renderiza únicamente su KpiTile
· Los hooks NO contienen lógica; solo seleccionan
```

## Cómo siguen viviendo Units y Operations

- **Units.** Sigue mostrando el catálogo, los sensores disponibles, las capacidades, los defaults sugeridos y la preparación de la fuente de telemetría. No se rediseña. NO muestra umbrales efectivos.

- **Operations.** Muestra el trabajo activo, los valores vivos, el estado de alarma calculado y el estado stale/offline. Los componentes son tontos: piden el dato al hook y lo dibujan.

- **Alarms (F2C).** Muestra los AlarmEvaluationResult acumulados y permite reconocer (acknowledge) localmente en F2; en backend real lo reconocerá vía API.

- **Reports / Audit (futuro).** Reconstruyen el pasado usando el snapshot del trabajo: cualquier alarma del pasado se interpreta con los umbrales que estaban congelados ese día. Esto es trazabilidad para Repsol.

## 10. Migración Futura al Backend Real

La migración es un cambio quirúrgico: se reemplaza la implementación del NormalizedTelemetryAdapter, y NADA más.

```
// HOY (F2)
const adapter: NormalizedTelemetryAdapter = new SimulatedAdapter(profiles, drift)
// MAÑANA (backend real)
const adapter: NormalizedTelemetryAdapter = new WebSocketAdapter({
url: process.env.BACKEND_WS_URL,
reconnect: exponentialBackoffWithJitter(),
catchUp: (since) => restClient.getCatchUp(since),
heartbeat: 10_000
})
// El resto no cambia:
// - el realtime store
// - el alarm evaluator
// - el stale detector
// - los hooks
// - la UI
// - reports / audit
```

- **Contract tests.** Tests automáticos verifican que ambos adapters cumplen la misma forma del NormalizedTelemetryMessage. Si el backend cambia el contrato, los tests fallan antes que la UI.

- **Qué NO entra en el frontend.** MQTT, Modbus, OPC-UA, PLC, ThingsBoard, Node-RED. Esos viven en el borde/backend; el WebSocketAdapter es el único punto donde el frontend toca el mundo real, y solo habla el contrato normalizado.

## 11. Riesgos y Advertencias de Diseño

Errores que destruyen la arquitectura si no se vigilan desde el primer día:

14. Poner umbrales efectivos en Units. Reabre ADR-005, rompe la trazabilidad histórica y obliga a rehacer Operations.

15. Poner lógica de alarmas dentro de componentes React. Se vuelve imposible testear y se duplica entre pantallas.

16. Conectar el frontend directamente a MQTT/Modbus/OPC-UA. Viola ADR-005 y la frontera del navegador.

17. Hardcodear nombres de tags en componentes. Toda referencia a tags debe ir contra el diccionario canónico (ADR-003).

18. No versionar snapshots por trabajo. Borra la integridad histórica que protege a Repsol.

19. No distinguir catálogo (Units) de trabajo activo (snapshot). Confunde a desarrolladores y operadores.

20. No manejar stale. Mostrar un valor viejo como vivo es el peor error operativo posible.

21. Usar datos random irreales en el simulador. Sin drift ni eventos, no se valida la arquitectura.

22. Mezclar visual state (parpadeo, atenuación) con AlarmState (dato). Romper esa separación rompe la testabilidad.

23. Romper el freeze v0.2-settings-units-freeze tocando Settings o Units. F2 trabaja por debajo, no encima.

24. Implementar protocolos industriales en F2 “por adelantarse”. F2 no es ese momento.

25. Re-renderizar React en cada mensaje (sin ring buffer/tick). Colapso de rendimiento garantizado.

## 12. Fases Recomendadas de Implementación (F2A–F2D)

F2 se construye en cuatro sub-fases seguras. Cada una tiene una entrega verificable, sin tocar las siguientes.

## F2A — Telemetry Domain Foundation

Lo más fundacional: tipos, modelos, snapshot mock, simulador de stream normalizado, realtime store, evaluador de alarmas, detector stale, hooks base. SIN rediseñar UI.

- **Entregables.** Carpetas lib/telemetry, lib/realtime, lib/alarms, lib/quality, lib/jobs, lib/catalog. Tipos completos. SimulatedAdapter funcional. Store con suscripción fina. Evaluador y detector como funciones puras con tests.

- **Verificación.** Tests unitarios de evaluador y detector. Test de “forma” del NormalizedTelemetryMessage. Un script de demostración que muestra mensajes simulados en consola.

## F2B — Live Operations UI

Conectar Operations al store/hook, mostrar el trabajo activo, valores vivos, estado de alarma, stale/offline y última actualización. SIN tocar protocolos reales y SIN romper el freeze.

- **Entregables.** Componentes de Operations consumen useLiveValue/useAlarmState/useConnectionStatus. Banner de conexión. KpiTile con valor, calidad y sparkline.

- **Verificación.** La pantalla muestra perfiles distintos (normal/warning/alarm/stale) según el perfil del simulador. La UI se mantiene calmada en normal y solo el componente afectado se actualiza.

## F2C — Alarm Center Integration

Conectar los AlarmEvaluationResult al centro de alarmas, permitir acknowledge local/simulado, timeline y preparación para audit trail.

- **Entregables.** Listado y detalle de alarmas activas con su origen (tag, valor, umbral). Reconocimiento local con persistencia en memoria. Estructuras listas para auditoría.

- **Verificación.** Una alarma simulada aparece en el centro, se reconoce y queda como acknowledged. Una nueva alarma del mismo tag genera un nuevo evento.

## F2D — Backend Adapter Readiness

Preparar la interfaz para WebSocket real: reconexión, heartbeat, catch-up por REST, backoff, contract tests. SIN conectar a MQTT/Modbus.

- **Entregables.** WebSocketAdapter (placeholder) con la misma interfaz que SimulatedAdapter. Estrategia de reconexión + jitter. Hook de catch-up. Contract tests entre ambos adapters.

- **Verificación.** Sustituir SimulatedAdapter por WebSocketAdapter (apuntando a un mock server local) y demostrar que la UI no nota la diferencia.

# Parte III — Cierre y Entrega

Diagrama Textual del Flujo

```
Reports / Audit (futuro)
^
|
Sensor -> Gateway -> Node-RED -> MQTT/ThingsBoard -> Backend RVF
| stream NORMALIZADO
v
=== FRONTERA DEL NAVEGADOR (ADR-005) ===
|
v
NormalizedTelemetryAdapter
(F2: SimulatedAdapter; futuro: WebSocketAdapter)
|
v
Realtime Store (ring buffer por job+tag)
|
+------------------------------------+--------------------+
v v
Alarm Evaluator (snapshot) Stale/Offline Detector
| |
+-----------+----------+------------+--------------------+
v v v
useAlarmState useLiveValue useConnectionStatus
| | |
v v v
Operations UI · Alarms UI · Units UI (catálogo, defaults)
```

Tabla de Responsabilidades por Módulo

| **Módulo**                     | **F2A**     | **F2B**    | **F2C**        | **F2D**           |
|--------------------------------|-------------|------------|----------------|-------------------|
| Tipos / modelos telemetría     | Crea        | Usa        | Usa            | Usa               |
| UnitCatalogItem / Sensor       | Crea        | Usa        | Usa            | Usa               |
| CommissioningSnapshot          | Crea (mock) | Usa        | Usa            | Usa               |
| SimulatedAdapter               | Crea        | Usa        | Usa            | Comparte interfaz |
| Realtime Store + ring buffer   | Crea        | Usa        | Usa            | Usa               |
| Alarm Evaluator                | Crea        | Usa        | Centro alarmas | Usa               |
| Stale/Offline Detector         | Crea        | Usa        | Usa            | Hereda heartbeat  |
| Hooks (live/alarm/conn)        | Crea        | UI los usa | UI los usa     | Usa               |
| Operations UI                  | —           | Conecta    | —              | —                 |
| Alarms UI                      | —           | —          | Conecta        | —                 |
| WebSocketAdapter (placeholder) | —           | —          | —              | Crea              |
| Contract tests                 | Esqueleto   | —          | —              | Activa            |

Tabla de Qué se Implementa en F2A/B/C/D

| **Capacidad**                        | **F2A** | **F2B** | **F2C** | **F2D** |
|--------------------------------------|---------|---------|---------|---------|
| Tipos y modelos de dominio           | Sí      | —       | —       | —       |
| Simulador de stream normalizado      | Sí      | —       | —       | —       |
| Store de tiempo real + ring buffer   | Sí      | —       | —       | —       |
| Evaluador de alarmas (función pura)  | Sí      | —       | —       | —       |
| Detector stale/offline               | Sí      | —       | —       | —       |
| Hooks frontend                       | Sí      | —       | —       | —       |
| Operations UI conectada al simulador | —       | Sí      | —       | —       |
| Banner de conexión visible           | —       | Sí      | —       | —       |
| Centro de Alarmas conectado          | —       | —       | Sí      | —       |
| Acknowledge local (sin backend)      | —       | —       | Sí      | —       |
| WebSocketAdapter (placeholder)       | —       | —       | —       | Sí      |
| Reconexión, backoff, catch-up        | —       | —       | —       | Sí      |
| Contract tests Sim ↔ WS              | —       | —       | —       | Sí      |
| Conexión a MQTT/Modbus/OPC-UA/PLC    | No      | No      | No      | No      |
| Rediseño de Settings o Units         | No      | No      | No      | No      |

Lista de “No Hacer” para Claude Code

26. No conectar el frontend a MQTT, Modbus, OPC-UA, PLC, historiador, Node-RED ni ThingsBoard.

27. No mover los umbrales efectivos al catálogo de Units; viven en el CommissioningSnapshot.

28. No crear umbrales globales de operación ni colocarlos en Settings.

29. No tocar las pantallas congeladas bajo v0.2-settings-units-freeze (Settings, Units).

30. No poner lógica de telemetría (evaluación, stale, drift) dentro de componentes React.

31. No re-renderizar React en cada mensaje; usar ring buffer + tick controlado.

32. No usar colores hex literales en componentes; usar tokens del sistema de diseño.

33. No hardcodear nombres de tags; usar el diccionario canónico.

34. No mostrar un valor viejo como si fuera vivo; respetar stale.

35. No interpolar huecos de datos en gráficos; dibujar como hueco.

36. No implementar reportes ni IA en F2; preparar el modelo, no más.

37. No saltar fases: F2A debe estar verificada antes de pasar a F2B.

Lista de Supuestos

38. La aplicación es un proyecto Next.js / TypeScript en monorepo pnpm; el freeze v0.2-settings-units-freeze existe en repositorio.

39. Existe (o existirá durante F2A) un CommissioningSnapshot mock cargado en memoria para el desarrollo, con al menos una unidad de cada tipo.

40. El diccionario de tags canónicos está definido a nivel de modelo (puede iniciarse pequeño y crecer).

41. Los tiempos por defecto del detector stale (10 s / 30 s / 120 s) son operativamente razonables y revisables sin rediseño.

42. El backend RVF y su WebSocket no existen aún o no están listos; F2 no depende de ellos.

43. La UI de Settings y Units mantiene su forma actual; F2 no la rediseña.

44. Las pantallas de Operations y Alarms del freeze son aptas para consumir los hooks tal cual; si requieren mínimos ajustes para conectarse al hook, se hacen sin alterar el sistema de diseño.

45. Se respeta el sistema de diseño industrial ya definido (tokens, ISA-101, sin emojis, sin parpadeo continuo).

Borrador del Primer Prompt para Claude Code (F2A)

Borrador, no para enviarse aún. Sirve para ver la forma del prompt que enviaremos cuando se autorice F2A.

```
[BORRADOR — NO ENVIAR TODAVÍA]
Contexto:
Estamos en la Fase F2A — Telemetry Domain Foundation de RVF Malinois.
El expediente vigente es:
- docs/architecture/RVF_Malinois_Adenda_Arquitectura_ADR_001_005_v1.3.md
- docs/architecture/RVF_Malinois_F2_Arquitectura_Telemetria.md (este documento)
- Modelo de dominio y datos (ya en el repo)
- Tag de freeze: v0.2-settings-units-freeze (NO tocar)
Reglas firmes (de ADR-005 y de este documento):
· El frontend NO habla con MQTT, Modbus, OPC-UA, PLC ni ThingsBoard.
· Los umbrales efectivos viven en el CommissioningSnapshot, NO en Units.
· El simulador imita el stream normalizado del backend; NO simula dispositivos.
· El render se desacopla de la ingesta: ring buffer fuera de React + tick.
· Nada de lógica de telemetría dentro de componentes React.
Tarea de F2A:
1) Crear las carpetas lib/telemetry, lib/realtime, lib/alarms, lib/quality,
lib/jobs, lib/catalog, hooks/ de acuerdo con la estructura del documento F2.
2) Implementar los tipos / interfaces conceptuales de la sección 5 de F2
(UnitCatalogItem, UnitSensorDefinition, CommissioningSnapshot,
ActiveJobSnapshot, EffectiveThresholdSet, VariableThresholds,
TelemetryReading, TelemetryFrame, NormalizedTelemetryMessage,
AlarmEvaluationResult, AlarmState, TelemetryStatus, StaleState,
CommunicationStatus, DataQuality, UnitTelemetrySnapshot).
3) Implementar el SimulatedAdapter con los perfiles de la sección 6
(normal/warning/alarm/stale/high/low) emitiendo NormalizedTelemetryMessage
a un EventEmitter o similar; drift natural, ruido, eventos creíbles,
caída y recuperación de conexión.
4) Implementar el Realtime Store con ring buffer por (jobId, tag) y
selectores finos; FUERA del ciclo de render de React.
5) Implementar el Alarm Evaluator como función pura conforme al
pseudocódigo de la sección 7, con tests unitarios.
6) Implementar el Stale/Offline Detector con los defaults de la sección 8
(10/30/120 s) y override por tag desde el snapshot.
7) Implementar los hooks base (useLiveValue, useAlarmState,
useConnectionStatus, useActiveJobSnapshot) sin lógica;
solo seleccionan del store.
8) Un script de demostración (apps/web/scripts/sim-demo.ts) que arranca
el simulador y muestra en consola la evolución del estado por tag.
Prohibido en este prompt:
· Tocar Settings o Units (freeze).
· Implementar MQTT/Modbus/OPC-UA/PLC/ThingsBoard.
· Modificar componentes UI de Operations o Alarms.
· Colores hex literales o tags hardcodeados.
Entrega esperada:
· PR contra rama feature/f2a-telemetry-foundation
· Tests verdes (Vitest) para evaluator y detector
· Documento corto F2A_RESULT.md con: estructura creada, decisiones,
snapshots mock usados, próximos pasos hacia F2B.
```

*— Fin del documento F2 —*
