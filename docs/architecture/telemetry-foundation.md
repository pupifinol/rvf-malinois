# RVF Malinois — Fundación Técnica de Telemetría

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

## 1. Cómo Leer Este Documento

Este documento es la fundación de ingeniería de RVF Malinois: define la estructura real de los datos, los mensajes, las bases de datos y los componentes que sostendrán la plataforma a largo plazo. Si estas bases se definen bien ahora, nunca habrá que reconstruirlas con dolor más adelante.

Cada sección está escrita en dos niveles. Primero, una explicación en lenguaje sencillo, pensada para quien no programa, con un ejemplo de operaciones de petróleo y gas. Después, la especificación técnica precisa, pensada para los ingenieros de RVF que implementarán cada parte. Los bloques con fondo gris y letra de máquina de escribir son los formatos exactos que los ingenieros deben seguir al pie de la letra.

**Recordatorio del contexto.** El software es propiedad de RVF. El usuario primario es el equipo de operaciones de RVF; Repsol y futuros clientes son visores externos de solo lectura, limitados a sus propios pozos. Evolucionamos desde un MVP operativo (Node-RED + ThingsBoard); no se reconstruye desde cero. La confiabilidad y la simplicidad pesan más que las funciones vistosas, y todo debe funcionar de forma confiable sobre internet satelital.

## 2. Principios de Diseño

Todas las decisiones de este documento obedecen a cinco principios. Cuando haya que elegir entre dos caminos, se elige el que respete estos principios, en este orden:

1.  Confiabilidad primero. Un dato perdido o un dato falso tratado como verdadero es peor que una función bonita que falta. El sistema debe degradarse con elegancia cuando el satélite se cae, no romperse.

2.  Los datos son sagrados y deben ser autoexplicativos. Cada mensaje dice qué es, de dónde viene, cuándo se midió de verdad y si el sensor estaba sano. Nada se interpreta “de memoria”.

3.  Estandarizar en el borde, no en la nube. La nube nunca debe conocer los nombres internos de cada PLC. La traducción a nombres oficiales ocurre en el sitio del pozo, antes de transmitir.

4.  Aislamiento de clientes desde el día uno. La separación entre clientes se construye en cada consulta, no se agrega después.

5.  Simplicidad deliberada. Empezar con lo simple y robusto; añadir complejidad solo cuando un problema real lo exija. La complejidad prematura es un riesgo operativo.

## 3. Estructura de Temas MQTT

MQTT organiza los mensajes en “temas”, que funcionan como las carpetas de un archivador: una ruta jerárquica que dice de quién y de qué es cada mensaje. Una buena estructura de temas permite filtrar, enrutar y, sobre todo, controlar quién puede publicar qué.

**Decisión de diseño importante.** Las unidades de well testing son portátiles: se mueven de un pozo a otro. Por eso el identificador estable en el tema es la unidad física, no el pozo. El pozo es una asignación que cambia y se resuelve por metadatos. Poner el pozo en el tema obligaría a cambiar la dirección del mensaje cada vez que la unidad se traslada; eso es frágil.

Estructura recomendada:

```
rvf/v1/{cliente}/{unidad}/{tipo}
rvf -> raíz: todo el tráfico de RVF Malinois
v1 -> versión del esquema (clave para evolucionar)
{cliente} -> código del cliente, p. ej. 'repsol'
{unidad} -> serie estable del equipo, p. ej. 'mpfm-007'
{tipo} -> telemetry | alarm | event | status | cmd
```

Ejemplos reales de un test en el pozo Campo Norte 014 con la unidad MPFM-007:

```
rvf/v1/repsol/mpfm-007/telemetry (mediciones periódicas)
rvf/v1/repsol/mpfm-007/alarm (alarmas de proceso)
rvf/v1/repsol/mpfm-007/event (inicio/fin de prueba, etc.)
rvf/v1/repsol/mpfm-007/status (en línea / fuera de línea)
rvf/v1/repsol/mpfm-007/cmd (comandos hacia el gateway)
```

- **Por qué el cliente va en el tema.** Permite que el broker aplique listas de control de acceso: la credencial de un gateway solo puede publicar bajo el cliente al que pertenece. Es la primera barrera de aislamiento.

- **Por qué la versión va en el tema.** El día que cambie el formato, las unidades viejas siguen publicando en v1 mientras las nuevas usan v2; nada se rompe en campo.

- **Todo en minúsculas, sin espacios ni acentos.** Los identificadores de transporte deben ser estables y predecibles; los nombres “bonitos” viven en los metadatos, no en el tema.

## 4. Estructura JSON de Telemetría

JSON es simplemente un formato de texto ordenado por “clave: valor” que tanto las máquinas como las personas pueden leer. La telemetría es el mensaje que la unidad envía periódicamente con las mediciones del pozo.

Cada mensaje de telemetría debe ser autoexplicativo: debe poder entenderse aunque la base de datos de metadatos esté momentáneamente desincronizada.

```
{
"schema": "rvf.telemetry.v1",
"unit_id": "MPFM-007",
"well_id": "CN-014",
"job_id": "JOB-2026-0188",
"ts": "2026-05-18T14:32:05.000Z",
"seq": 184432,
"measurements": {
"p_inlet": { "v": 1245.7, "u": "psi", "q": "good" },
"p_outlet": { "v": 318.2, "u": "psi", "q": "good" },
"t_inlet": { "v": 78.4, "u": "degC", "q": "good" },
"t_outlet": { "v": 71.9, "u": "degC", "q": "good" },
"q_oil": { "v": 412.5, "u": "bbl/d", "q": "good" },
"q_gas": { "v": 0.83, "u": "MMscf/d", "q": "good" },
"oil_prod_day": { "v": 405.1, "u": "bbl", "q": "good" },
"gor": { "v": 2010, "u": "scf/bbl", "q": "estimated" },
"water_cut": { "v": 12.4, "u": "pct", "q": "good" }
}
}
```

*Claves cortas (v, u, q) para ahorrar ancho de banda satelital, sin perder claridad.*

- **schema:** nombre versionado del formato. Permite evolucionar sin romper unidades desplegadas.

- **ts (timestamp):** el momento en que se MIDIÓ el dato, fijado en el borde, en hora UTC con milisegundos y la 'Z' final. Nunca se usa la hora de llegada a la nube. Tras una caída de satélite de 6 horas, esta es la única forma de saber cuándo ocurrió de verdad cada lectura.

- **seq:** un contador que solo sube, generado por el gateway. Permite descartar duplicados y detectar huecos (“faltan los mensajes 184432 a 184510”).

- **q (calidad):** estado del dato por medición. Valores: good, bad, uncertain, estimated, stale. Es decisivo en petróleo y gas: si un sensor de corte de agua falla, su valor debe marcarse 'bad' y jamás tratarse como real.

- **well_id y job_id:** se incluyen aunque sean redundantes, para que el dato sea autoexplicativo y trazable a la prueba concreta.

## 5. Estructura JSON de Alarmas y Eventos

Una alarma tiene ciclo de vida: nace activa, alguien la reconoce y luego se normaliza. Un evento es un hecho puntual sin ciclo de vida (por ejemplo, “se inició la prueba”). Separarlos evita confusión y permite medir el desempeño de alarmas.

Estructura de alarma (se recomienda alinear con la norma ISA-18.2 de gestión de alarmas de proceso):

```
{
"schema": "rvf.alarm.v1",
"unit_id": "MPFM-007",
"well_id": "CN-014",
"job_id": "JOB-2026-0188",
"alarm_id": "MPFM-007:p_inlet_hihi:1716042725",
"ts": "2026-05-18T14:32:05.000Z",
"state": "active", // active|acknowledged|cleared|shelved
"severity": "critical", // critical|high|medium|low
"source": "p_inlet",
"condition": "HI_HI", // LO_LO|LO|HI|HI_HI|RATE|DEVIATION
"message": "Presión de entrada sobre límite crítico",
"value": 1525.3,
"unit": "psi",
"limit": 1500.0,
"seq": 184433
}
```

El alarm_id es determinístico: une unidad, fuente, condición y el instante de activación. Así, los mensajes posteriores de reconocimiento o normalización referencian exactamente la misma alarma.

Estructura de evento (hecho puntual, sin ciclo de vida):

```
{
"schema": "rvf.event.v1",
"unit_id": "MPFM-007",
"ts": "2026-05-18T14:30:00.000Z",
"category": "operational",
"code": "JOB_STARTED",
"message": "Inicio de prueba en pozo CN-014",
"context": { "job_id": "JOB-2026-0188", "operator": "field_eng_12" }
}
```

**Ejemplo de operación.** La presión de entrada cruza 1500 psi: se emite una alarma 'active' severidad 'critical'. El operador del centro de monitoreo de RVF la reconoce: se emite el mismo alarm_id con state 'acknowledged'. La presión baja y se estabiliza: state 'cleared'. Todo el ciclo queda registrado para auditoría e indicadores.

## 6. Metadatos de Pozo y Equipo

Los metadatos describen el “mundo”: qué es cada cosa y cómo se relacionan. El modelo correcto refleja exactamente cómo trabaja el negocio de RVF.

**Idea central.** La unidad de well testing pertenece a RVF. El pozo pertenece al cliente. El “trabajo” (job) es el puente: conecta una unidad de RVF con un pozo de un cliente durante un período. Modelar esto bien es lo que permite que una misma unidad sirva a varios clientes a lo largo del tiempo sin mezclar datos.

| **Entidad**      | **Pertenece a** | **Qué representa**                                                     |
|------------------|-----------------|------------------------------------------------------------------------|
| Cliente (tenant) | —               | La empresa cliente: Repsol, y futuros clientes.                        |
| Sitio / campo    | Cliente         | Un campo o bloque donde hay pozos.                                     |
| Pozo             | Cliente         | El pozo físico que se prueba.                                          |
| Unidad (activo)  | RVF             | El equipo portátil de well testing (skid MPFM).                        |
| Gateway          | RVF             | El computador de borde que transmite (suele ir 1:1 con la unidad).     |
| Trabajo (job)    | Cliente         | Asignación con fechas: una unidad de RVF probando un pozo del cliente. |
| Tag / canal      | RVF (catálogo)  | La definición oficial de cada variable medible.                        |

Ejemplo de metadatos de un pozo, incluyendo los límites de diseño que alimentan las alarmas:

```
{
"well_id": "CN-014",
"tenant_id": "repsol",
"site_id": "campo-norte",
"name": "Campo Norte 014",
"type": "producer",
"fluid": "oil",
"location": { "lat": 9.123, "lon": -64.456 },
"design_limits": {
"p_inlet": { "lo_lo": 100, "lo": 200, "hi": 1350, "hi_hi": 1500, "u": "psi" }
}
}
```

## 7. Arquitectura del Esquema de Base de Datos

Se usan dos bases de datos propias de RVF, cada una para lo que hace mejor, más el almacén interno de ThingsBoard que queda detrás de la capa de envoltura (ya descrito en el documento de arquitectura).

- **Base de negocio (PostgreSQL).** Todo lo que no es serie temporal: clientes, sitios, pozos, unidades, gateways, trabajos, usuarios, roles, definiciones de alarma y auditoría. Con seguridad a nivel de fila para aislar clientes.

- **Historiador de series temporales (TimescaleDB).** Las mediciones a lo largo del tiempo y el historial de alarmas. Es de donde leen reportes, tableros e IA.

Tablas principales (vista lógica):

| **Tabla**             | **Contenido principal**                               |
|-----------------------|-------------------------------------------------------|
| tenants               | Clientes y su configuración.                          |
| sites / wells         | Campos y pozos, con sus límites de diseño.            |
| units / gateways      | Activos de RVF y su estado.                           |
| jobs                  | Asignación unidad↔pozo↔cliente con fechas.            |
| tags                  | Catálogo oficial de variables (ver sección 9).        |
| alarm_definitions     | Límites y reglas por pozo/unidad y variable.          |
| alarm_history         | Historial inmutable del ciclo de vida de cada alarma. |
| users / roles         | Usuarios, roles y asignaciones.                       |
| audit_log             | Registro inmutable de quién hizo qué.                 |
| telemetry (Timescale) | time, unit_id, well_id, job_id, tag, value, quality.  |

**Por qué la telemetría es “larga” y no “ancha”.** Se guarda una fila por medición (tiempo, unidad, tag, valor, calidad) en lugar de una columna por variable. Así, agregar una variable nueva no obliga a cambiar la estructura de la tabla, y cada valor lleva su propia marca de calidad. TimescaleDB comprime este formato de manera muy eficiente.

## 8. Convenciones de Nomenclatura

Los nombres son contratos. Una vez que existen datos bajo un identificador, ese identificador no se cambia ni se reutiliza jamás. Reglas:

- **Identificadores de transporte y base de datos:** minúsculas, sin espacios ni acentos. Temas MQTT en kebab; claves JSON y columnas en snake_case.

- **Código de cliente:** corto, estable, en minúsculas: repsol, chevron.

- **Identificador de unidad:** prefijo de tipo de equipo más número con ceros: MPFM-007. Estable durante toda la vida del activo.

- **Identificador de pozo:** significativo para el cliente pero único dentro de cada cliente: CN-014.

- **Identificador de trabajo:** JOB-AAAA-NNNN, por ejemplo JOB-2026-0188.

- **Nombres para mostrar separados de los identificadores.** “Campo Norte 014” es para la pantalla; CN-014 es el identificador estable. Nunca se mezclan.

- **Sin texto libre escrito a mano en identificadores.** El texto libre introduce errores difíciles de rastrear.

## 9. Estandarización de Tags (la decisión clave)

Esta es la decisión más importante de toda la fundación. Cada unidad tiene un PLC que llama a sus variables con nombres internos distintos: una unidad puede llamar a la presión de entrada PT_101 y otra PRESS_IN. Si esos nombres llegan a la nube, RVF Malinois queda roto para siempre: cada reporte, alarma y modelo de IA tendría que conocer cada variante de cada PLC.

**La regla de oro.** Existe un diccionario oficial de variables de RVF. El gateway de borde traduce el nombre interno de cada PLC al nombre oficial ANTES de transmitir. La nube solo ve nombres limpios y estandarizados. Hacer esto bien resuelve la mitad de los problemas de calidad de datos del proyecto.

Cada entrada del diccionario define:

```
nombre_oficial : p_inlet
nombre_visible : Presión de entrada
unidad_oficial : psi
tipo_de_dato : decimal
rango_esperado : 0 .. 3000
categoria : presion
```

Catálogo inicial recomendado para well testing (nombre oficial — descripción):

| **Nombre oficial**          | **Descripción**                     | **Unidad**            |
|-----------------------------|-------------------------------------|-----------------------|
| p_inlet / p_outlet          | Presión de entrada / salida         | psi                   |
| t_inlet / t_outlet          | Temperatura de entrada / salida     | degC                  |
| q_oil / q_gas / q_water     | Caudal de petróleo / gas / agua     | bbl/d, MMscf/d, bbl/d |
| oil_prod_day / gas_prod_day | Producción diaria de petróleo / gas | bbl, MMscf            |
| gor                         | Relación gas-petróleo               | scf/bbl               |
| water_cut                   | Corte de agua                       | pct                   |
| bsw                         | Sedimentos y agua básicos           | pct                   |
| choke_pos                   | Apertura del estrangulador (choke)  | pct                   |
| sep_pressure / sep_temp     | Presión / temperatura del separador | psi, degC             |

**Ejemplo de operación.** Llega a campo una unidad nueva cuyo PLC llama a la presión de entrada “PRESS_IN”. El ingeniero solo edita el mapa de tags del gateway: PRESS_IN → p_inlet. La nube, los reportes y la IA no se enteran ni cambian. Sin diccionario, esa unidad nueva habría requerido tocar el software en la nube.

## 10. Arquitectura del Gateway de Borde

El gateway es el computador industrial en el sitio del pozo. Hoy ejecuta Node-RED y se conserva. Conviene organizar sus responsabilidades en capas claras y guardar la configuración en archivos bien definidos, no enterrada en la lógica visual.

6.  Lectura del PLC: driver de campo (Modbus TCP / OPC-UA) que lee los registros del equipo.

7.  Mapeo de tags: traduce el nombre del PLC al nombre oficial (sección 9), guiado por configuración.

8.  Normalización: conversión de unidades y evaluación de calidad de cada dato.

9.  Buffer local: cola persistente en disco para store-and-forward (sección 11).

10. Publicador MQTT: envía cifrado (TLS) con calidad de servicio adecuada.

11. Motor de alarmas local: alarmas de umbral básicas que funcionan aunque el satélite esté caído.

12. Salud y vigilancia: watchdog, autodiagnóstico y reporte de estado.

13. Configuración y actualización remota: identidad de la unidad, asignación actual de pozo/trabajo, mapa de tags y límites de alarma; actualizables a distancia.

**Principio.** El gateway debe poder operar y proteger el pozo de forma autónoma durante una desconexión prolongada. La nube enriquece, pero el borde nunca depende de ella para lo esencial.

## 11. Estrategia de Store-and-Forward

Es la piedra angular de la confiabilidad sobre satélite: cuando el enlace se cae, el gateway sigue midiendo y guarda todo localmente para reenviarlo cuando vuelva la conexión.

- **Persistente en disco.** Sobrevive a cortes de energía y reinicios. Nunca solo en memoria.

- **Orden y secuencia.** Cola en orden de llegada, con número de secuencia para reordenar y descartar duplicados.

- **Acotado por tamaño y por antigüedad.** Por ejemplo, conservar hasta 7 días de datos. Para sitios satelitales, deben ser días, no minutos.

- **Manejo de saturación.** Si el buffer se llena, se reduce la resolución (agregar lecturas) en vez de descartar en silencio, y se emite un evento que lo deja registrado.

- **Reenvío controlado.** Al reconectar, se drena en orden y a ritmo controlado para no saturar el broker.

- **Detección de huecos.** La nube detecta secuencias faltantes y marca explícitamente un “hueco de datos” en lugar de fingir que el pozo no producía.

- **Dato tardío bien etiquetado.** Se conserva la marca de tiempo original de medición y se añade un indicador de entrega tardía.

**Ejemplo de operación.** Una tormenta de arena tumba el enlace 6 horas. El gateway mide cada 5 segundos y acumula unas 4.300 lecturas en disco. Al volver el enlace, las drena ordenadas en pocos minutos; la nube ve la secuencia continua, no se pierde ningún dato y las lecturas viejas quedan marcadas como entregadas con retraso.

## 12. Flujo de Ingesta de Telemetría

El recorrido completo de un dato, desde el sensor hasta la pantalla:

14. El PLC mide; el driver del gateway lee el valor.

15. Mapeo de tag al nombre oficial, conversión de unidad y evaluación de calidad.

16. Se agrega al buffer local con número de secuencia.

17. Publicación MQTT cifrada al tema rvf/v1/{cliente}/{unidad}/telemetry.

18. El broker (ThingsBoard) recibe el mensaje.

19. Una cadena de reglas valida el esquema y resuelve el trabajo/pozo actual desde los metadatos.

20. La cadena reenvía una copia al servicio de ingesta de RVF.

21. El servicio escribe de forma idempotente (descarta duplicados por unidad + secuencia) en el historiador y actualiza la caché de “último valor”.

22. Se empuja el dato en vivo a los tableros conectados por WebSocket.

23. Se evalúan las alarmas también en la nube, como segundo control sobre el del borde.

**Por qué la idempotencia es crítica.** Con calidad de servicio “al menos una vez”, el mismo mensaje puede llegar dos veces. La clave (unidad + secuencia) garantiza que un reenvío no cree un dato duplicado en el historial.

## 13. Arquitectura de Nube

La nube aloja el broker, la ingesta, las bases de datos, la caché, el canal en vivo y, más adelante, la IA. Lineamientos:

- **Red privada y dispositivos con certificado.** El broker vive en una red controlada; cada gateway se autentica con su propio certificado (TLS mutuo).

- **Componentes.** Broker (ThingsBoard PE), servicio de ingesta, API de negocio, historiador (TimescaleDB), base de negocio (PostgreSQL), caché (Redis), canal WebSocket, almacenamiento de objetos (reportes y respaldos), y servicios de IA (después).

- **Resiliencia.** Despliegue en varias zonas, bases de datos gestionadas, respaldos con recuperación a un punto en el tiempo y un plan de recuperación ante desastres.

- **Residencia de datos.** La región se elige según el requisito del cliente; conviene confirmarlo con Repsol antes de fijar la arquitectura.

- **Observabilidad.** Métricas, registros y trazas para enterarse de cada fallo en un sistema industrial.

## 14. Arquitectura de Servicios Backend

Se empieza con un “monolito modular”: un solo programa desplegable, pero internamente dividido en módulos con responsabilidades claras. No se empieza con microservicios: para un equipo pequeño, esa complejidad es un riesgo operativo, no una ventaja.

- **Módulos internos:** autenticación y multi-cliente; metadatos (pozos, unidades, trabajos); ingesta (escritura); consulta (lectura e historial); alarmas; reportes; auditoría; adaptador de plataforma IoT (la envoltura de ThingsBoard); y, después, pasarela de IA.

- **Cuándo dividir en microservicios:** solo cuando un módulo concreto tenga una necesidad real e independiente de escalar. Antes de eso, dividir es complejidad prematura.

## 15. Arquitectura de API

La API es la puerta controlada por la que las pantallas y, en el futuro, los sistemas de los clientes obtienen datos. Lineamientos:

- **REST para consultas y administración;** WebSocket para el flujo en vivo de telemetría y alarmas.

- **Versionada:** /api/v1/... para poder evolucionar sin romper a los consumidores.

- **Alcance de cliente forzado en el servidor.** El servidor deduce el cliente desde la identidad autenticada. Nunca se confía en un identificador de cliente enviado por el navegador o por el mensaje. Esta sola regla previene la fuga de datos entre clientes.

- **Patrones de consulta de historial:** por rango de tiempo y por lista de tags, con paginación.

- **API para clientes (después):** solo lectura, limitada a sus pozos, con clave y límite de uso.

Ejemplos de endpoints (el alcance al cliente es automático):

```
GET /api/v1/wells
GET /api/v1/units/MPFM-007/telemetry?from=...&to=...&tags=p_inlet,q_oil
GET /api/v1/alarms?state=active
WS /api/v1/stream (suscripción a datos en vivo)
```

## 16. Arquitectura de Frontend y Dashboard

Una sola aplicación web, consciente del rol, con dos superficies sobre el mismo código: la consola interna de RVF (completa) y el portal del cliente (acotado y de solo lectura). El rol decide qué se ve.

- **Pantallas principales:** panorama de pozos en vivo; detalle de un pozo (indicadores y tendencias); tendencias históricas; consola de alarmas; gestión de trabajos y unidades (solo interna); y reportes.

- **Tiempo real:** vía WebSocket, con respaldo por sondeo si el canal se interrumpe.

- **Diseño:** claridad sobre vistosidad; estilo tipo SCADA, de alto contraste, legible en los monitores del centro de operaciones y en tabletas de campo.

- **Rendimiento del historial:** para rangos largos, el servidor reduce la resolución antes de graficar, para que las pantallas sigan siendo rápidas.

## 17. Aislamiento Multi-cliente

La separación entre clientes se defiende en varias capas a la vez (defensa en profundidad), porque los clientes pueden ser competidores entre sí:

- **En el broker:** listas de control de acceso; una credencial solo toca los temas de su cliente.

- **En la ingesta:** el cliente se sella a partir de la identidad del dispositivo, no de lo que diga el mensaje.

- **En la base de datos:** seguridad a nivel de fila por cliente en cada tabla con datos de cliente; la aplicación fija el contexto de cliente en cada petición a partir de la sesión autenticada.

- **En la API y la interfaz:** el servidor deriva el cliente de la identidad; la pantalla se restringe por rol y por cliente.

- **En las pruebas:** pruebas automáticas que intentan acceso cruzado entre clientes y deben fallar siempre.

**Matiz importante.** Como las unidades pertenecen a RVF, el personal de RVF sí puede ver sus propios activos a través de varios clientes; los clientes nunca pueden ver más allá de los suyos.

## 18. Jerarquía de Roles de Usuario

Principio de menor privilegio: cada rol tiene solo los permisos que necesita. El alcance al cliente es independiente del rol.

| **Rol**         | **Quién**               | **Acceso**                                              |
|-----------------|-------------------------|---------------------------------------------------------|
| rvf_super_admin | Plataforma RVF          | Configuración global e infraestructura.                 |
| rvf_admin       | Administración RVF      | Clientes y usuarios; sin infraestructura.               |
| rvf_operaciones | Centro de monitoreo RVF | Todos los clientes: vivo, historial, reconocer alarmas. |
| rvf_campo       | Ingenieros en sitio     | Unidades asignadas: calibración, trabajos, comisionado. |
| rvf_analista    | Análisis RVF            | Lectura y analítica; sin control operativo.             |
| client_admin    | Responsable del cliente | Gestiona los usuarios de su propia empresa.             |
| client_viewer   | Repsol y clientes       | Solo lectura, solo sus pozos.                           |
| client_api      | Sistemas del cliente    | Lectura por máquina, solo sus pozos.                    |

## 19. Estrategia de Historiador

El historiador es la memoria de largo plazo de la planta, propiedad de RVF, y la fuente de verdad para historial e IA. Se construye sobre TimescaleDB.

- **Resolución cruda por una ventana:** el dato a máxima resolución (cada pocos segundos) se conserva, por ejemplo, 90 días.

- **Agregados continuos a largo plazo:** resúmenes por minuto y por hora que se conservan durante años y nunca se borran; alimentan tableros rápidos en rangos largos.

- **La calidad se preserva en el historial.** Un dato malo sigue marcado como malo para siempre.

- **Consciente de datos tardíos:** el dato que llega con retraso se inserta en su marca de tiempo real, no en la de llegada.

- **Separación clara:** ThingsBoard manda en valores en vivo; el historiador propio manda en historial y analítica.

## 20. Gestión de Alarmas

Una mala estrategia de alarmas es un riesgo de seguridad: si todo dispara alarmas, los operadores las ignoran todas. Se recomienda seguir los principios de la norma ISA-18.2.

- **Definiciones en metadatos:** por pozo/unidad y variable, con límites lo_lo, lo, hi, hi_hi, además de tasa de cambio y desviación.

- **Ciclo de vida:** normal → activa → reconocida → normalizada; más “en estante” (shelved) y “fuera de servicio”, todo registrado.

- **Doble evaluación:** en el borde (funciona sin conexión, rápida, de seguridad) y en la nube (más rica, con notificaciones).

- **Banda muerta y retardo:** para evitar el parpadeo de alarmas cuando un valor oscila alrededor del límite. Ejemplo: la presión rebota alrededor de 1500 psi; sin banda muerta se generarían decenas de alarmas por minuto.

- **Prioridades racionalizadas:** evitar la “inundación de alarmas”; cada alarma debe significar una acción.

- **Notificaciones con escalamiento:** correo, SMS o push por cliente y rol, con escalamiento si nadie reconoce.

- **Historial inmutable:** para auditoría e indicadores (tasa de alarmas por pozo, alarmas permanentes).

## 21. Estrategia de Auditoría

El registro de auditoría es un archivo inmutable de solo-añadir: quién hizo qué, cuándo, desde dónde y cuál fue el valor anterior y el nuevo.

- **Qué se registra:** ingresos y autenticación; cambios de configuración (límites, metadatos); reconocimiento y “estante” de alarmas; cambios de usuarios y roles; exportaciones de datos; y accesos de los clientes a su portal.

- **Inmutable y de larga retención:** por requisitos regulatorios; opcionalmente con encadenamiento por hash para evidencia de no manipulación.

- **Sin secretos ni datos sensibles en los registros.** Se registra el hecho, no contraseñas ni información personal.

- **También se auditan los clientes:** qué datos vieron o exportaron desde su portal.

## 22. Arquitectura de Datos para IA Futura

La IA llega después, pero la base de datos se diseña hoy para que sea posible. La IA lee del historiador propio y de los metadatos, nunca del camino de ingesta en vivo, y corre en un carril de cómputo separado.

- **La calidad se respeta:** los modelos no deben entrenarse con datos marcados como malos.

- **Almacén de etiquetas:** registrar eventos reales (fallas, intervenciones, irrupción de agua) permite, más adelante, aprendizaje supervisado.

- **Resultados como recomendaciones con trazabilidad:** las predicciones se escriben en la base de negocio como avisos, indicando con qué versión de modelo y con qué datos se generaron.

- **Reproducibilidad:** conjuntos de datos y modelos versionados.

**La conclusión clave.** La estrategia de IA es, en realidad, la estrategia de datos: si desde hoy el historiador acumula datos limpios, con calidad y bien etiquetados, la IA será posible. Si no, no lo será, por sofisticado que sea el modelo.

## 23. Qué Implementar Primero y Qué Postergar

Primero (la fundación, meses 1 a 3)

- El diccionario oficial de tags (sección 9). Antes que cualquier otra cosa.

- La estructura de temas MQTT y los formatos de telemetría y alarmas, versionados (secciones 3 a 5).

- El modelo de metadatos: cliente, sitio, pozo, unidad, trabajo (sección 6).

- El endurecimiento del store-and-forward en el borde (sección 11).

- La ingesta idempotente hacia el historiador (secciones 12 y 19).

- El aislamiento por cliente con seguridad a nivel de fila, desde el día uno (sección 17).

- El esqueleto del registro de auditoría y el modelo básico de roles (secciones 18 y 21).

Postergar (cuando un problema real lo exija)

- La división en microservicios: mantener el monolito modular.

- La API para clientes y las claves de acceso de máquina.

- Los servicios de IA.

- Las funciones avanzadas de alarmas (flujos de “estante”, árboles de escalamiento).

- La app móvil y la gestión remota de flota (después de superar ~10 unidades).

## 24. Errores de Diseño que Debemos Evitar

Cada uno de estos errores es barato de evitar hoy y carísimo de corregir después:

24. Dejar que los nombres internos de los PLC lleguen a la nube (no tener diccionario de tags). Es el error que más proyectos arruina.

25. No incluir un campo de versión de esquema: impide evolucionar sin romper las unidades ya desplegadas.

26. Usar la hora de llegada a la nube como hora de medición: corrompe el historial, sobre todo tras cortes de satélite.

27. No marcar la calidad del dato: un sensor dañado se trata como real y envenena reportes y modelos.

28. Confiar en el identificador de cliente que envía el navegador o el mensaje: provoca fuga de datos entre clientes.

29. Dejar la separación entre clientes “para después”: incorporarla luego es casi imposible de hacer con seguridad.

30. Buffer de borde solo en memoria: se pierden datos ante el menor corte de energía.

31. Inundación de alarmas (límites por defecto en todo): los operadores terminan ignorando todas las alarmas.

32. Reutilizar o cambiar identificadores cuando ya existen datos: corrompe el historial.

33. Microservicios prematuros: una complejidad que un equipo pequeño no puede operar con confiabilidad.

34. Tratar a ThingsBoard como el producto en lugar de envolverlo detrás de una API propia.

35. No descartar duplicados: la calidad de servicio “al menos una vez” crea registros repetidos.

36. No detectar huecos de datos: una pérdida silenciosa parece “pozo sin producción”.

## 25. Glosario para No Programadores

| **Término**               | **Significado**                                                              |
|---------------------------|------------------------------------------------------------------------------|
| MQTT                      | Protocolo ligero de mensajería, estándar para datos de sensores.             |
| Tema (topic)              | La “ruta de carpeta” que identifica de qué y de quién es un mensaje.         |
| JSON                      | Formato de texto ordenado por clave: valor, legible por personas y máquinas. |
| Telemetría                | Las mediciones que el equipo envía de forma remota.                          |
| Tag                       | El nombre oficial de una variable medible (p. ej. p_inlet).                  |
| Calidad (quality)         | Indicador de si un dato es bueno, malo, incierto o estimado.                 |
| Secuencia (seq)           | Contador que solo sube; permite ordenar y detectar huecos.                   |
| Idempotente               | Procesar dos veces el mismo mensaje no crea un dato duplicado.               |
| Store-and-forward         | Guardar localmente y reenviar cuando vuelve la conexión.                     |
| Gateway                   | El computador de borde en el sitio del pozo.                                 |
| Historiador               | Base de datos de largo plazo con todo el historial de medidas.               |
| Multi-cliente             | Un mismo sistema sirve a varios clientes con datos aislados.                 |
| Seguridad a nivel de fila | Regla que limita cada consulta a las filas del cliente correcto.             |
| ISA-18.2                  | Norma de gestión de alarmas para industrias de proceso.                      |
| ThingsBoard               | Plataforma de IoT que recibe y administra datos de dispositivos.             |
| TimescaleDB               | Base de datos especializada en series temporales.                            |

*
