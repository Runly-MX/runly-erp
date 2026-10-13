# Estado actual de estabilización y próximos cierres

Date: 2026-10-13
Status: revisión local; aceptación operativa pendiente.
Parent: docs/superpowers/plans/2026-10-12-runly-stabilization.md.

Update: parches transitivos posteriores verificados en `2026-10-13-transitive-security-results.md/.json`: source-map-js, lodash-es y prosemirror-view; audit ahora 29 alertas en 11 familias, sin excepciones. API/shared, build y Notes local pasan; aceptación real continúa pendiente. La tabla siguiente conserva el punto de revisión anterior como evidencia histórica.

Este documento actualiza la lectura del FODA del 12 de octubre sin reemplazar
sus evidencias históricas. Implementado, verificado localmente, desplegado y
aceptado por usuarios son estados distintos. Ningún resultado local confirma
la revisión instalada en un servidor o dispositivo.

## Frentes del programa

| Frente | Evidencia disponible | Pendiente concreto |
|---|---|---|
| Recuperación B2 | CLI, controles de archivos/configuración, cobertura, verificación y pruebas sintéticas | Configuración privada, snapshot original, destino aislado, restore real y medición de RPO/RTO; diferido por usuario |
| Contexto empresarial | Race del SDK después de JSON corregida; identidad Attendance actual; nueve hallazgos de transporte clasificados | Tres flujos de negocio y seis flujos públicos/assets requieren tratamiento y tests; corrección diferida por usuario |
| Chat/React | Hook condicional y cleanup del countdown corregidos; fixture real de navegador | Dos personas y llamadas/redes/dispositivos reales; no se deriva aceptación de comunicaciones de un test React |
| Regresiones | Contratos Growth/Tasks/compiler/scaffold/runtime reconciliados; barridos acotados | Enumeración completa, handles abiertos y suites opt-in siguen abiertos; ver dependency-patch-results |
| Seguridad de dependencias | Shell-quote y cuatro familias compatibles corregidas; audit 44 → 34 en esta etapa | 14 familias restantes, alcance de advisories y upgrades coordinados; ninguna excepción aceptada |
| Paquetes | Seis paquetes, aliases antiguos, inventarios de archivos, consumidor separado y segundo frozen install verificados | Pin actual de Hub y descarga real de GitHub Packages; consulta remota devolvió 404 |
| CI/provenance | Preparación local de artefactos desde SHA limpio y evidencias de consumidores | CI reproducible diferido; branch protection, pruebas de upgrade y manifiesto de release completo pendientes |
| Operación y producto | Riesgos y pendientes identificados en FODA y TASKS | Readiness, señales independientes, revocación, recovery MirAI y recorridos completos necesitan scopes propios |

## Qué puede continuar sin presencia del operador

1. Revisar las APIs utilizadas por las 14 familias vulnerables y preparar
   actualizaciones por padre/contrato. Las versiones major del editor, SMTP,
   importación y UUID requieren diseño y fixtures; no un override global a ciegas.
2. Diseñar y probar readiness con dependencias simuladas, límites de tiempo y
   respuesta sin detalles internos; mantener liveness separada. Antes de integrar
   debe especificarse qué bloquea servir tráfico y qué es capacidad opcional.
3. Revisar recuperación de ejecución MirAI, auditoría y retries mediante fallos
   inyectados localmente. Determinar el punto de claim/action/result y la clave
   de idempotencia de cada efecto antes de implementar reintentos.
4. Revisar claims JWT, caché y revocación con tokens ficticios; diseñar compatibilidad
   con sesiones, invitados y clientes nativos. Las políticas de negocio de duración
   y cierre de sesión requieren aceptación posterior.
5. Preparar fixtures y una matriz de aceptación por recorrido. No marcar como
   aprobadas redes, hardware, servicios o reglas fiscales que no se han observado.

Estos son siguientes scopes, no trabajos ya implementados o pruebas aprobadas.
Cada cambio de comportamiento necesita spec/plan separado y validación conforme
al proceso del repositorio. La autorización de trabajo local autónomo no equivale
a publicación, despliegue, cambios de credenciales o restauración en producción.

## Readiness: observación de código y contrato a diseñar

En `apps/api/src/index.js`, `/health` devuelve `ok: true`, nombre y fechas sin
consultar dependencias. Eso verifica que el handler responde; no que la base o
el runtime de módulos puedan atender una operación. El ticker
`runGrowthHealthTick` del worker inspecciona propiedades Growth, no constituye un
heartbeat externo de todas las colas. Compose verifica Redis de LiveKit; ese check
no acepta por sí mismo una llamada, grabación o transcripción.

El siguiente diseño debe distinguir:

| Señal | Qué debe demostrar | Caso negativo local exigido |
|---|---|---|
| Liveness API | Proceso/loop puede responder | Proceso detenido; no confundir fallo DB con necesidad de reinicio |
| Readiness API | Dependencias obligatorias y runtime inicializado dentro de presupuesto | DB inaccesible/consulta lenta y módulos aún cargando; respuesta negativa acotada |
| Heartbeat worker | El proceso correspondiente avanza y se conoce última ejecución exitosa | Job detenido o proceso que nunca arrancó; no depender sólo de un error en logs |
| Edad del respaldo | Hay snapshot completo verificado dentro del umbral operativo | Sin snapshot, snapshot incompleto o demasiado antiguo; señal fuera del job de backup |
| Cola/AI | Se conoce edad del pendiente, leases/retries y estado final | Crash entre efecto y resultado; no duplicar efectos en reintento |

No se fijan valores de RPO/RTO, ventanas o alertas comerciales sin definirlos
para la instalación. Los fixtures pueden cubrir límites y estados antes de
disponer del entorno real. No se implementó un endpoint readiness en esta revisión.

## Matriz propuesta para aceptación posterior

Los tres recorridos provienen del programa; prioridad definitiva y responsables
siguen pendientes. Cada ejecución debe registrar SHA de fuente, versión de
imagen/APK, migración, módulos, plataforma, resultados y evidencia privada
redactada. No almacenar datos de clientes o destinos reales en este repositorio.

| Recorrido propuesto | Controles que deben observarse | Entorno necesario | Estado |
|---|---|---|---|
| Compra → recepción parcial → pago → activo/documento | Transiciones, saldos, cancelación, referencias y permisos; dos empresas y un usuario sin permiso | Instancia actualizada y datos sintéticos | Pendiente; no se deduce de unit tests |
| Alta de asistencia → dispositivo → marcaje offline → corrección → horas | Empresa, zona horaria, duplicados/reintentos, reconexión y permisos de corrección | Navegador y hardware Android/QR/NFC soportado | Pendiente; capacidades sin hardware permanecen sin verificar |
| Compartir/editar archivo → revocar → recuperar versión | Dos sesiones, invitado, permisos después de revocación, integridad de guardado/descarga | Servicios de archivos/Office y respaldo aislado | Pendiente; restore real B2 diferido |
| Colaboración transversal | Audio/video bidireccional, reconexión Wi-Fi/datos, grabación recuperable, transcripción y acceso revocado | Dos personas, redes reales y servicios habilitados | Pendiente |

Un resultado debe ser `passed`, `failed`, `unsupported`, `not-run` o `blocked`,
con motivo específico. `not-run` no es `passed`; tampoco una casilla histórica
abierta demuestra que falte implementación. Antes de desplegar un supuesto fix
pendiente, contrastar la versión realmente instalada y su configuración.

## Dependencias del operador que permanecen separadas

- B2: localizar configuración privada existente y preparar el destino aislado;
  no se requieren credenciales para continuar los scopes locales anteriores.
- Servicios y hardware: confirmar instalación/versión, dispositivos y participantes
  para aceptación real. No iniciar una prueba real con destinos inferidos.
- Distribución: confirmar acceso de lectura de Hub/GitHub Packages; un 404 no
  prueba ausencia del repositorio. Publicaciones requieren una solicitud concreta.
- Producto: responsables, tres recorridos definitivos, alcance contable/fiscal,
  funciones Android anunciadas y tolerancias de recuperación.
- CI y transporte: respetar el aplazamiento explícito; no retomarlos por asumir
  que la ausencia del usuario cancela esa instrucción.
