# RVF Malinois — Arquitectura General y Estrategia de Evolución

> Documento de arquitectura de RVF Malinois — RVF Soluciones Energéticas C.A.
> Convertido a Markdown para uso con Claude Code. Confidencial.

## 1. Resumen Ejecutivo

Este documento define la arquitectura técnica y la estrategia para convertir el MVP operativo actual de RVF en una plataforma industrial profesional llamada RVF Malinois. El objetivo no es reconstruir desde cero, sino evolucionar de forma ordenada lo que ya funciona, preservando la inversión y la experiencia de campo que RVF ya tiene.

**Punto de partida sólido.** RVF ya cuenta con unidades portátiles de well testing, ingenieros de automatización industrial, experiencia de comisionado en sitio, comunicación satelital y un MVP de monitoreo remoto funcionando sobre Node-RED y ThingsBoard. Esa es la parte difícil, y ya está resuelta. Lo que falta es principalmente software, marca y madurez empresarial.

**Veredicto estratégico.** Conservar la capa de campo y borde, conservar ThingsBoard como motor de IoT, y construir RVF Malinois como una capa de aplicación con marca propia por encima de ThingsBoard, envolviéndolo detrás de una API propia para que sea un servicio del que dependemos y no el producto en sí.

**Posicionamiento del producto.** RVF Malinois es un activo y una capacidad de RVF Soluciones Energéticas. El usuario primario es el equipo de operaciones de RVF. El cliente (Repsol hoy, otros mañana) es un usuario secundario, de solo lectura y limitado a sus propios pozos. El software no se vende por licencia: es el diferenciador competitivo que hace que el servicio de well testing de RVF valga más y sea más difícil de reemplazar.

**Horizonte realista.** Desde el MVP actual hasta una plataforma con marca, desplegada para Repsol, con una primera versión de inteligencia artificial y un segundo cliente en piloto: del orden de nueve a doce meses con un equipo pequeño y enfocado.

## 2. Contexto de Negocio y Posicionamiento del Producto

Es fundamental entender la naturaleza comercial del proyecto, porque define las prioridades técnicas.

- RVF Soluciones Energéticas C.A. es la dueña del software RVF Malinois. Es un activo y una capacidad propia de la empresa.

- Repsol otorgó a RVF un contrato de well testing: un contrato de servicio para medir parámetros de producción de pozos con las unidades portátiles de RVF. No es un contrato de software.

- RVF Malinois es la herramienta con la que el equipo de RVF monitorea esas mediciones durante la prestación del servicio.

- A Repsol se le da acceso al software como valor agregado del servicio, para que también pueda ver en tiempo real los parámetros de sus propios pozos.

- Conclusión: el software es primero de RVF y, en segundo lugar, un portal de visualización para el cliente (Repsol hoy; otros clientes en el futuro).

**Implicación comercial.** RVF Malinois no es un producto que se vende por licencia, sino el elemento que hace que el servicio de well testing de RVF sea superior y más difícil de sustituir. Cuando el cliente puede ver sus pozos en tiempo real con la plataforma de RVF, cambiar de proveedor de well testing implica perder esa visibilidad. El software ayuda a ganar contratos de servicio, a mejorar el precio del servicio y a retener al cliente. Esa es la justificación de negocio para invertir en él.

**Puerta abierta a futuro.** Como la arquitectura será multi-cliente desde el diseño, en el futuro RVF podría ofrecer RVF Malinois como software como servicio (SaaS) a otras empresas de servicios petroleros. No es el modelo de hoy, pero la arquitectura no cierra esa opción de expansión.

## 3. Situación Actual: el MVP Operativo

El MVP actual ya es capaz de monitorear remotamente parámetros operativos desde el campo. Está compuesto por:

- Unidades portátiles de well testing que miden presión y temperatura de entrada y salida, caudal de petróleo y de gas, producción diaria de petróleo, relación gas-petróleo (GOR), corte de agua, y alarmas y eventos operativos.

- Una pasarela (gateway) industrial de borde que ejecuta Node-RED y lee los datos de los instrumentos y del PLC del equipo.

- Comunicación por internet satelital desde el sitio del pozo hacia la nube.

- ThingsBoard en la nube, que recibe los datos por MQTT, los almacena y los presenta en tableros.

Esta base es valiosa y no debe desecharse. La estrategia de evolución se construye sobre ella, no en su contra.

## 4. Veredicto Estratégico: Conservar, Evolucionar, Construir

Cada componente del sistema se clasifica en una de tres categorías. Esto evita reconstruir lo que ya funciona y concentra el esfuerzo donde realmente se crea valor y propiedad intelectual.

| **Categoría**   | **Componentes**                                                                                      | **Acción**                                                                                    |
|-----------------|------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Conservar       | Equipo de campo, PLC e instrumentación, Node-RED en el borde, enlace satelital, comisionado en sitio | Ya funciona en producción. Refinar, no reconstruir.                                           |
| Evolucionar     | ThingsBoard, broker MQTT, modelo de alojamiento en la nube                                           | Se mantiene la plataforma, pero madura hacia un esquema empresarial autoalojado y endurecido. |
| Construir nuevo | Aplicación con marca RVF Malinois, API de negocio, base de datos de negocio, motor de IA, app móvil  | Aquí vive el producto, la marca y la propiedad intelectual. Es lo nuevo a desarrollar.        |

**Principio rector.** El MVP actual sigue operando, plenamente funcional, hasta que la nueva plataforma esté lista para reemplazarlo. No hay migración de un solo golpe; la transición es gradual y reversible.

## 5. Arquitectura Objetivo

La arquitectura objetivo se organiza en tres capas, de abajo hacia arriba: la capa de campo y borde, el motor de IoT, y la plataforma de aplicación RVF Malinois. Los datos fluyen desde el equipo en el pozo, suben por el motor de IoT y llegan a la plataforma donde los usuarios los consultan.

5.1 Capa de campo y borde (Conservar)

Es el mundo físico: los sensores y el PLC de la unidad de well testing, la pasarela de borde con Node-RED que traduce y almacena los datos localmente, y el enlace satelital o celular que los transporta cifrados hacia la nube. Si el enlace se cae, la pasarela guarda todo localmente y lo reenvía cuando la conexión regresa. Esta capa es la fortaleza actual de RVF y no se rediseña.

5.2 Motor de IoT (Evolucionar)

ThingsBoard sigue siendo el motor que recibe los datos por MQTT, administra los dispositivos y almacena la telemetría. Lo que cambia es cómo se usa: se autoalojará en la nube de RVF, se endurecerá para uso empresarial, y dejará de ser la cara visible para el cliente.

5.3 Plataforma RVF Malinois (Construir nuevo)

Es la capa donde RVF deja de ser “un integrador con un montaje de Node-RED” y pasa a ser una empresa con un producto. Aquí vive la interfaz con marca, la lógica de negocio, los reportes, la administración de clientes y, más adelante, la inteligencia artificial. Todo lo que RVF vende, marca y posee como propiedad intelectual reside en esta capa.

## 6. Modelo de Acceso y Multi-cliente

El usuario primario y más importante del software es el equipo de operaciones de RVF, no el cliente. El cliente es un usuario secundario, de solo lectura, con alcance limitado a sus propios pozos. El modelo es jerárquico: RVF como operador y dueño con acceso total; la plataforma RVF Malinois en el medio, multi-cliente y con datos aislados; y abajo cada cliente entrando únicamente a sus pozos.

6.1 Las dos experiencias dentro del mismo sistema

**Herramienta interna de RVF (la más importante).** El equipo de operaciones y de campo monitorea todas las unidades de well testing, en todos los pozos, de todos los clientes, a la vez. Configura unidades, gestiona calibraciones, administra alarmas, da mantenimiento y genera los reportes del servicio. Es rica, operativa y es el corazón del producto: es lo que hace que el servicio de RVF sea mejor que el de la competencia.

**Portal del cliente (la vitrina).** El cliente entra y ve únicamente sus pozos, en tiempo real, con una vista limpia y profesional, en modo de solo lectura. No ve datos de otros clientes, no configura nada y no toca la operación. Es una ventana pulida hacia el servicio que RVF ya está prestando.

6.2 Modelo de roles

| **Rol**                  | **Quién**                  | **Acceso**                                                             |
|--------------------------|----------------------------|------------------------------------------------------------------------|
| RVF Admin                | Administración de RVF      | Control total: usuarios, clientes, configuración global, facturación.  |
| RVF Operaciones          | Centro de monitoreo de RVF | Todos los pozos de todos los clientes; alarmas, reportes, operación.   |
| RVF Campo                | Ingenieros en sitio        | Unidades asignadas; calibración, mantenimiento, comisionado.           |
| Cliente-Visor            | Repsol y futuros clientes  | Solo lectura, solo sus propios pozos; vista ejecutiva y operativa.     |
| Cliente-Admin (opcional) | Responsable del cliente    | Gestiona los usuarios de su propia empresa; sin acceso a la operación. |

6.3 Aislamiento de datos entre clientes

Como un mismo sistema sirve a varios clientes que pueden ser competidores entre sí, que un cliente jamás vea los pozos de otro no es una buena práctica: es una obligación contractual y de reputación. El aislamiento por cliente debe construirse en cada consulta a la base de datos desde el primer día, mediante políticas de seguridad a nivel de fila (row-level security) en PostgreSQL, y no como un agregado posterior, porque incorporarlo después es extremadamente costoso y riesgoso.

## 7. Capa de Campo y Borde: el rol de Node-RED

Node-RED se conserva. Es la herramienta correcta para el borde: es visual, los ingenieros la entienden, y es mantenible en campo. No se rediseña la arquitectura aquí; se refina.

- **Esquema único de mensajes MQTT.** Definir una estructura JSON única (identificador de pozo, marca de tiempo, variable, valor, unidad, indicador de calidad, estado de alarma) y aplicarla en todas las pasarelas. Esto se convierte en el contrato entre el borde y la nube.

- **Capa de alarmas en el borde.** Node-RED debe poder disparar alarmas básicas localmente aunque el enlace satelital esté caído (por ejemplo, una luz o una sirena en la unidad cuando la presión cruza un umbral).

- **Actualización remota de flujos.** Con más de diez unidades en campo, actualizar la lógica visitando sitio por sitio es insostenible. Se necesita un mecanismo de actualización remota de los flujos de Node-RED.

- **Almacenamiento local verificado.** Probar el comportamiento con cuarenta y ocho horas de desconexión. Para sitios dependientes de satélite, la pasarela debe poder almacenar días de datos, no minutos.

Son refinamientos, no reconstrucciones: semanas de trabajo, no meses.

## 8. Motor de IoT: cómo evoluciona ThingsBoard

Esta es la decisión arquitectónica más importante del proyecto. Se conserva ThingsBoard, pero se cambian tres cosas en la forma de usarlo.

- **Migrar a ThingsBoard autoalojado (Edición Profesional).** ThingsBoard Cloud es adecuado para un MVP, pero los clientes grandes exigen saber dónde residen físicamente los datos, certificaciones de seguridad y la posibilidad de autoalojamiento. ThingsBoard PE autoalojado en la nube de RVF (AWS o Azure) responde a esas exigencias y aporta marca propia, reglas avanzadas y soporte empresarial.

- **Dejar de usar los tableros de ThingsBoard como interfaz del cliente.** Los tableros de ThingsBoard son perfectos para uso interno y depuración, pero nunca serán la experiencia pulida y con marca RVF Malinois que un cliente como Repsol espera ver. El cliente nunca entra a ThingsBoard; entra a RVF Malinois.

- **Tratar a ThingsBoard como un servicio detrás de una API propia.** La aplicación de RVF Malinois nunca llama directamente a ThingsBoard; llama a la API propia de RVF, y esa API llama a ThingsBoard internamente. Esta separación es la decisión más importante de toda la evolución.

## 9. La Capa de Aplicación RVF Malinois

Aquí se construye el producto. Todo lo que RVF vende, marca y posee como propiedad intelectual reside en esta capa. La pila tecnológica recomendada es moderna, madura y sin elecciones exóticas:

- Aplicación web con Next.js (React) y Tailwind CSS, totalmente con marca RVF Malinois. Es la superficie que ve el cliente.

- API de negocio con Node.js y TypeScript usando NestJS, cuyas convenciones estructuran el trabajo cuando hay varios desarrolladores.

- PostgreSQL como base de datos de negocio: clientes, usuarios, pozos, contratos, definiciones de alarmas, plantillas de reportes, registros de auditoría y facturación.

- TimescaleDB (extensión de PostgreSQL) como espejo de la telemetría crítica que la plataforma consulta directamente para reportes y para la IA.

- Redis para almacenamiento en caché y mensajería interna entre servicios.

- AWS o Azure como nube, según prefiera el área de tecnología del cliente; región europea para residencia de datos si así se requiere.

- Clerk, Auth0 o WorkOS para autenticación, incluyendo inicio de sesión único (SSO/SAML) para clientes empresariales.

- Sentry, Grafana y Loki para observabilidad: en un sistema industrial hay que enterarse de cada fallo.

## 10. El Patrón de Envoltura (Wrapper)

La aplicación de RVF Malinois habla únicamente con la API propia de RVF. Esa API habla internamente con ThingsBoard. Nada de la aplicación visible para el cliente queda acoplado a la forma de la API de ThingsBoard.

En la práctica, dentro de la API de negocio se construye un servicio —llamémoslo Servicio de Plataforma IoT— con funciones como “obtener última telemetría del pozo”, “suscribirse a alarmas” o “dar de alta una pasarela”. Hoy, esas funciones llaman a ThingsBoard por debajo. Si en el futuro hay que migrar a otra tecnología —por exigencia de un cliente o por escala— solo cambia ese servicio; toda la aplicación visible para el cliente permanece intacta.

Este patrón también permite empezar a copiar la telemetría crítica a la base de datos TimescaleDB propia, por dos razones: las canalizaciones de IA trabajan sobre datos propios sin saturar la capa de IoT, y los datos históricos se preservan para siempre en un formato controlado por RVF, sin depender de lo que ocurra con ThingsBoard.

## 11. Integración MQTT a Nivel Empresarial

MQTT ya funciona; el trabajo es endurecerlo para uso empresarial:

- **Estructura de temas única y versionada.** Algo como rvfmalinois/v1/\<cliente\>/\<sitio\>/\<pozo\>/\<unidad\>/\<variable\>. Versionar el esquema en el tema permite evolucionar sin romper las pasarelas ya desplegadas.

- **TLS mutuo con certificado por dispositivo.** Cada pasarela tiene su propio certificado. Si una se pierde o es robada, se revoca ese certificado en lugar de cambiar una contraseña compartida en toda la flota.

- **Calidad de servicio adecuada.** QoS 1 para telemetría (se deduplica por marca de tiempo) y QoS 2 solo para comandos.

- **Mensajes retenidos y testamento (LWT).** Un cliente recién conectado ve de inmediato el último valor de cada variable; y si una pasarela se desconecta de forma inesperada, el broker publica automáticamente un aviso de “dispositivo fuera de línea”.

- **Presupuesto de ancho de banda satelital.** Comprimir o agrupar lecturas en el borde con Node-RED cuando el ancho de banda sea limitado.

## 12. Arquitectura de Datos

Tres bases de datos, tres funciones distintas:

- **Base interna de ThingsBoard.** Telemetría operativa, estado de dispositivos y estado del motor de reglas. La administra ThingsBoard.

- **TimescaleDB propia.** El espejo de telemetría a largo plazo, consultable y listo para IA. Es de donde leen los reportes, los tableros y los modelos. Retención: indefinida, mientras sea comercialmente viable.

- **PostgreSQL de negocio.** Todo lo que no es serie temporal: usuarios, clientes, pozos, contratos, reglas de alarma, plantillas de reportes, auditoría y facturación.

Se usa ThingsBoard como fuente de verdad para los valores en vivo y la TimescaleDB propia para todo lo histórico y analítico, delimitando con claridad cuál es cuál para que el cliente nunca vea un número que difiera entre el tablero en vivo y un reporte.

## 13. Estrategia de Inteligencia Artificial

La IA es una capa que lee de la TimescaleDB propia y escribe recomendaciones en la base de datos de negocio. No vive dentro de ThingsBoard ni de Node-RED; vive como microservicios en Python, en un carril de escalado separado del flujo de datos en vivo. La secuencia realista de introducción es:

1.  Meses 1 a 3: no se construye IA todavía. Se construye bien la base de datos para que la IA sea posible después; se copia la telemetría a TimescaleDB desde el primer día con la metadata que la IA necesitará.

2.  Meses 4 a 6: detección de anomalías como primera función de IA. Métodos estadísticos sencillos aportan el 80% del valor; no hace falta aprendizaje profundo.

3.  Meses 6 a 9: análisis de curvas de declinación y ranking de desempeño de pozos. Son técnicas de ingeniería de petróleo bien conocidas, con valor demostrable para el cliente.

4.  Meses 9 a 12: predicción de corte de agua por pozo. Es la primera función que requiere experiencia de dominio; conviene apoyarse en un ingeniero de petróleo.

5.  Año 2: recomendaciones de optimización. El control de lazo cerrado (que la IA accione válvulas) no está en la hoja de ruta: es otra categoría de producto y otra conversación regulatoria.

**Punto no obvio.** La mayor victoria temprana de IA probablemente no esté en la optimización de producción, sino en la reducción de la fatiga de alarmas. Una IA que suprime las alarmas falsas y resalta solo las significativas es genuinamente transformadora y mucho más fácil de construir. Es un argumento que el cliente entiende de inmediato.

## 14. Hoja de Ruta de Transición (Fases A–G)

El principio crítico: el MVP actual sigue operando hasta que la nueva plataforma esté lista para reemplazarlo. Sin migraciones de un solo golpe.

| **Fase**                | **Duración** | **Qué ocurre**                                                                                                    | **Estado del MVP**        |
|-------------------------|--------------|-------------------------------------------------------------------------------------------------------------------|---------------------------|
| A — Fundación           | 4–6 sem.     | ThingsBoard PE autoalojado en paralelo. Esqueleto de la app Next.js y la API. Esquema MQTT v1.                    | Sin tocar, en producción. |
| B — Plataforma paralela | 8–10 sem.    | Interfaz con marca replica el tablero actual. Espejo a TimescaleDB. Motor de alarmas, usuarios, reportes básicos. | Operando como respaldo.   |
| C — Cambio (cutover)    | 4 sem.       | Un pozo piloto opera 100% sobre RVF Malinois. Migración de pasarelas a ThingsBoard PE.                            | Retirado para ese pozo.   |
| D — Despliegue          | 6–8 sem.     | Migración del resto de pozos. Reportes, PDF, correos. Segundo equipo del cliente.                                 | Retirado por completo.    |
| E — Empresarial         | Meses 5–8    | SSO/SAML, auditoría, administración de clientes, app móvil, API para sistemas del cliente.                        | —                         |
| F — IA v1               | Meses 6–9    | Detección de anomalías, curvas de declinación, ranking de pozos.                                                  | —                         |
| G — Segundo cliente     | Meses 9–12   | Endurecimiento multi-cliente. Piloto con un segundo cliente.                                                      | —                         |

Tiempo total realista desde “tenemos un MVP” hasta “tenemos una plataforma empresarial con marca, desplegada para Repsol, con IA v1 y un segundo cliente en piloto”: del orden de nueve a doce meses con un equipo pequeño y competente.

## 15. Stack Tecnológico Recomendado

| **Capa**          | **Tecnología**                | **Por qué**                                                      |
|-------------------|-------------------------------|------------------------------------------------------------------|
| Borde             | Node-RED + Mosquitto          | Visual, mantenible en campo, ya en uso.                          |
| Motor de IoT      | ThingsBoard PE (autoalojado)  | Gestión de dispositivos, ingesta y multi-cliente maduros.        |
| Transporte        | MQTT sobre TLS                | Estándar de IoT, eficiente sobre enlaces satelitales inestables. |
| Backend           | Node.js + TypeScript + NestJS | Estructura, talento disponible, buen soporte de herramientas.    |
| Base de negocio   | PostgreSQL                    | Robusta, con seguridad a nivel de fila para aislar clientes.     |
| Series temporales | TimescaleDB                   | Mismo motor que PostgreSQL; lista para reportes e IA.            |
| Frontend          | Next.js + Tailwind CSS        | Rápida, responsiva, totalmente personalizable a la marca.        |
| Autenticación     | Clerk / Auth0 / WorkOS        | SSO/SAML empresarial sin construirlo desde cero.                 |
| IA / analítica    | Python (microservicios)       | Ecosistema maduro de ciencia de datos, escalado aparte.          |
| Observabilidad    | Sentry + Grafana + Loki       | Visibilidad de cada fallo en un sistema industrial.              |

## 16. Riesgos y Mitigaciones

| **Riesgo**                                         | **Mitigación**                                                                                                                                         |
|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| Costo de licenciamiento de ThingsBoard PE a escala | Modelar el costo a 3 años con 100, 500 y 1000 pozos antes de comprometerse. El patrón de envoltura permite cambiar de motor si los números no cierran. |
| Ciberseguridad exigida por clientes grandes        | Presupuestar una auditoría de seguridad real (no de checklist) antes de poner en producción el primer contrato.                                        |
| Fuga de datos entre clientes                       | Aislamiento por cliente en cada consulta desde el día uno, con seguridad a nivel de fila en PostgreSQL.                                                |
| Dos fuentes de verdad para la telemetría           | ThingsBoard manda en valores en vivo; TimescaleDB manda en histórico y analítica; delimitar con claridad cuál es cuál.                                 |
| Node-RED inmantenible al crecer                    | Convenciones estrictas, control de versiones de los flujos y migrar a código la lógica de borde más compleja.                                          |

## 17. Próximos Pasos (las próximas dos semanas)

6.  Semana de auditoría: documentar los flujos actuales de Node-RED, la estructura de temas MQTT, el modelo de clientes en ThingsBoard y el esquema de datos que se envía hoy. Esto se convierte en la “especificación v0” desde la que se evoluciona.

7.  Semana de decisiones: confirmar con el cliente qué nube prefiere, en qué región y cuáles son sus requisitos de seguridad y residencia de datos. Esto desbloquea todas las decisiones de arquitectura.

8.  En paralelo: iniciar el sistema de diseño de RVF Malinois —colores, tipografía, biblioteca de componentes y tres o cuatro pantallas clave— para tener un artefacto visual real que transmita seriedad al cliente.

**Datos pendientes que harán el plan más específico:** marca y modelo del PLC de las unidades de well testing, y los requisitos de Repsol sobre dónde deben alojarse los datos. Con esos detalles, la hoja de ruta deja de ser genérica y se ajusta a la realidad de RVF.

## 18. Anexo: Glosario para No Programadores

| **Término**                  | **Significado**                                                                     |
|------------------------------|-------------------------------------------------------------------------------------|
| MVP                          | Producto mínimo viable: la versión más simple que ya entrega valor real.            |
| Edge / Borde                 | El equipo de cómputo que está físicamente en el sitio del pozo.                     |
| Pasarela (Gateway)           | Mini-computador industrial que lee los instrumentos y envía los datos.              |
| Node-RED                     | Herramienta visual de “cableado” de flujos de datos, sin programación tradicional.  |
| ThingsBoard                  | Plataforma de IoT que recibe, almacena y administra datos de dispositivos.          |
| MQTT                         | Protocolo ligero de mensajería, estándar para enviar datos de sensores.             |
| TLS                          | Cifrado que protege los datos en tránsito (el “candado” de las conexiones seguras). |
| API                          | Interfaz por la que dos programas se comunican de forma controlada.                 |
| Multi-cliente (multi-tenant) | Un mismo sistema sirve a varios clientes con datos aislados entre sí.               |
| Serie temporal               | Datos medidos a lo largo del tiempo (la “historia” de cada variable).               |
| SSO / SAML                   | Inicio de sesión único: el cliente entra con las credenciales de su empresa.        |
| Telemetría                   | Las mediciones que el equipo envía de forma remota.                                 |

*
