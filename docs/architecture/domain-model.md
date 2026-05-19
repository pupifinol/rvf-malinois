# RVF Malinois — Modelo de Dominio y Arquitectura de Datos

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

# Parte I — Principios del Modelo

## 1. Cómo Leer Este Documento

Este documento define el modelo de dominio y la arquitectura de datos de RVF Malinois: qué cosas existen en el sistema, cómo se relacionan y cómo se guardan para que la información sea confiable durante años. Es la base sobre la que se construirá todo lo demás; cuando exista código, este modelo será el contrato que ese código debe respetar.

Está escrito en lenguaje de negocio, no de programación. Cada entidad se explica primero por lo que significa para la operación de Well Testing y luego por los datos que guarda. Es conforme a los cinco documentos fundacionales, a las decisiones ADR-001 a ADR-004 y al P&ID del EMMAD-01 como fuente de verdad del equipo real.

**Qué NO es este documento.** No es el diseño de pantallas (eso está en UI/UX), ni la arquitectura de tiempo real (eso está en Ingeniería). Es el modelo de los datos: las “cosas” y sus reglas. Sin este modelo bien definido, cualquier código se construiría sobre suposiciones.

## 2. El Principio que Sostiene Todo el Modelo

> **Separar la cosa de su despliegue, y congelar una copia al momento del trabajo.** Un equipo EMMAD es un activo estable que se reutiliza. Desplegarlo en un pozo es un evento que ocurre, termina y es reemplazado por otro. Una lectura de telemetría pertenece a ese despliegue, no al equipo ni al pozo directamente. Y la configuración que explica qué significa esa lectura debe fotografiarse y congelarse en cada trabajo.

Los 34 puntos de este modelo son, en el fondo, expresiones de este único principio. Si se respeta, RVF Malinois sobrevive a la realidad de campo (equipos que se mueven, sensores que se reemplazan, clientes que coexisten) sin perder la capacidad de interpretar correctamente una prueba hecha hace dos años. Si se viola, el sistema se vuelve frágil y cada cambio de campo corrompe el historial.

**Por qué importa con un ejemplo.** Una prueba del pozo BL3-22 se hizo en marzo con el Pressure Scout PS-118 en cierto registro Modbus. En junio ese sensor se reemplazó por PS-140 con otro registro. Si el reporte de BL3-22 se reconstruye con la configuración de junio, los datos de marzo se interpretan mal y el reporte entregado a Repsol deja de ser fiel. La “foto por trabajo” (ADR-003/004) es lo que evita exactamente esto.

## 3. Las Tres Naturalezas de los Datos

Todo dato en RVF Malinois pertenece a una de tres naturalezas, y mezclarlas es el error de modelado más común. Cada una se guarda y se gobierna distinto:

| **Naturaleza** | **Qué es**                       | **Regla**                           | **Ejemplos**                                                |
|----------------|----------------------------------|-------------------------------------|-------------------------------------------------------------|
| Catálogo       | Cosas estables que se reutilizan | Editable; cambios afectan el futuro | Equipo EMMAD-01, sensor PS-118, pozo CN-014, cliente Repsol |
| Operación      | Eventos que ocurren y terminan   | Inmutable una vez cerrado           | Trabajo JOB-2026-0188, comisionamiento, evento operativo    |
| Telemetría     | Mediciones de alto volumen       | Solo se añade; nunca se edita       | Lectura de presión, alarma, salud de sensor                 |

**La regla práctica.** El catálogo cambia con el tiempo (se reemplaza un sensor). La operación se congela cuando el trabajo cierra (la prueba terminó; su configuración ya no se toca). La telemetría solo crece (jamás se reescribe una medición). Estas tres reglas, aplicadas con disciplina, dan la integridad histórica que exige una operación que le rinde cuentas a Repsol.

# Parte II — Entidades del Dominio

## 4. Mapa de Entidades y Relaciones

Este es el mapa completo del dominio. El color indica la naturaleza (catálogo, operación, telemetría) y las líneas, cómo se relacionan las entidades.

![Diagrama de dominio](./RVF_Malinois_Modelo_Dominio_media/media/bc4d0a18b8d1eaaef905d30673030d6a8d071ace.png)

*Diagrama — Modelo de dominio: entidades y relaciones*

**La columna vertebral.** El Trabajo (Job) es el centro de todo: conecta un Cliente, un Pozo y un Equipo durante un período, congela un Comisionamiento (snapshot) y es el dueño de toda la telemetría, alarmas y salud de sensores de esa prueba. Léase el diagrama de izquierda (catálogo) a derecha (telemetría), pasando siempre por el centro (operación).

## 5. Cliente / Empresa (multi-cliente)

Representa a cada empresa cliente de RVF (Repsol y futuros). Es la raíz del aislamiento entre clientes: todo dato cuelga, directa o indirectamente, de un cliente, y nadie ve datos de otro.

- **Qué guarda.** Identificador de cliente (tenant), nombre, configuración, y la región de residencia de datos (decisión de RVF por ADR-002, configurable por cliente por si un cliente futuro la exige).

- **Naturaleza.** Catálogo. Estable y editable; un cliente rara vez cambia.

- **Regla de oro.** El cliente de un dato no lo decide el navegador ni el mensaje: se deriva del servidor. Es la base del modelo de aislamiento (sección 18).

## 6. Pozo

El pozo físico que se prueba. Pertenece a un cliente. No es el equipo: el equipo se moviliza, el pozo es fijo.

- **Qué guarda.** Identificador de pozo (único dentro del cliente), cliente, sitio o campo, ubicación, tipo y fluido. Opcionalmente, límites de diseño de referencia del pozo.

- **Naturaleza.** Catálogo. Estable; un pozo existe más allá de una prueba puntual.

- **Relación clave.** Un pozo tiene muchos trabajos a lo largo del tiempo (se prueba varias veces, con distintos equipos). El historial de cada prueba vive en su trabajo, no “encima” del pozo.

## 7. Equipo de Well Testing (catálogo)

El activo reutilizable de RVF: una unidad EMMAD o EMGAD concreta, identificada por su serie. Esta es la entidad central de ADR-004. No es “un EMMAD” genérico; es el EMMAD-01 físico de RVF.

- **Qué guarda.** Identificador de equipo, número de serie, tipo (EMMAD/EMGAD), plantilla de tipo (el molde de qué lazos trae esa clase), y referencia a su P&ID de ingeniería (el del EMMAD-01 es la fuente de verdad de sus lazos: separador SG-EMMAD-01, control de nivel LIC-001, presión PIC-001, líneas de gas y líquido, corte de agua AT-004).

- **Naturaleza.** Catálogo. Se registra una vez y se reutiliza en todos los pozos a los que se moviliza.

- **Plantilla de tipo.** Un “EMMAD tipo” define los lazos esperables (incluye corte de agua y separador ciclónico); un “EMGAD tipo” no. La plantilla acelera el alta de equipos nuevos.

## 8. Sensor del Equipo

Cada instrumento montado en un equipo del catálogo. Es donde vive el mapeo que ADR-003 declaró configurable por la operación.

- **Qué guarda.** Identificador de sensor, tipo (Pressure Scout / Sentinel RTD / Wireless Totalizer / analizador de corte de agua), el registro Modbus del Gateway Stick por el que se lee, el rango del instrumento, el tag de instrumento del P&ID (p. ej. PIT-003) y el tag canónico al que mapea (p. ej. p_inlet).

- **Naturaleza.** Catálogo (pertenece al equipo). Editable: si se reemplaza físicamente el sensor, se edita aquí, una sola vez, y los trabajos futuros lo heredan.

- **Trazabilidad de tres tags (ADR-004).** tag de instrumento P&ID → sensor físico → tag canónico. Un auditor de Repsol puede seguir la cadena completa desde el plano de ingeniería hasta lo que vio el operador.

## 9. Dispositivo SignalFire

La realidad física de la adquisición inalámbrica (ADR-001): el sensor digitaliza la señal y la envía por la malla de 900 MHz al Gateway Stick, que la expone como Modbus. Esta entidad modela esa capa.

- **Qué guarda.** Identificador del dispositivo SignalFire, tipo, identificador de su Gateway Stick, parámetros de radio y batería, y su vínculo con el Sensor del Equipo que representa.

- **Naturaleza.** Catálogo para su identidad; su estado vivo (batería, RF, saltos) es telemetría (ver Salud de Sensor, sección 16).

- **Por qué es entidad propia.** Porque el sensor inalámbrico es la única fuente (no hay PLC de respaldo, ADR-001). Su salud es columna vertebral de integridad, no un detalle.

## 10. Diccionario de Tags Canónicos

La lista oficial y fija de variables de RVF. p_inlet siempre significa presión de entrada, en toda la plataforma, para siempre. Es lo que permite que reportes, alarmas, historiador e IA no dependan de qué hay en el campo.

- **Qué guarda.** Nombre canónico (fijo), nombre visible, unidad canónica, precisión (decimales), categoría (presión, temperatura, caudal, composición) y rango esperado.

- **Naturaleza.** Catálogo gobernado por RVF. Crece con cuidado (se añaden tags nuevos), pero el significado de un tag existente nunca cambia.

> **La distinción de ADR-003/004.** El diccionario canónico es fijo y de RVF. Lo flexible y configurable por la operación es el mapeo de cada sensor físico a estos tags, capturado por equipo y congelado por trabajo. Esa separación es el corazón de la flexibilidad sin pérdida de integridad.

## 11. Trabajo / Job

El contrato operativo y la columna vertebral del modelo: una unidad de RVF asignada a un pozo de un cliente durante un período. Toda la telemetría, alarmas y eventos pertenecen a un trabajo.

- **Qué guarda.** Identificador de trabajo, cliente, pozo, equipo del catálogo asignado, fechas de inicio y fin, ingeniero responsable y estado (programado, en curso, cerrado).

- **Naturaleza.** Operación. Mientras está en curso, ciertos campos cambian; una vez cerrado, es inmutable.

- **Por qué es el centro.** Vincular la telemetría al trabajo (y no al equipo ni al pozo) es lo que hace que la telemetría sobreviva a la movilización del equipo (sección 30) y se interprete siempre con la configuración correcta (su snapshot).

## 12. Comisionamiento (Snapshot)

La pieza que da integridad histórica (ADR-003/004). Al iniciar un trabajo, la operación comisiona el pozo: elige el equipo del catálogo, confirma sus sensores y registros, y fija los límites de alarma de ese pozo. El sistema toma una FOTO de toda esa configuración y la congela en el trabajo.

- **Qué guarda.** Identificador de snapshot, trabajo al que pertenece, copia congelada de la configuración del equipo en ese momento (cada sensor, su registro Modbus, su mapeo a tag canónico), límites de alarma del pozo para esa prueba, y fecha de comisionamiento.

- **Naturaleza.** Operación, estrictamente inmutable. Es una copia, no un enlace vivo al catálogo.

**La regla que protege el pasado.** Si el año próximo se edita el equipo en el catálogo, el snapshot del trabajo viejo no cambia. Por eso un reporte entregado a Repsol se lee hoy exactamente como el día en que se generó. El catálogo da comodidad; el snapshot da verdad histórica.

## 13. Lectura de Telemetría

Cada medición que llega del campo. Es el dato de mayor volumen del sistema y su modelo es deliberadamente simple y “largo” (una fila por medición).

- **Qué guarda.** Marca de tiempo en UTC (medida en el borde), trabajo al que pertenece, tag canónico, valor, calidad, número de secuencia y el sensor de origen.

- **Naturaleza.** Telemetría. Solo se añade (append-only); una medición jamás se edita ni se borra.

- **Vínculo clave.** Pertenece a un trabajo. A través del trabajo se llega a su snapshot, que explica qué significaba ese tag en esa prueba. La lectura es “tonta”; el snapshot le da sentido.

## 14. Modelo de Calidad de Telemetría

La calidad es un atributo de primera clase de cada lectura, no un añadido. Es lo que permite no mentir sobre el dato (principio recurrente de toda la fundación).

| **Calidad** | **Significado**                       | **Cómo se trata**                       |
|-------------|---------------------------------------|-----------------------------------------|
| good        | Dato válido del sensor                | Normal                                  |
| estimated   | Calculado/derivado, no medido directo | Se muestra marcado; usable con criterio |
| uncertain   | Sensor dudoso                         | Atenuado; no para decisiones críticas   |
| bad         | Sensor en falla                       | Nunca como bueno; no entra a la IA      |
| stale       | Sin reportar a tiempo (anti-stale)    | Gris “sin dato hace X”; no es cero      |

La calidad viaja con la lectura desde el borde (Node-RED la evalúa) y se conserva para siempre en el historiador. Un dato malo de un Pressure Scout sin batería queda marcado como malo en 2026 y se sigue leyendo como malo en 2030.

## 15. Alarmas y Eventos de Alarma

Una alarma es una condición que requiere atención del operador. Tiene ciclo de vida (ISA-18.2): nace activa, se reconoce, se normaliza. Pertenece a un trabajo.

- **Qué guarda.** Identificador de alarma, trabajo, fuente (tag canónico), condición (LO_LO, LO, HI, HI_HI, sin dato), severidad, valor que la disparó, límite violado, y el estado con su historia (activa, reconocida, normalizada, en estante).

- **Naturaleza.** Telemetría/operación: los eventos del ciclo de vida solo se añaden (historial inmutable de alarmas); el estado actual se deriva de ellos.

- **Aclaración de alcance (ADR-001/004).** Las alarmas son informativas y operativas: avisan al operador. No son un sistema instrumentado de seguridad y no accionan el equipo. El límite que dispara una alarma sale del snapshot del trabajo, no del catálogo actual.

## 16. Salud de Sensor

El estado vivo de cada dispositivo SignalFire: batería, señal RF, saltos en la malla, última lectura. Es crítico porque el sensor es la única fuente (ADR-001).

- **Qué guarda.** Sensor, trabajo, marca de tiempo, porcentaje de batería, intensidad RF, número de saltos y hace cuánto reportó.

- **Naturaleza.** Telemetría (serie temporal de salud), separada de la telemetría de proceso para no contaminar las alarmas operativas.

- **Por qué entidad propia.** Una batería agotada se ve, en el resto del sistema, igual que un pozo que dejó de producir. Esta entidad permite distinguir “el pozo cambió” de “el sensor murió”.

## 17. Evento Operativo

Hechos puntuales de la operación que no son mediciones ni alarmas: inicio de prueba, cambio de choke, fin de prueba. Dan contexto al historial y alimentan el reporte.

- **Qué guarda.** Identificador, trabajo, tipo de evento, marca de tiempo, y contexto (p. ej. tamaño de choke nuevo, operador).

- **Naturaleza.** Operación, append-only. Forman la línea de tiempo del trabajo.

## 18. Usuarios y Permisos

Quién puede ver y hacer qué. El rol y el alcance al cliente son independientes (un rol RVF ve varios clientes; un rol de cliente, solo el suyo).

- **Qué guarda.** Usuario, organización a la que pertenece (RVF o un cliente), roles asignados, y el alcance de clientes/pozos que puede ver.

- **Naturaleza.** Catálogo (con su propio historial de cambios en auditoría).

- **Roles (de la Fundación Técnica).** Operaciones RVF, ingeniero de campo RVF, analista RVF, administrador RVF; y del lado cliente: administrador de cliente, visor de cliente, API de cliente. Menor privilegio siempre.

## 19. Auditoría

El registro inmutable de quién hizo qué, cuándo y desde dónde. Es lo que da confianza a un cliente como Repsol y respalda la trazabilidad operativa.

- **Qué guarda.** Quién, qué acción, cuándo, sobre qué entidad, valor anterior y nuevo, cliente y correlación. Eventos: ingreso, reconocimiento de alarma, cambio de límite, comisionamiento, exportación de datos, accesos del cliente.

- **Naturaleza.** Append-only, estrictamente inmutable. Nunca se edita ni se borra; sin secretos ni datos personales en el registro.

## 20. Extensibilidad Futura para PLC

Por ADR-001, hoy no hay PLC, pero está previsto como origen adicional. El modelo ya lo soporta sin rediseño.

- **Cómo encaja.** Un PLC futuro será otra fuente de origen para la entidad Sensor del Equipo: en vez de “registro del Gateway Stick”, el sensor tendría “origen = PLC, dirección Modbus/OPC-UA”. El mapeo al tag canónico es idéntico.

- **Por qué no rompe nada.** Aguas arriba (trabajo, snapshot, telemetría, alarmas, historiador, IA) todo opera sobre tags canónicos. El origen del dato es un detalle de la entidad Sensor; cambiarlo no toca el resto del modelo.

> **Esto es un punto de extensión, no deuda.** Añadir PLC mañana es agregar un tipo de origen a una entidad existente y mapearlo al diccionario canónico. El modelo se diseñó para que ese día sea una configuración, no una reingeniería.

# Parte III — Arquitectura de Base de Datos

## 21. PostgreSQL — Esquema Relacional

Dos motores, cada uno para lo que hace mejor (coherente con la Fundación Técnica): PostgreSQL para el mundo estructurado (catálogo y operación) y TimescaleDB para la telemetría de alto volumen.

```
PostgreSQL (esquema relacional) — catálogo y operación
tenants clientes / empresas
wells pozos (por tenant)
equipment equipos Well Testing (catálogo, ADR-004)
equipment_sensors sensores del equipo + registro + mapeo tag
signalfire_devices dispositivos inalámbricos + gateway
tag_dictionary tags canónicos (fijo, de RVF)
jobs trabajos (unidad+pozo+cliente+período)
commissioning SNAPSHOT inmutable por trabajo
operational_events línea de tiempo del trabajo
alarms / alarm_log alarmas y su ciclo de vida
users / roles usuarios, roles, alcance
audit_log auditoría inmutable
TimescaleDB (hipertablas) — telemetría
telemetry ts, job_id, tag, valor, calidad, seq, sensor
sensor_health ts, job_id, sensor, batería, RF, saltos
```

## 22. Qué Vive en PostgreSQL

Todo lo que es relación, identidad e integridad referencial: clientes, pozos, el catálogo de equipos y sus sensores, el diccionario de tags, los trabajos, los snapshots de comisionamiento, las definiciones y el ciclo de vida de alarmas, usuarios y auditoría.

- **Por qué aquí.** Estos datos tienen relaciones estrictas (un sensor pertenece a un equipo; un trabajo a un cliente y un pozo) y requieren reglas que la base hace cumplir: llaves foráneas, unicidad y aislamiento por cliente.

- **Volumen moderado, integridad alta.** Son miles de filas, no miles de millones. Lo importante aquí es la corrección, no la velocidad de ingesta masiva.

## 23. Qué Vive en TimescaleDB

Solo la telemetría: las lecturas de proceso y la salud de sensores. Es el dato de altísimo volumen (cada pocos segundos, por cada tag, por cada pozo).

- **Por qué separado.** TimescaleDB está hecho para series temporales: comprime muy bien, agrega por tiempo (resúmenes por minuto y hora) y permite consultas rápidas por rango. Mezclarlo con el catálogo degradaría ambos.

- **Append-only.** Una lectura jamás se edita. Esto habilita la compresión y los agregados continuos que alimentan los gráficos rápidos (downsampling de la Fundación Técnica).

- **El vínculo es el job_id.** Cada lectura lleva el identificador de trabajo; ese es el puente hacia el mundo relacional (snapshot, pozo, cliente).

## 24. Relaciones y Llaves Foráneas

Las relaciones que la base de datos debe hacer cumplir para que el modelo no se corrompa:

| **Relación**                    | **Regla**                                      |
|---------------------------------|------------------------------------------------|
| Pozo → Cliente                  | Todo pozo pertenece a un cliente               |
| Equipo → (catálogo RVF)         | El equipo es activo de RVF, no de un cliente   |
| Sensor → Equipo                 | Todo sensor pertenece a un equipo del catálogo |
| Sensor → Tag canónico           | Todo sensor mapea a un tag del diccionario     |
| Trabajo → Cliente, Pozo, Equipo | Un trabajo une los tres durante un período     |
| Snapshot → Trabajo              | Exactamente un snapshot inmutable por trabajo  |
| Telemetría → Trabajo            | Toda lectura pertenece a un trabajo            |
| Alarma → Trabajo                | Toda alarma pertenece a un trabajo             |

**La llave que todo lo sostiene.** job_id está en la telemetría, las alarmas y la salud de sensores. Es el único puente entre el dato crudo y todo su contexto (qué equipo, qué configuración, qué pozo, qué cliente). Sin esa llave, una lectura sería un número sin historia.

## 25. Estrategia de Versionado Histórico

El versionado no se hace “versionando filas” en el catálogo, sino congelando el contexto en el trabajo. Es más simple y más fiel a la operación.

- **El catálogo no guarda historia de sí mismo.** Si se reemplaza un sensor, el catálogo refleja el estado actual. No necesita recordar todas sus versiones.

- **El trabajo guarda la historia que importa.** Cada trabajo tiene su snapshot: la foto exacta de cómo estaba el equipo cuando se midió. La “versión” de la configuración es, en la práctica, “la del trabajo X”.

- **Resultado.** Para saber cómo se interpretaba un dato de marzo, no se reconstruye el pasado del catálogo: se lee el snapshot del trabajo de marzo. Simple y a prueba de errores.

## 26. Lo que NUNCA Debe Ser Mutable

1.  Una lectura de telemetría ya escrita (valor, calidad, marca de tiempo). Jamás se edita ni se borra.

2.  El snapshot de comisionamiento de un trabajo. Es la foto que protege el pasado.

3.  El registro de auditoría. Append-only, sin excepciones.

4.  Un trabajo cerrado. Una vez finalizada la prueba, su definición y su contexto se congelan.

5.  El historial del ciclo de vida de una alarma (cuándo se activó, se reconoció, se normalizó).

6.  El significado de un tag canónico existente. p_inlet siempre fue y será presión de entrada.

## 27. Lo que Sí Es Editable

7.  El catálogo de equipos y sus sensores: reemplazar un Pressure Scout, ajustar un registro o un rango (afecta trabajos futuros, no los pasados).

8.  Los datos de un pozo o un cliente (nombre, ubicación, configuración).

9.  Un trabajo mientras está en curso (antes de cerrarse).

10. Usuarios, roles y alcances (todo cambio queda en auditoría).

11. Añadir nuevos tags al diccionario canónico (sin alterar el significado de los existentes).

## 28. Cómo Funcionan los Snapshots de Comisionamiento

![Diagrama de dominio](./RVF_Malinois_Modelo_Dominio_media/media/4a347d28ac6285355fdde269632342a6b9a45ad8.png)

*Diagrama — Integridad histórica: “foto por trabajo” (ADR-003/004)*

12. La operación inicia un trabajo y comisiona el pozo: elige el equipo del catálogo.

13. El sistema copia (no enlaza) la configuración actual del equipo: cada sensor, su registro Modbus, su mapeo a tag canónico, y los rangos.

14. La operación fija los límites de alarma de ese pozo para esa prueba.

15. Todo eso se guarda como un snapshot inmutable, fechado, atado al trabajo.

16. A partir de ahí, toda la telemetría del trabajo se interpreta con ese snapshot, aunque el catálogo cambie después.

## 29. Cómo se Vincula la Telemetría al Trabajo

Cada lectura que llega del campo se etiqueta con el identificador del trabajo activo del equipo que la originó. Node-RED conoce el trabajo en curso (definido al comisionar) y lo incluye en cada mensaje.

- **La cadena.** Lectura → trabajo → snapshot (qué significaba) y → pozo y cliente (de quién es). Una sola llave, job_id, abre toda esa cadena.

- **Sin el trabajo, la lectura es huérfana.** Por eso ninguna lectura se acepta sin trabajo asociado: una medición sin contexto no es información, es ruido.

## 30. Cómo Sobrevive la Telemetría a la Movilización

Este es el escenario que el modelo está diseñado para resolver, y la prueba de que el principio de la sección 2 funciona:

17. El equipo EMMAD-01 prueba el pozo BL3-22 bajo el trabajo JOB-0140. Toda su telemetría lleva job_id = JOB-0140.

18. La prueba termina; JOB-0140 se cierra con su snapshot congelado.

19. El EMMAD-01 se moviliza al pozo CN-014 bajo un trabajo nuevo, JOB-0188, con su propio snapshot (quizá ya con el sensor reemplazado).

20. La telemetría nueva lleva job_id = JOB-0188.

21. Años después, la telemetría de BL3-22 sigue intacta y se interpreta con el snapshot de JOB-0140; la de CN-014, con el de JOB-0188. El mismo equipo físico, dos historias separadas y fieles.

**Conclusión.** Como la telemetría pertenece al trabajo y no al equipo ni al pozo, mover el equipo no mezcla ni corrompe nada. Esa es, en una frase, la razón de ser de todo este modelo.

# Parte IV — Servicios, API y Futuro

## 31. Fronteras de los Servicios Backend

El backend se organiza en módulos por responsabilidad (monolito modular de la Fundación Técnica), alineados con las entidades:

- **Catálogo.** Clientes, pozos, equipos, sensores, diccionario de tags. Lecturas frecuentes, escrituras controladas.

- **Operación.** Trabajos, comisionamiento (snapshots), eventos operativos. Aquí vive la regla de inmutabilidad al cerrar.

- **Telemetría e historiador.** Ingesta append-only, consulta por rango con downsampling, salud de sensores.

- **Alarmas.** Evaluación, ciclo de vida, notificación.

- **Identidad y auditoría.** Usuarios, roles, aislamiento por cliente, registro inmutable.

- **Adaptador de plataforma IoT.** La envoltura de ThingsBoard; el resto del sistema no la conoce.

## 32. Fronteras de la API

- **Por entidad y por trabajo.** La API expone catálogo (equipos, pozos), operación (trabajos, comisionamiento) y consultas de telemetría siempre acotadas a un trabajo o a un rango.

- **Alcance de cliente forzado en el servidor.** Toda consulta se filtra por el cliente del usuario autenticado; nunca se confía en lo que pida el navegador.

- **Lectura y escritura separadas.** El catálogo y la operación se escriben con validación estricta; la telemetría es solo lectura desde el frontend (ingesta es interna).

- **Contrato versionado.** La forma de los datos (el modelo de este documento) es el contrato; cambia de forma controlada y compatible.

## 33. Cómo Consume el Frontend el Modelo

- **El frontend nunca arma el contexto.** Pide “la telemetría del trabajo X” y el backend ya resuelve, vía el snapshot, qué significa cada tag, sus límites y su calidad. La pantalla no recalcula reglas de negocio.

- **El snapshot alimenta la pantalla de pozo.** Los límites de alarma, los nombres y las unidades que ve el operador salen del snapshot del trabajo, no del catálogo actual: lo que ve es fiel a esa prueba.

- **El catálogo alimenta el comisionamiento.** Las pantallas de alta de equipo y de comisionamiento (UI/UX, ADR-004) leen y escriben el catálogo y crean el snapshot.

## 34. Estructuras Preparadas para IA

La IA llega después, pero el modelo ya la habilita sin rediseño (coherente con la Fundación Técnica):

- **Telemetría limpia y etiquetada.** La calidad por lectura permite que la IA entrene solo con datos buenos; el job_id le da el contexto (qué equipo, qué pozo, qué configuración).

- **Los eventos operativos son etiquetas.** Cambios de choke, intervenciones y fines de prueba son las etiquetas que un modelo necesita para aprender (p. ej. predecir corte de agua).

- **El snapshot da reproducibilidad.** Un modelo puede reconstruir exactamente las condiciones de cualquier prueba pasada, porque el snapshot las congeló.

- **Resultados como datos nuevos, no sobre el original.** Las predicciones se guardan como registros propios con su procedencia (qué modelo, qué datos), nunca sobreescribiendo la telemetría.

## 35. Glosario del Modelo

| **Término**        | **Significado**                                                      |
|--------------------|----------------------------------------------------------------------|
| Entidad            | Una “cosa” del dominio que el sistema guarda (pozo, equipo, trabajo) |
| Catálogo           | Datos estables y reutilizables; editables, afectan el futuro         |
| Operación          | Eventos que ocurren y se cierran; inmutables una vez cerrados        |
| Telemetría         | Mediciones de alto volumen; solo se añaden, nunca se editan          |
| Trabajo (Job)      | Equipo + pozo + cliente durante un período; dueño de la telemetría   |
| Comisionamiento    | Acto de desplegar un equipo en un pozo y configurar la prueba        |
| Snapshot           | Copia congelada e inmutable de la configuración por trabajo          |
| Tag canónico       | Nombre oficial y fijo de una variable (p_inlet)                      |
| Tag de instrumento | Código del P&ID del equipo (PIT-003)                                 |
| Calidad            | Estado de una lectura: good, estimated, uncertain, bad, stale        |
| Append-only        | Solo se puede añadir; nunca editar ni borrar                         |
| Inmutable          | Que no puede cambiar una vez creado                                  |
| Llave foránea      | Vínculo que la base hace cumplir entre dos entidades                 |
| job_id             | La llave que une cada lectura con todo su contexto                   |
| Multi-cliente      | Varios clientes en un sistema con datos aislados                     |
| PostgreSQL         | Base de datos relacional: catálogo y operación                       |
| TimescaleDB        | Base de datos de series temporales: telemetría                       |

*
