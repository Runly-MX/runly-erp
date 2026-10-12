# FODA y revisión de madurez de Runly ERP

Fecha de corte: 2026-10-12. Revisión inicial: `3cc50234`.

## Dictamen

Runly tiene una plataforma extensible real, un catálogo funcional amplio y mecanismos de aislamiento que ya pueden verificarse en una base vacía. Su principal brecha es la diferencia entre velocidad de implementación y capacidad de garantizar operación, recuperación y compatibilidad de cada entrega.

La recomendación es dedicar el siguiente ciclo a estabilización y aceptación de recorridos completos. Ampliar simultáneamente colaboración, asistencia, IA y plataforma de módulos aumenta la superficie que debe mantenerse sin que los controles de entrega crezcan al mismo ritmo.

Esto no es una certificación de seguridad ni de preparación para producción. Se revisaron arquitectura, código seleccionado, documentación, historial reciente, automatización, dependencias y pruebas locales. No se inspeccionó una instalación real, sus secretos, usuarios, respaldos ni métricas comerciales. Las oportunidades y amenazas comerciales son hipótesis estratégicas derivadas del producto, no conclusiones de un estudio de mercado.

## Evidencia y límites

- Descubrimiento mediante el grafo MCP; contraste con archivos actuales para hallazgos concretos. El grafo contiene 35,090 nodos y 97,193 relaciones, pero no equivale a cobertura de auditoría ni garantiza actualidad de todos los símbolos.
- 611 archivos versionados coinciden con patrones `*.test.*`/`*.spec.*`; esa cantidad no representa porcentaje de cobertura.
- La instalación desechable de PostgreSQL 18 aplicó toda la cadena de migraciones y ejecutó el seed: 24 módulos. Las 14 pruebas de aislamiento pasaron, sin skips.
- Esa prueba modela contratos mínimos de Auth/Realtime. No sustituye Supabase Auth, Storage, Realtime y LiveKit funcionando juntos.
- Build web aprobado. Generó chunks grandes; `city` pesa aproximadamente 8.07 MB minificado y 2.26 MB gzip. No se midió su descarga en la ruta inicial ni tiempos de uso real.
- Privacidad: 4,264 archivos revisados y cero hallazgos de la política. UUID y propiedad de esquemas administrados aprobados. Catálogo RBAC: 321 permisos en ambos lados, sin faltantes ni sobrantes.
- Lint aprobado, con alcance limitado: `eslint.config.js` implementa esencialmente una restricción de fechas UTC y registra las reglas de hooks como funciones vacías. Los scripts de lint de API, desktop y worker imprimen `lint-pending`.
- React Doctor: 1,390 archivos analizados; 49/100; 50 errores y 1,098 advertencias. Son diagnósticos estáticos a clasificar, no 1,148 defectos demostrados. Se confirmó manualmente al menos un hook condicional.
- `pnpm audit --json`: 45 alertas: 1 crítica, 22 altas, 19 moderadas y 3 bajas. La exposición depende del uso, la entrada controlable y el artefacto desplegado.
- El barrido inicial de API no terminaba oportunamente; se interrumpió y se repitió con concurrencia 8, timeout por prueba de 60 segundos y `--test-force-exit`. Este último puede ocultar handles abiertos; no prueba una limpieza correcta del proceso.
- Resultado API: 2,362 pruebas contabilizadas, 2,353 aprobadas, 7 fallidas y 2 omitidas; 222.8 segundos. Resultado paquetes/frontend/scripts/Prisma e instalador seleccionados: 1,578 pruebas, 1,566 aprobadas, 6 fallidas y 6 omitidas; 196.0 segundos. No hubo cancelaciones. Además existen suites de integración omitidas por variables de entorno: los contadores finales de tests no describen por sí solos todo ese alcance.
- `pnpm check:secrets` no pudo completar el análisis porque Gitleaks no está disponible en PATH. No se presenta el control de privacidad como un escaneo completo de secretos. Después de añadir el informe: privacidad aprobada sobre 4,265 archivos y `git diff --check` limpio.

### Fallas de regresión clasificadas

| Grupo | Hallazgo | Interpretación |
| --- | --- | --- |
| SDK empresarial | `company-fetch.test.js`, respuesta tardía de `client.auth.me`. | Defecto confirmado y reproducido aisladamente: la comprobación de empresa ocurre antes de consumir JSON, no después. |
| Identidades oficiales | `runly-module-registration.test.js` y `runly-module-identity.test.js`. | Falta `runly.attendance` en `CURRENT_ONLY_OFFICIAL_MODULE_KEYS`; divergencia confirmada respecto al catálogo de 24 módulos. |
| Runtime/Dev Kit | Catálogo de versiones, documento de librerías y snapshot del Dev Kit. | Deriva comprobada; por ejemplo lucide 1.50.0 frente a 1.51.0. Hay que contrastar lockfile, instalación y generación antes de regenerar. |
| QR en importmap | Prueba busca mappings literales dentro de vite.config.js. | El mapa ahora se importa desde preview-runtime; la prueba inspecciona una ubicación antigua. No demuestra por sí sola un QR roto. |
| Projects | Dos tests usan un mock sin `project.findUnique`. | Mock desactualizado respecto al servicio; no demuestra que Prisma real carezca del método. |
| Growth | Test exige navegación antigua. | Falla histórica documentada; confirmar navegación deseada y contrato, sin quitar nuevas entradas solo para hacerla pasar. |
| Compilador/layout | Regex exige `z.string().optional()` y se genera `.nullable().optional()`. | Desacuerdo de expectativa; validar semántica de campo condicional antes de cambiar generador o test. |
| Scaffolder | Espera 13 archivos, recibe 15; ejecuta node --check sobre AGENTS.md. | Dos expectativas defectuosas de la prueba; no es evidencia de sintaxis JavaScript inválida en el módulo generado. |

Hay 13 fallas de tests, no 13 incidentes independientes de producción. La clasificación evita tanto ignorarlas como equiparar un mock o regex obsoleto con un fallo del producto.

## FODA

| Fortalezas internas | Debilidades internas |
| --- | --- |
| RME3: modelos, permisos, vistas, rutas, compilación e instalación de módulos con contratos documentados. | Falta una puerta automatizada de regresión general, build, privacidad y dependencias en cada cambio. |
| SDK, UI compartida, formularios/tablas declarativos y Dev Kit reducen costo de extensiones. | Lint verde ofrece poca evidencia sobre errores JavaScript, hooks y accesibilidad. |
| Aislamiento empresarial y de recursos con pruebas SQL reproducibles; revocación y referencias cruzadas verificadas. | Documentación de estado y planes no refleja uniformemente el código o la aceptación operativa. |
| Instalación desde base vacía verificable; seed y controles de esquema/UUID/permisos. | Recuperación externa puede producir un respaldo incompleto y declararlo exitoso. |
| Colaboración, compras, activos, asistencia y archivos comparten identidad y contexto empresarial. | Acumulación de QA manual, móvil, hardware y proveedores sin cierre demostrable. |
| MirAI separa propuesta de ejecución y revalida permisos al confirmar. | Crecimiento de complejidad, chunks grandes, dependencias con alertas y riesgo de estados asíncronos incompletos. |

| Oportunidades externas potenciales | Amenazas externas potenciales |
| --- | --- |
| Usar módulos verticales para resolver recorridos específicos con menos personalización del core. | Una pérdida de archivos o un acceso cruzado deteriora confianza en todo el ERP. |
| Ofrecer instalación propia y extensibilidad a organizaciones que necesitan controlar datos y procesos. | Redes móviles, WebViews, restricciones de segundo plano y proveedores externos cambian el comportamiento real. |
| Diferenciar con un recorrido completo compras → recepción → activo → documentos → colaboración. | Extensiones de terceros y dependencias comprometidas amplían el radio de un incidente. |
| Convertir pruebas de instalación, aislamiento y recuperación en evidencia de calidad para adopción. | Los usuarios pueden esperar integración fiscal, contable y reportes que aún no forman un recorrido validado. |
| Catálogo firmado y herramientas de autoría pueden facilitar un ecosistema de integradores. | El costo de soporte crece si cada cliente usa una combinación distinta de módulos, imágenes y APK. |

Las oportunidades requieren comprobar necesidad, disposición a pagar, costo de implantación y soporte. No hay evidencia suficiente en este repositorio para afirmar adopción, rentabilidad, ventaja frente a competidores o product-market fit.

## Riesgos y mejoras prioritarias

### R1. Respaldo externo incompleto con señal de éxito — prioridad P0

Evidencia: `apps/backup/run-backup.sh` continúa si `rclone sync` falla y omite Storage si no hay origen configurado. En modo externo solo enumera `runly-files` y `runly-website`. El arranque de API también crea `runly-storefront`, `runly-chat` y `runly-notes` (`apps/api/src/index.js`, `ensureBuckets`). Existe una diferencia comprobable entre buckets creados y buckets respaldados.

Los contenedores de backup montan configuración y, en modo local, Storage; no montan el directorio `custom-modules`. Las fuentes RME3 en disco y claves privadas adicionales deben tener una estrategia explícita de recuperación. No se demostró pérdida en una instancia real.

Acción: inventario de activos recuperables por instalación, inclusión de todos los buckets necesarios y fuentes de módulos, fallo explícito ante copias incompletas, manifiesto de cobertura y simulacro en un destino desechable. Excluir artefactos deliberadamente regenerables requiere documentar cómo se regeneran.

Cierre: recuperar base, archivos y módulos en una instalación nueva y verificar recorridos de usuario. Introducir una falla de Storage y comprobar que el respaldo no aparece como completo.

### R2. Antigüedad del backup confundida con retención — prioridad P1

Evidencia: `apps/backup/verify-backup.sh` calcula la antigüedad máxima como la mitad de `BACKUP_RETENTION_DAYS`. Con 14 días admite 168 horas. El cron predeterminado en `apps/backup/entrypoint.sh` es diario. `restic check` valida el repositorio, pero no comprueba que se incluyeron todos los archivos necesarios.

Acción: separar retención de frecuencia esperada, pérdida máxima tolerada de datos (RPO) y tiempo máximo de recuperación (RTO). Alertar desde fuera del contenedor: si el job nunca arranca, su propia alerta de error no se ejecuta. El envío depende de SMTP configurado.

El runbook documenta una restauración real de septiembre: esto es una fortaleza histórica, no prueba de salud de los respaldos actuales. La especificación acepta falta de consistencia temporal DB+Storage; debe explicarse a quien opere el sistema.

### R3. Controles de entrega incompletos — prioridad P0

Evidencia: los tres workflows versionados son UUID, propiedad de esquemas y publicación manual de paquetes compartidos. Los dos primeros corren en push/PR; la publicación ejecuta pruebas dirigidas. No hay un workflow general de API, frontend, aislamiento, build, privacidad, secretos o auditoría de dependencias.

`docs/REPOSITORY_PRIVACY.md` afirma que CI ejecuta privacidad y secretos; los workflows versionados no respaldan esa afirmación.

Acción: CI reproducible con lockfile congelado, pruebas generales acotadas, aislamiento desechable, build web, controles de privacidad/permisos y análisis de dependencias. Clasificar skips y timeouts como resultados visibles. Una suite no debe depender accidentalmente de la configuración de una base compartida.

Cierre: un cambio que rompe navegación, hooks, aislamiento o build queda bloqueado antes de integrarse; el reporte identifica claramente qué se ejecutó y qué se omitió.

### R4. Dependencias con alertas vigentes — prioridad P0 para clasificación

La alerta crítica corresponde a `shell-quote@1.9.0`, incorporado por `concurrently@10.0.5` en el flujo de desarrollo. No se confirmó una ruta de explotación remota en el ERP. El advisory requiere entradas específicas controladas por un atacante y tiene corrección en 1.11.0: [advisory shell-quote](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).

Hay alertas en dependencias de aplicación: `nodemailer@8.0.10`, `@tiptap/core@3.27.1`, `prosemirror-view@1.41.9` y `sharp@0.35.4`. Para ProseMirror se verificó el aviso de XSS en manejo de pegado: [advisory ProseMirror](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w). No se ejecutaron payloads contra usuarios ni se comprobó explotación.

Las alertas de `@hono/node-server@1.19.11` encontradas vienen por `@prisma/dev`; no deben atribuirse automáticamente al adaptador directo de API, cuyo manifiesto pide una versión superior.

Acción: clasificar cada alerta por versión del lockfile, dependencia directa/transitiva, uso en desarrollo/producción, entrada alcanzable y parche compatible. Actualizar por familias con regresión, no aplicar una actualización masiva sin revisión. El lockfile estabiliza `latest` durante instalaciones congeladas, pero esos rangos hacen menos deliberada una futura actualización.

### R5. Defectos de React fuera del lint actual — prioridad P1

Evidencia confirmada: `VisitorInfoPanel` en `apps/desktop/src/modules/runly.chat/screens/ExternalInboxScreen.jsx` retorna si no hay conversación y después llama `useExpiryCountdown`. Si cambia esa prop dentro de la misma instancia, cambia el orden/número de hooks. El disparador depende del recorrido del componente; no se reprodujo en navegador en esta auditoría.

React Doctor también detecta mutación de refs durante render, timers/suscripciones sin limpieza, actualizadores con efectos y problemas de teclado. Es necesario revisar cada familia antes de aceptarla como defecto. Los iframes de PDF sin sandbox requieren evaluar origen, tipo y comportamiento del visor; la advertencia no demuestra XSS.

Acción: activar reglas reales de hooks, errores JavaScript y JSX con adopción progresiva; corregir primero riesgos de ejecución y accesibilidad en pantallas de uso frecuente. Conservar una línea base para no convertir deuda antigua en bloqueo indiscriminado.

### R6. Aislamiento: base sólida, aceptación global pendiente — prioridad P1

`resolveTenantContext` y `requirePermission` resuelven membresía y permisos empresariales. Las 14 pruebas desechables verifican identidades, recursos privados, invitaciones, revocación, Realtime, POS, calendario, búsquedas, notas y referencias entre módulos.

El Plan 4 multitenant figura pendiente en `docs/TASKS.md`. Debe reconciliarse con `docs/USER_ISOLATION.md` y el código posterior: parte de su alcance ya existe. Evitar tanto declarar seguridad completa como volver a implementar trabajo entregado.

`pnpm check:company-scope` falla en nueve archivos porque detecta cualquier `fetch` fuera de una lista de excepciones. Los dos imports de inventario sí incluyen `X-Runly-Company-Id`; `attendanceRequest` también recibe `companyId`. Otras rutas son públicas o de invitados. Es un fallo de gobernanza del control, no nueve fugas demostradas.

Sí se confirmó una carrera real en `packages/sdk/src/index.js`: `request()` ejecuta `assertCurrentCompany(options.headers)` antes de `await response.json()` y retorna el cuerpo sin otra comprobación. Si la empresa cambia durante la lectura del cuerpo, se entrega una respuesta del contexto anterior. La prueba aislada `packages/sdk/src/__tests__/company-fetch.test.js` reproduce el caso en `client.auth.me`. El transporte `createCompanyFetch` sí vuelve a comprobar después de consumir el cuerpo. Corregir la paridad del SDK tiene prioridad P0 por riesgo de mezcla de estado/caché; no se demostró que el servidor permita leer datos de una empresa sin autorización.

Acción: matriz usuario/empresa/recurso/canal, pruebas negativas de HTTP+Storage+Realtime y transporte con cancelación/respuestas tardías al cambiar empresa. Revisar excepciones individualmente y cubrirlas con evidencia.

### R7. Extensiones ejecutan código con privilegios del proceso — prioridad P1

Evidencia: `route-loader-service.js` importa el archivo de módulo y entrega el objeto `prisma` a factories de rutas autenticadas y públicas. Las capacidades de relaciones/servicios son útiles, pero no limitan lo que un código JavaScript con acceso directo a Prisma y al proceso puede hacer.

Esto puede ser una decisión válida para extensiones administradas y de confianza. No equivale a ejecutar código de terceros en un sandbox. Firmar un paquete demuestra procedencia/integridad, no ausencia de comportamiento peligroso.

Acción: definir quién puede instalar qué código, explicar el límite de confianza, revisar permisos y procedencia del catálogo, y probar que una empresa no instala código privilegiado que afecte a otras. Antes de aceptar módulos no confiables, evaluar ejecución aislada y API de capacidades sin cliente de base completo.

### R8. Entregas no reproducibles y preparación parcial — prioridad P1

Evidencia: Compose usa por defecto imágenes `*-latest`. API, web, worker, paquetes compartidos, módulos y APK tienen contratos relacionados. El repositorio conserva compatibilidad Atlas/Runly; la coexistencia requiere pruebas, no un reemplazo textual de claves almacenadas.

Acción: manifiesto de release con SHA, tags/digests, versión de esquema, SDK, módulos y APK; instalación limpia y actualización desde la versión previa; instrucciones para recuperación. Un rollback de imagen no revierte automáticamente una migración de datos.

No se inspeccionó qué versiones están actualmente publicadas ni se realizó publicación o despliegue.

### R9. Salud operativa demasiado superficial — prioridad P1

`GET /health` devuelve estado y reloj sin comprobar base, colas ni Storage. API y worker no declaran healthchecks propios en el Compose revisado. La API registra toda promesa no manejada como no fatal.

Acción: separar liveness y readiness; métricas de edad/tamaño de colas, fallas de entrega, latencia, errores y respaldo; alarmas externas con responsable. Revisar qué errores permiten continuar y cuáles requieren reinicio controlado.

No se concluye que una instalación carezca de monitoreo externo: no fue inspeccionado. Tampoco se propone sustituir PostgreSQL por otra cola sin medir primero su necesidad.

### R10. Propuestas IA: autorización buena, recuperación incompleta — prioridad P1

`mirai-proposal-service.js` valida dueño y empresa, reclama una propuesta pendiente mediante UPDATE condicional, revalida disponibilidad/permisos y ejecuta la acción. Eso protege contra una doble confirmación concurrente.

La reclamación, ejecución y escritura del resultado son pasos separados. Una caída entre ellos puede dejar `executing` o una acción aplicada cuyo resultado no quedó persistido. El registro de auditoría usa `.catch(() => {})`, por lo que su falla se silencia. No se encontró un recuperador de propuestas `executing` en los archivos revisados.

Acción: idempotencia por propuesta/operación, recuperación con lease o conciliación, auditoría observable y pruebas de caída entre pasos. Para acciones con efectos externos, definir compensación o reintento seguro. Revisar además minimización de datos enviados a proveedores, controles contra instrucciones maliciosas en adjuntos y evaluación de calidad por capacidad.

### R11. Complejidad y rendimiento sin presupuesto — prioridad P2

El grafo concentra complejidad en composición de rutas, lifecycle, inspección ZIP y renderers compartidos. Las métricas agregadas de factories contienen callbacks internos y pueden exagerar la complejidad de una sola operación; sirven para elegir candidatos, no como prueba de defectos.

El build revela chunks grandes y React Doctor identifica 191 advertencias de accesibilidad. Faltan mediciones de aceptación en equipos/redes representativos dentro de esta revisión.

Acción: medir carga inicial y navegación por módulo, memoria y latencia de importaciones; cargar catálogos geográficos bajo demanda; priorizar teclado/foco/lector de pantalla en recorridos esenciales. Refactorizar las zonas más cambiantes con pruebas de contrato, evitando una reescritura global.

### R12. Alcance comercial y núcleo ERP requieren definición — prioridad P1 de producto

El catálogo tiene amplitud operativa. Compras declara fuera de alcance contabilización automática, parsing CFDI XML, portal de proveedores y envío de órdenes (`docs/03_core_modules.md`). La separación entre compras operativas, libro de cuentas y contabilidad debe reflejarse en lo que se promete al usuario.

No se verificó un cierre contable, conciliación global ni cumplimiento fiscal/nómina. No corresponde asumir que son funcionalidades ausentes en todo Runly únicamente por este documento; corresponde levantar una matriz de capacidad y validar recorridos con responsables de negocio.

Acción: escoger el segmento y tres recorridos completos; identificar duplicaciones conceptuales entre productos/stock, activos, finanzas personales, libro y contabilidad; acordar fuentes de verdad e invariantes de importes, moneda, impuestos, cancelación y permisos. Reportes transversales siguen pendientes en TASKS.

## Pendientes que conviene retomar

### Autenticación y revocación a revisar

La API puede verificar JWT localmente y cachear la identidad. `verifySupabaseJwt` comprueba HMAC y vencimiento cuando existe `exp`, pero no exige ese claim ni valida explícitamente `alg`, emisor, audiencia, `nbf` o sesión vigente. Esto no demuestra que un atacante sin la clave pueda fabricar una identidad. Sí justifica especificar y probar el contrato de tokens aceptables y el tiempo de revocación esperado.

Para operaciones sensibles, revisar la política de revocación junto con permisos/cache. Supabase explica que garantizar que un access token deje de funcionar después de cerrar sesión requiere comprobar su `session_id` contra la sesión existente; no es una propiedad automática de verificar la firma: [sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions).

El CORS de API refleja cualquier origen con credentials habilitadas. Al usar Bearer, esto no demuestra por sí solo CSRF o robo de sesión; revisar qué orígenes son necesarios para sitios públicos, hosts nativos y administración, y dónde deben tener políticas diferentes.

TASKS conserva una recomendación histórica de rotar una credencial de desarrollo que apareció en una salida de depuración. Confirmar su cierre en documentación privada; no deducir que sigue activa ni copiar el valor al repositorio. La política de privacidad también reconoce datos antiguos en el historial. El control de privacidad actual no elimina esos antecedentes.

| Frente | Evidencia actual | Siguiente cierre útil |
| --- | --- | --- |
| Meet/LiveKit | Código y pruebas; TASKS pide llamada de dos usuarios, redes reales, grabación Egress y APK. | Matriz LAN/Wi-Fi/datos, reconexión, audio bidireccional, grabación recuperable y permisos. |
| Notificaciones | Web verificado históricamente; pendientes PWA desplegada y Android en segundo plano. | Probar app cerrada, pantalla bloqueada y ciclo de llamada en dispositivo real. |
| Asistencia | Mucho trabajo del 12 de octubre; QR/NFC y otras capacidades tienen aceptación de hardware pendiente. | Recorrido alta → dispositivo → marcaje → corrección → revisión de horas, con huso horario y desconexión. |
| Compras | Backend/frontend y puente de inventario existen; plan conserva V1–V3 sin marcar. | Contratos, transiciones, recepción parcial, pagos, permisos y referencias negativas en una instancia actualizada. |
| Transcripción | TASKS conserva un fix de aprovisionamiento RLS pendiente de aplicar en instalación real. | Verificar versión/provisión desplegada y transcripción completa, no publicar por asumir que sigue faltando. |
| MirAI global | Hay código de propuestas y herramientas de compras; TASKS/docs tienen estados parciales. | Verificación por capacidad, permisos, confirmación, reintentos y calidad de extracción. |
| Catálogo RME3 | Firma y API existen; TASKS registra publicación del catálogo y custodia de clave pendientes. | Instalación desde catálogo publicado, validación de firma, recuperación de clave y actualización de módulo. |
| Documentos/Office/Notas | Historial de QA diferido y versiones de recuperación. | Dos sesiones editando, permisos revocados, guardado/descarga y recuperación de versión. |
| POS/Growth/Storefront | Pendientes manuales y bajo carga en TASKS. | Venta completa con cocina y sucursal apropiadas; captura pública y conversión con permisos. |
| Documentación | Estado principal fechado en mayo, planes con checkboxes abiertos pese a implementación posterior. | Una matriz actual de implementado/verificado/desplegado/aceptado y archivos históricos identificados. |

Una casilla pendiente no demuestra ausencia. Hay evidencia de avances posteriores: el gate de privacidad hoy pasa y compras ya cuenta con herramientas MirAI aunque documentos aún describan una futura integración. Cada pendiente necesita contraste antes de convertirse en tarea nueva.

## Secuencia propuesta de estabilización

1. **Primer ciclo:** cobertura real de recuperación, clasificación/parches de dependencias, pruebas generales reproducibles y defecto de hooks confirmado. Definir qué alertas bloquean una entrega.
2. **Segundo ciclo:** CI obligatoria, matriz de aislamiento, manifiesto reproducible de release, readiness y alertas externas. Simulacro de actualización y restauración.
3. **Tercer ciclo:** aceptación física de Android/asistencia, comunicaciones reales y recorridos completos de compras/archivos. Cerrar pendientes con evidencia por versión.
4. **Después:** presupuesto de rendimiento, reportes transversales y catálogo de módulos; ampliar funciones según recorridos y necesidades comprobadas.

La duración depende del equipo y de los entornos. No es una estimación cerrada de horas. Separar correcciones pequeñas, cambios de seguridad y decisiones de arquitectura en entregas revisables.

## Criterios de salida para volver a acelerar funcionalidades

- La regresión general termina y sus fallas conocidas están resueltas o formalmente aceptadas con responsable y fecha; skips de seguridad quedan visibles.
- No quedan alertas críticas/altas alcanzables sin tratamiento documentado; una excepción exige análisis concreto.
- Cada instalación objetivo tiene respaldo completo, alerta de antigüedad y simulacro con RPO/RTO medidos.
- Aislamiento validado también por HTTP, Storage y Realtime real en recorridos seleccionados.
- Tres recorridos de negocio completos pasan en web y en los dispositivos soportados.
- Cada release permite conocer exactamente imágenes, APK, esquema y módulos utilizados.
- Los pendientes tienen dueño, prioridad, versión y evidencia de cierre. Las decisiones diferidas están diferenciadas de defectos y despliegues faltantes.

## Decisiones que requieren contexto de negocio

1. ¿Runly se prioriza como ERP operativo vertical, plataforma general extensible o servicio SaaS compartido? Cambia la frontera de confianza de módulos y el nivel requerido de aislamiento.
2. ¿Cuáles son los tres recorridos que deben funcionar sin asistencia técnica para el próximo cliente?
3. ¿Cuánta pérdida de datos y tiempo fuera de servicio acepta cada instalación?
4. ¿Qué capacidades se anuncian como soportadas en Android y cuáles son experimentales?
5. ¿Qué alcance contable/fiscal se promete y quién valida esas reglas?

## Referencias principales

- `docs/TASKS.md`, `docs/00_project_status.md`, `docs/09_next_steps.md`.
- `docs/USER_ISOLATION.md`, `docs/COMPANY_SCOPE_AUDIT.md`.
- `docs/ai-context/rme3-modules.md`, `docs/ai-context/rme3-runtime-capabilities.md`.
- `docs/deployment/backup-recovery.md`, `apps/backup/`, `infra/installer/docker-compose.yml`.
- `.github/workflows/`, `eslint.config.js`, `scripts/check-company-scope.mjs`.
- `apps/api/src/index.js`, `apps/api/src/services/route-loader-service.js`.
- `apps/api/src/routes/chat/mirai-proposal-service.js`.
- `apps/desktop/src/modules/runly.chat/screens/ExternalInboxScreen.jsx`.
- `docs/03_core_modules.md`, plan de rediseño de compras de 2026-09-30.

Solo se añadió este informe. Las recomendaciones no constituyen cambios de implementación ni autorización para desplegar, publicar, rotar secretos o modificar datos de una instalación.
