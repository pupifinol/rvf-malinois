# RVF Malinois — Adenda de Decisiones de Arquitectura (ADR)

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

Esta adenda registra de forma fechada dos decisiones de arquitectura tomadas por RVF posteriores a la emisión de los documentos fundacionales. No reabre ni reemplaza ningún documento: los precisa y se anexa a los cinco como parte del expediente técnico.

| **Aplica a los documentos**                        | **Estado**                                  |
|----------------------------------------------------|---------------------------------------------|
| 1. Arquitectura general y estrategia de evolución | Sin cambios; informativo                    |
| 2. Fundación Técnica de Telemetría                | Precisado por ADR-001, 002, 003 y 004       |
| 3. Arquitectura UI/UX                             | Precisado por ADR-003 y ADR-004 (pantallas) |
| 4. Sistema de Diseño Industrial                   | Sin cambios                                 |
| 5. Arquitectura de Ingeniería del Producto        | Precisado por ADR-001, 003 y 004            |

# ADR-001 — Origen de Datos: Gateway Stick sin PLC hoy, PLC previsto a futuro

| **Campo** | **Detalle**                                                      |
|-----------|------------------------------------------------------------------|
| Estado    | Aceptada                                                         |
| Decide    | RVF Soluciones Energéticas C.A.                                  |
| Reemplaza | El punto pendiente “marca/modelo de PLC” de los documentos 2 y 5 |

Contexto

Los documentos fundacionales dejaron abierta una pregunta: si el punto de integración en el borde sería un PLC con Modbus u OPC-UA. RVF confirma que, por ahora, los equipos de Well Testing no cuentan con PLC y, por su naturaleza, solo monitorean (no controlan).

Decisión

La cadena de adquisición vigente no incluye PLC. La señal se digitaliza en el propio sensor inalámbrico SignalFire, viaja por la malla de 900 MHz al Gateway Stick, y el Gateway Stick la expone como registros Modbus RTU/TCP. Node-RED lee esos registros del Gateway Stick, los traduce al tag canónico, evalúa calidad, aplica store-and-forward y publica por MQTT.

```
CADENA VIGENTE (sin PLC)
Sensor SignalFire digitaliza la señal en el sensor
(Pressure Scout /
Sentinel RTD /
Wireless Totalizer)
| malla 900 MHz FHSS
v
Gateway Stick expone registros Modbus RTU/TCP
| Modbus
v
Node-RED mapeo de registro -> tag canónico,
calidad, store-and-forward
| MQTT/TLS
v
ThingsBoard -> API RVF -> RVF Malinois
```

En consecuencia, el punto de integración en el borde no es un PLC sino el mapa de registros Modbus del Gateway Stick (documentado por SignalFire según el tipo de sensor). El diccionario de tags canónicos mapea registro del Gateway Stick a tag oficial; por ejemplo, el registro del Pressure Scout PS-118 → p_inlet.

El PLC como evolución ya contemplada (no eliminada)

> **Punto de extensión.** El origen de datos es una capa intercambiable. La incorporación futura de PLC (Modbus u OPC-UA) está prevista y se integrará como un origen adicional en el borde, mapeado al mismo diccionario de tags canónicos, sin afectar nube, historiador, alarmas ni IA.

Por esta razón el diccionario de tags canónicos sigue siendo la decisión más importante de la fundación: es justamente lo que permite pasar de “Gateway Stick sin PLC” a “Gateway Stick + PLC” agregando un origen en el borde, sin que reportes, alarmas, historiador ni IA se enteren del cambio aguas arriba. El diseño que contempla PLC no se elimina; solo deja de presentarse como el camino actual.

Consecuencias

- **Menos por construir hoy.** Node-RED solo necesita un cliente Modbus contra el Gateway Stick; sin drivers de fabricantes de PLC ni servidor OPC-UA. Menos componentes y menos modos de falla.

- **Monitoreo por diseño físico.** Al no existir PLC, no hay ninguna ruta física de actuación ni lógica de control o seguridad local. El principio de “SOLO LECTURA” de toda la plataforma se sostiene por diseño físico, no solo por política.

- **Aclaración de seguridad.** Las alarmas de RVF Malinois son informativas y operativas: avisan al operador. No constituyen un sistema instrumentado de seguridad y no disparan ni protegen el pozo.

- **La integridad recae en el sensor.** Como el sensor SignalFire es la única fuente y no hay PLC de respaldo, la calidad de dato, el comportamiento anti-stale y la pantalla de Salud de Sensores (batería, señal RF, última lectura) dejan de ser deseables y pasan a ser la columna vertebral de integridad del sistema.

- **Migración futura sin rediseño.** Incorporar PLC más adelante será añadir un origen en el borde mapeado a los tags canónicos; no implica rediseñar nube, historiador, alarmas ni IA.

Efecto sobre los documentos (sin reabrirlos)

- **Fundación Técnica.** Léase la sección del gateway de borde como “cliente Modbus contra el Gateway Stick” (sin capa de driver de PLC); la estandarización de tags toma como fuente el registro del Gateway Stick; el resto permanece válido.

- **Ingeniería del Producto.** Ajuste de encuadre: donde se mencione el PLC, entiéndase como evolución prevista, no como camino vigente; se añade que el sistema es de monitoreo por diseño físico.

- **Documentos 1, 3 y 4.** Sin cambios.

# ADR-002 — Residencia de Datos: Decisión Operativa de RVF

| **Campo** | **Detalle**                                                                    |
|-----------|--------------------------------------------------------------------------------|
| Estado    | Aceptada                                                                       |
| Decide    | RVF Soluciones Energéticas C.A.                                                |
| Reemplaza | El punto pendiente “requisito de residencia de Repsol” de los documentos 2 y 5 |

Contexto

Los documentos dejaron pendiente confirmar si Repsol exigía una región o jurisdicción específica para el almacenamiento de datos. RVF confirma que Repsol no impone ningún requisito de residencia de datos; la decisión depende de RVF.

Decisión

La región y el proveedor de nube son una decisión operativa de RVF, gobernada por latencia hacia las operaciones en Venezuela y Colombia, costo, confiabilidad y la capacidad de RVF de operar y dar soporte a la plataforma. Se mantiene la recomendación arquitectónica: ThingsBoard PE autoalojado más el backend propio de RVF, por la propiedad del IP y para dejar abierto el modelo multi-cliente.

Consecuencias

- **Decisión deliberada y única.** La región se elige una sola vez y de forma consciente: una vez que el historiador acumula datos, mover de región es costoso.

- **Residencia configurable por cliente, conservada.** La arquitectura mantiene la residencia como parámetro configurable por cliente — no porque Repsol lo exija hoy, sino porque un cliente futuro podría exigirlo. Dejarlo previsto no cuesta nada y evita un rediseño doloroso más adelante.

- **Sin dependencia externa que bloquee.** Se elimina la espera de un requisito de Repsol; la decisión queda del lado de RVF y puede ejecutarse en la planificación de infraestructura.

Efecto sobre los documentos (sin reabrirlos)

- **Fundación Técnica.** La sección de nube se lee con la residencia como decisión de RVF (no como requisito de cliente), conservando la recomendación por defecto y el parámetro configurable por cliente.

- **Ingeniería del Producto.** Se mantiene el autoalojamiento como criterio de despliegue; la región la fija RVF.

- **Documentos 1, 3 y 4.** Sin cambios.

# ADR-003 — Modelo de Comisionamiento: el Mapeo Sensor–Registro–Tag–Pozo es Dato Configurable por la Operación

| **Campo**   | **Detalle**                     |
|-------------|---------------------------------|
| Estado      | Aceptada                        |
| Decide      | RVF Soluciones Energéticas C.A. |
| Relacionada | Consecuencia directa de ADR-001 |

Contexto

Al definir ADR-001 surgió la pregunta de de dónde saldría el mapa de registros del Gateway Stick (qué dirección Modbus es cada medición, de qué sensor y de qué pozo). RVF observa, con razón, que esa información no es constante: depende de la operación. Entre equipos de medición los sensores difieren (un EMMAD tiene analizador de corte de agua y separador ciclónico; un EMGAD no), los sensores físicos se reemplazan (PS-118 pasa a PS-140 con otra dirección Modbus) y un mismo equipo se moviliza de un pozo a otro. El mapeo cambia en cada movilización; es la norma, no la excepción.

Decisión

El mapeo sensor–registro–tag–pozo no se escribe en el código ni en un archivo fijo previo a la programación: es dato de configuración que la operación carga en el propio sistema, por equipo de medición y por pozo, antes de empezar a medir. El sistema debe ser flexible para adaptarse a estos cambios porque el cambio es un dato que se ingresa, no código que se reescribe.

> **Distinción clave.** El diccionario de tags canónicos sigue siendo fijo y gobernado por RVF: p_inlet siempre significa lo mismo en toda la plataforma. Lo flexible y configurable por la operación es el mapeo de cada sensor físico de cada equipo a esos tags canónicos, capturado por pozo y por equipo en cada movilización.

Se introduce el modelo de comisionamiento, compuesto por dos piezas:

- **Plantilla de equipo de medición.** Un molde por tipo de equipo: un EMMAD tipo trae estos canales (incluido corte de agua y separador ciclónico); un EMGAD tipo trae estos otros. Define qué sensores y tags canónicos son esperables en ese equipo.

- **Ficha de comisionamiento de pozo.** El acto operativo de declarar, antes de medir un pozo, qué equipo se desplegó: se elige la plantilla, se confirman o ajustan los sensores y sus direcciones Modbus, se fijan los límites de alarma de ese pozo, y todo queda registrado y fechado como parte del trabajo (job).

Cuando el equipo se moviliza a otro pozo se crea una ficha nueva; el historial del pozo anterior queda intacto con la configuración que tenía entonces. El mapeo queda así versionado por trabajo: cada prueba sabe con qué configuración exacta se midió.

Consecuencias

- **El software se adapta sin reprogramar.** Movilizar a un pozo nuevo es llenar una ficha en pantalla, no un cambio de software con un programador. Esto es lo que convierte a RVF Malinois en una plataforma operativa y no en un sistema rígido.

- **Coherente con la fundación, ahora explícito.** Las entidades unidad–pozo–trabajo y el diccionario de tags ya estaban definidos; ADR-003 hace explícito que la asociación entre ellos es dato editable y versionado por trabajo, no configuración de despliegue.

- **Integridad histórica.** Como el mapeo se versiona por trabajo, un reporte o un análisis de un pozo siempre se interpreta con la configuración vigente en esa prueba, no con la actual.

- **Habilita el desarrollo sin operaciones reales.** El simulador de telemetría se alimenta de las plantillas de equipo; se prueba con configuraciones realistas y distintas (un EMMAD con corte de agua, un EMGAD sin él) sin necesitar los registros Modbus reales de ninguna operación concreta. Los números reales se ingresan al comisionar el primer pozo, por la operación, en la pantalla.

- **No bloquea el arranque de Claude Code.** La información que antes parecía requisito previo (mapa de registros real) deja de serlo: se modela como dato que la operación carga. La pantalla de comisionamiento y su modelo de datos entran temprano en la secuencia de construcción.

Efecto sobre los documentos (sin reabrirlos)

- **Fundación Técnica.** La estandarización de tags se lee así: el diccionario canónico es fijo y gobernado por RVF; el mapeo registro→sensor→tag→pozo es dato de comisionamiento, editable por la operación y versionado por trabajo. El modelo unidad–pozo–trabajo incorpora la ficha de comisionamiento como parte del trabajo.

- **Arquitectura UI/UX.** Se incorpora la pantalla de comisionamiento (plantilla de equipo y ficha de pozo) como parte de la consola interna de RVF, además de las pantallas ya definidas.

- **Ingeniería del Producto.** La secuencia de construcción incluye, temprano, el modelo de datos y la pantalla de comisionamiento; el simulador de telemetría se alimenta de las plantillas de equipo.

- **Documentos 1 y 4.** Sin cambios.

# ADR-004 — Catálogo de Equipos de Well Testing Reutilizables

| **Campo**   | **Detalle**                                       |
|-------------|---------------------------------------------------|
| Estado      | Aceptada                                          |
| Decide      | RVF Soluciones Energéticas C.A.                   |
| Relacionada | Refina y mejora ADR-003                           |
| Referencia  | P&ID EMMAD-01 (filosofía de operación, dic. 2020) |

Contexto

ADR-003 estableció que el mapeo sensor–registro–tag–pozo es dato configurable por la operación. Quedaba un reproceso: describir el equipo de medición completo en cada comisionamiento de pozo. RVF propone separar el equipo (estable, se reutiliza) del despliegue de ese equipo en un pozo (cambia cada vez). El P&ID del EMMAD-01 aportado confirma esta separación: documenta los lazos de instrumentación de un equipo real (separador SG-EMMAD-01 con control de nivel LIC-001 y de presión PIC-001; línea de gas FQI-002/TIT-002/PIT-002; línea de líquido FQI-004/TIT-004; corte de agua AT-004/AI-004; entrada PIT-003/TIT-003). Ese plano es, en la práctica, la definición del equipo, independiente del pozo donde se use.

Decisión

Se adopta un catálogo de equipos de Well Testing con tres niveles, no dos:

- **Plantilla de tipo.** El molde de qué trae una clase de equipo (un “EMMAD tipo” con sus lazos: nivel, presión de separador, gas, líquido, corte de agua, entrada). El P&ID del EMMAD-01 es el ejemplo de esta plantilla.

- **Equipo concreto en el catálogo.** No “un EMMAD” sino el EMMAD-01 de RVF, con número de serie y sus sensores físicos reales (este Pressure Scout es PS-118, este Sentinel RTD es RT-094), sus direcciones Modbus y sus rangos. Se registra una vez y se reutiliza en todos los pozos a los que se moviliza.

- **Comisionamiento del pozo.** Se elige el equipo del catálogo y solo se captura lo propio del pozo: límites de alarma de ese pozo, fechas, cliente. El equipo viene pre-cargado; el operador confirma y ajusta lo específico.

> **Regla de integridad: foto por trabajo.** El comisionamiento guarda una foto de la configuración del equipo en ese momento, no un enlace vivo al catálogo. Editar el catálogo el año próximo no debe cambiar retroactivamente cómo se interpreta una prueba ya hecha ni un reporte ya entregado a un cliente. El catálogo da la comodidad de no repetir el registro; la foto por trabajo da la integridad histórica. Coherente con el mapeo versionado por trabajo de ADR-003.

Trazabilidad de tres tags

El catálogo guarda, por cada sensor, la cadena completa que conecta el plano de ingeniería del equipo con lo que ve el operador:

```
TRAZABILIDAD POR SENSOR
Tag de instrumento (P&ID) -> Sensor físico -> Tag canónico
PIT-003 -> Pressure Scout PS-118 -> p_inlet
TIT-002 -> Sentinel RTD RT-094 -> t_gas_out
FQI-004 -> Wireless Totalizer -> q_liquid
AT-004 -> analizador corte agua -> water_cut
· El diccionario canónico (p_inlet...) es fijo y de RVF (ADR-003)
· El tag de instrumento viene del P&ID del equipo
· Un auditor (p. ej. Repsol) puede seguir la cadena completa
```

Alcance: el equipo controla; RVF Malinois solo observa

El P&ID muestra lazos de control activo (válvulas PV-001 y LV-004 con actuadores; lazos PIC-001, LIC-001). Esto es la filosofía de operación física del equipo en campo: el EMMAD regula localmente su propio nivel y presión para operar de forma segura. Coherente con ADR-001 y ADR-003, RVF Malinois lee la posición y el estado de esas válvulas y lazos como dato, pero no los acciona. El P&ID describe el equipo; Malinois lo observa. Esta aclaración evita que la presencia de lazos de control en el plano se interprete como capacidad de control remoto de la plataforma.

Consecuencias

- **Comisionamiento más rápido y con menos error.** Pasa de “describir el equipo cada vez” a “elegir del catálogo y confirmar lo del pozo”. Es como operan los catálogos de activos de SLB o Emerson.

- **Mantenimiento en un solo lugar.** Si se reemplaza un Pressure Scout (PS-118 → PS-140), se edita una vez en el catálogo del equipo; los pozos futuros lo heredan, los históricos conservan su foto.

- **El P&ID como documento de ingeniería del equipo.** Cada equipo del catálogo puede referenciar su P&ID; la plantilla de tipo se deriva de él. Queda registrado el P&ID del EMMAD-01 como referencia.

- **Mejora ADR-003, no lo contradice.** ADR-003 sigue vigente; ADR-004 le añade el nivel “equipo concreto reutilizable” entre la plantilla y el comisionamiento, conservando la foto por trabajo.

Efecto sobre los documentos (sin reabrirlos)

- **Fundación Técnica.** El modelo unidad–pozo–trabajo incorpora el catálogo de equipos como entidad propia (equipo concreto con sus sensores y P&ID); el comisionamiento referencia un equipo del catálogo y guarda su foto.

- **Arquitectura UI/UX.** Se incorpora la pantalla de catálogo de equipos (alta y mantenimiento del equipo concreto y sus sensores) además de la pantalla de comisionamiento de pozo de ADR-003.

- **Ingeniería del Producto.** El modelo de datos separa equipo (catálogo) de despliegue (comisionamiento); el simulador puede instanciar equipos del catálogo.

- **Documentos 1 y 4.** Sin cambios.

Cierre de Puntos Pendientes y Registro de Decisiones

Con esta adenda se cierran formalmente los puntos que las notas de cierre de los documentos 2 y 5 mantenían abiertos, y se incorporan las decisiones de arquitectura derivadas (ADR-003 y ADR-004). A partir de su fecha de emisión, dichas notas se consideran resueltas y no deben tratarse como pendientes en planificación ni en ejecución.

| **Punto pendiente original**                             | **Resuelto por**                                                  |
|----------------------------------------------------------|-------------------------------------------------------------------|
| Marca/modelo de PLC de las unidades EMGAD/EMMAD          | ADR-001 — no hay PLC hoy; previsto a futuro como origen adicional |
| Requisito de residencia de datos de Repsol               | ADR-002 — sin requisito; decisión operativa de RVF                |
| Origen del mapa de registros Gateway Stick por operación | ADR-003 — dato de comisionamiento configurable por la operación   |

Registro de decisiones (índice)

| **ADR** | **Decisión**                                                    | **Estado** |
|---------|-----------------------------------------------------------------|------------|
| ADR-001 | Origen sin PLC hoy; PLC previsto a futuro como origen adicional | Aceptada   |
| ADR-002 | Residencia de datos: decisión operativa de RVF                  | Aceptada   |
| ADR-003 | Mapeo sensor–registro–tag–pozo configurable por la operación    | Aceptada   |
| ADR-004 | Catálogo de equipos de Well Testing reutilizables               | Aceptada   |

> **Nota de versión.** Este documento es la versión 1.2 del registro de decisiones de RVF Malinois y reemplaza a la versión 1.1 (ADR-001 a 003). El registro es acumulativo: futuras decisiones se añadirán como ADR-005 y siguientes en este mismo documento, manteniendo un único expediente de trazabilidad. Documento de referencia incorporado: P&ID EMMAD-01 (filosofía de operación del equipo, dic. 2020).

*
