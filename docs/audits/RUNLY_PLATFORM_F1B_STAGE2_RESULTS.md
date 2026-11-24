# RUNLY PLATFORM STABILIZATION — F1B Stage 2: Secure Runtime de referencia

- Base: `main` @ `cd5f608e4` (cierre de Stage 1), árbol limpio al iniciar. Commits de otras sesiones intercalados durante la fase (no incorporados ni tocados): `cb8dda611`, `7ff8e82ae`, cambios en `security-gates.yml`, `packages/ui/src/runtime.css` y `LoginShowcase.jsx`.
- Commits locales de esta fase (sin push, PR ni despliegue): `36d55376c`, `c91847aa6`, `4418b8ad0`, `1c6bd0248`, `bc4953e10`, `c3c05f0a1`, `5386c7d56`, `b37dd2652` (mediciones) y el de esta documentación.
- Entorno: estación Windows 11 con Docker Desktop y Chromium de Playwright. Todo se probó en **infraestructura desechable**; nada se probó en dispositivos físicos, staging ni producción.
- Estados: CONTENIDO / CORREGIDO LOCALMENTE / VERIFICADO EN STAGING / CERRADO EN PRODUCCIÓN. Ningún P0 se declara cerrado.

## 1. Resumen

| Entrega | Resultado | Evidencia |
|---|---|---|
| Consolidación de Stage 1 | Dos huecos de integridad corregidos: hash sin `node_modules` del módulo y symlinks ignorados | `module-trust.test.js` 4/4 |
| Capability Gateway v1 (experimental) | Implementado: tokens firmados por el host, nonce de un uso, permisos por operación, argumentos estrictos, cuotas, timeouts, idempotencia, auditoría, revocación, `runly.capabilities/v1` | `gateway.test.js` 8/8 |
| Runtime declarativo | Esquema `runly.declarative/v1`, intérprete de expresiones con lista blanca y límites, transiciones, automatizaciones, mapeo a blueprints de Runly UI | `gateway.test.js`, vertical |
| Runtime de código aislado | Contenedor por trabajo con aislamiento real y red interna con proxy solo al gateway | `verify-isolated-runtime.mjs` 12/12 |
| Frontend aislado | iframe `sandbox="allow-scripts"` (origen opaco), CSP por hash, puente MessageChannel | `verify-isolated-frontend.mjs` 7/7 (Chromium) |
| Fixture vertical "Solicitudes" | Dos empresas de extremo a extremo en PostgreSQL real | `verify-secure-runtime-vertical.mjs` 7/7 |
| Dependencias | nodemailer 10.6.1, xmldom → `@xmldom/xmldom` 0.8.15, body-parser 2.4.0. Sin críticas/altas alcanzables en el runtime de la API | §7 |
| API no root | Usuario `runly` 10001, `su-exec`, compose con capacidades mínimas | `verify-nonroot-image.mjs` 4/4 |
| UX de confianza | Estado y motivo de cuarentena, recuperación, acciones solo para el propietario, upload oculto a quien no lo es | Build web OK |
| Hub / Marketplace | Impacto del compilador documentado; release coordinado preparado, no publicado | §10 |

Conclusión: la arquitectura híbrida **funciona y es defendible** en infraestructura desechable. Hay dos ajustes de diseño:
- el contenedor por trabajo tarda ~1 s, así que sirve para automatizaciones y no para la ruta de una petición sin un *pool* aislado;
- el orquestador debe vivir en un supervisor mínimo, no en la API.

Ninguna decisión del ADR resultó inviable.

## 2. Consolidación de Stage 1

| Revisión | Hallazgo | Acción |
|---|---|---|
| Integridad continua | El hash de confianza excluía `node_modules` del módulo, que Node usa primero para resolver imports. Se podía cambiar ese código sin alterar el hash | Ahora se incluye; solo se excluyen `.bundle` y `.git` |
| Symlinks y archivos especiales | Se ignoraban en silencio, pero un import los seguiría | Cuarentena con `SYMLINK_IN_PACKAGE` / `UNSUPPORTED_FILE_IN_PACKAGE` |
| Caché del hash | Se invalidaba por mtime de un árbol distinto | Revisión propia: conteo, tamaños y mtimes de exactamente los archivos con hash |
| TOCTOU | Entre la verificación y el `import()`, o en `import()` dinámicos posteriores dentro del módulo, un cambio en disco no se detectaría | Requiere acceso de escritura al servidor (fuera del modelo de amenazas). El runtime aislado lo elimina: el código se monta de solo lectura en el contenedor |
| Imports transitivos | El código de un módulo confiable puede importar cualquier archivo del host | Inherente al modelo en proceso; lo resuelve el runtime aislado |
| Actualización, rollback y reinicio | Registro persistido en base; últimas 10 revisiones autorizadas; recálculo al arrancar | `module-trust.test.js` |
| Suites críticas | `pnpm test:security` en CI, más 6 verificaciones con Docker o navegador | §11 |
| Fallas conocidas | Línea base de 22, mismo conjunto | §11 |
| Build web completo | Pasa (9–10 s) | §9 |
| Contratos con Hub y Marketplace | §10 | — |

## 3. Matriz de seguridad

| Amenaza (threat model) | Control de referencia | Verificado | Estado |
|---|---|---|---|
| T1–T3 Código arbitrario por admin de empresa | Autoridad de código + escapes del Builder cerrados | Stage 1 | CONTENIDO |
| T4–T5 Código antiguo o modificado | Cuarentena por hash exacto; `node_modules` y symlinks cubiertos | 4/4 | CONTENIDO |
| T6 Secretos del host | Runner sin variables del host, token por stdin | 12/12 | CORREGIDO LOCALMENTE (PoC) |
| T7 Lectura entre empresas | Tenant solo del token; cada consulta filtra por empresa y módulo | 8/8, 7/7 | CORREGIDO LOCALMENTE (PoC) |
| T8 Escalada vía host | Permisos por operación con los del usuario; `companyId`/`userId` en argumentos rechazados | 8/8 | CORREGIDO LOCALMENTE (PoC) |
| T10 Dependencias maliciosas | Código del módulo de solo lectura; sin red ni secretos donde corre | 12/12 | Parcial: no hay allowlist de dependencias |
| T11 Agotamiento de recursos | Límites de memoria, CPU, PIDs, descriptores y timeout; cola acotada | 12/12 | CORREGIDO LOCALMENTE (PoC) |
| T12 SSRF | Red `--internal`; sin acceso a internet, base ni host | 12/12 | CORREGIDO LOCALMENTE (PoC) |
| T15 Sesión del navegador | Origen opaco, sin almacenamiento, CSP sin red, puente acotado | 7/7 | CORREGIDO LOCALMENTE (PoC) |
| T16 Exfiltración por servicios permitidos | Capacidades aprobadas, cuotas, notificaciones solo a miembros, eventos declarados, auditoría | 8/8 | Parcial: falta `integrations.http` con allowlist |
| Replay y falsificación de identidad | Ed25519, nonce de un uso, expiración de 60 s, hash de paquete y versión de concesión | 8/8 | CORREGIDO LOCALMENTE (PoC) |
| Revocación | Incremento de versión de concesión; el host no emite tokens nuevos | 8/8, 7/7 | CORREGIDO LOCALMENTE (PoC) |
| API como root | Usuario 10001, sin capacidades efectivas, no-new-privileges | 4/4 | CORREGIDO LOCALMENTE |

**Frontera del runtime aislado.** La protege el kernel del host:
- namespaces, cgroups, seccomp por defecto de Docker;
- `no-new-privileges` y todas las capacidades eliminadas;
- usuario 65534 y raíz de solo lectura.

Un escape de contenedor (vulnerabilidad del kernel o de runc) queda fuera de la defensa. Para código de terceros no revisado se recomienda el runtime gVisor (`--runtime=runsc`) cuando el host lo tenga; el orquestador ya acepta cambiar la imagen y añadir ese flag.

**Orquestación.** El orquestador usa la CLI de Docker, que equivale a root en el host. Es código confiable, el código del módulo no lo alcanza (no hay socket y la red es interna) y no acepta argumentos libres, porque el nombre del handler se valida con regex. En producción debe ser un supervisor separado con esa misma superficie fija.

## 4. Runtime declarativo

- **Representación:** JSON versionado (`runly.declarative/v1`), validado con esquemas estrictos. Rechaza claves desconocidas, rutas fuera de `backend/`/`frontend/`, capacidades no declaradas, permisos inexistentes y estados o campos referenciados que no existen.
- **Expresiones:** árbol JSON con 15 operaciones permitidas. Límites de 64 nodos, profundidad 8, 256 pasos y cadenas de 500. Solo se accede a campos declarados (`constructor` o `__proto__` se rechazan al cargar). No usa `eval` ni `Function`.
- **Lo que se demostró:**
  - entidad con campos y relación a contactos;
  - validaciones;
  - vistas de listado, formulario y detalle (como blueprints nativos de Runly UI, sin iframe);
  - acciones autorizadas con su permiso;
  - transiciones `borrador → enviada → aprobada/rechazada`;
  - una automatización que fija un campo, notifica y emite un evento.
- **Compatibilidad con RME3 actual:** la ModuleDefinition v1 del Builder ya describe entidades, campos, relaciones, vistas, permisos y automatizaciones. Un conversor v1 → declarativo es viable para las plantillas existentes. Las extensiones con código no se convierten: pasan al runtime aislado.

## 5. Runtime aislado (backend)

| Requisito | Implementación | Resultado medido |
|---|---|---|
| Fuera del proceso de la API | Contenedor por trabajo (`docker run --rm`) | — |
| No privilegiado | `--user 65534:65534`, `--cap-drop ALL`, `no-new-privileges` | uid 65534, sin capacidades |
| Sin credenciales ni secretos | Entorno vacío del host; token, URL y entrada por stdin | `secretsInEnv: []`, `environHasToken: false` |
| Sin filesystem del host | Solo `/ext` (código del módulo, ro) y `/runner` (ro) | `EROFS` en raíz y código; `/app` inexistente |
| Sin socket Docker | No se monta | `ENOENT` |
| Red restringida | `--internal` + proxy a un solo destino (gateway) | internet `ENETUNREACH`; DNS, base y host `ETIMEDOUT`; gateway alcanzable pero exige token (401) |
| CPU / memoria | `--cpus 0.5`, `--memory 128m` sin swap | Bucle activo ~51% CPU; acaparador de memoria terminado |
| Timeout y cancelación | `docker kill` al vencer | Bucle terminado a 3.4 s con límite de 3 s |
| Filesystem de solo lectura | `--read-only` + tmpfs `/tmp` 16 MB `noexec` | Escritura en `/tmp` sí, ejecución no |
| Aislamiento entre trabajos y módulos | Un contenedor nuevo por trabajo; token con alcance de módulo, empresa y usuario | Empresas A y B ven solo sus datos |
| PIDs | `--pids-limit` | Avalancha de procesos detenida con `EAGAIN` |
| Errores y reinicios | Cola acotada, `RUNTIME_BUSY`, `RUNTIME_KILLED`, `RUNTIME_TIMEOUT`, limpieza | 0 contenedores remanentes |

## 6. Frontend aislado

| Verificación | Resultado (Chromium) |
|---|---|
| Separación de orígenes | `window.origin === "null"` dentro del frame, y también al abrir su URL directamente |
| DOM y ubicación del host | No accesibles |
| `localStorage`, `sessionStorage`, cookies, IndexedDB | Lanzan error; el almacenamiento del host queda intacto |
| Globals con token o sesión | Ninguno |
| Red, popups, navegación del host | Bloqueados por CSP y sandbox |
| postMessage | Solo por un `MessageChannel` privado. Un mensaje falsificado a nivel `window` no se ejecuta. Una operación no concedida devuelve `CAPABILITY_DENIED` y no llega a la API |
| Revocación y limpieza | `revoke()` cierra el puerto y elimina el iframe; ninguna llamada posterior |

PWA y Tauri:
- El aislamiento depende de `sandbox` en el iframe y de la CSP de la respuesta del frame, ambos soportados por WebView2 (Windows) y WKWebView (macOS/iOS).
- `frame-ancestors` acepta orígenes `tauri://`.
- **No se probó en Tauri ni en dispositivos físicos.**

Recomendación de producción: servir los documentos de frame desde un host dedicado (por ejemplo, `modules.<dominio>`), aunque el origen opaco ya separa del shell.

## 7. Dependencias

| Paquete | Advisory | Versión efectiva antes → después | Alcance | Explotabilidad | Cambio de API | Pruebas |
|---|---|---|---|---|---|---|
| nodemailer | DoS por el parser de direcciones, *bypass* de `disableFileAccess`, desvío de dominio, caché DNS entre transportes | 8.0.10 → **10.6.1** | Runtime (correo SMTP por empresa) | Alcanzable con direcciones que aporta el usuario | `createTransport`/`sendMail` sin cambios para el uso de Runly | SMTP y soporte 108/110 (la falla es MCP preexistente); envío real con `streamTransport` y adjunto inline |
| xmldom | 12 avisos críticos/altos (inyección XML y DoS), sin parche en la rama 0.1 | 0.1.31 → **@xmldom/xmldom 0.8.15** (alias) | Runtime (plantillas DOCX/PPTX subidas por empresas) | Alcanzable por quien sube plantillas, en el proceso compartido | Misma API; 0.9 rompería (exige mimeType) | Plantillas 29/29; imagen insertada en un DOCX real |
| body-parser (vía SDK MCP → express) | DoS con bytes tras un cuerpo comprimido | 2.3.0 → **2.4.0** (override acotado `>=2.0.0 <2.4.0`) | Transitiva; la API no importa express (MCP sobre Hono) | No alcanzable hoy | Parche | Suites MCP |
| @modelcontextprotocol/sdk | — | 1.32.1 (1.32.2 disponible) | Runtime MCP | El aviso venía de body-parser | — | Sin cambio |

Auditoría completa:

| | Críticas | Altas | Moderadas | Bajas |
|---|---|---|---|---|
| Antes | 2 | 29 | 28 | 7 |
| Después | 1 | 14 | 12 | 7 |

Lo que queda crítico o alto:
- herramientas de instalación y migración vía Prisma CLI: `tar`, `effect`, `deepmerge-ts`, `mysql2`;
- dependencias del navegador de escritorio: `fabric`, `image-size` (pptxgenjs).

Ninguna es alcanzable desde tráfico o archivos no confiables en la API.

## 8. API no root

- **Imágenes API y worker:** usuario `runly` 10001/10001, `su-exec`, y el entrypoint `infra/docker/drop-privileges.sh`. Si arranca como root, entrega solo `/app/modules/custom` y `/app/apps/api/bundles` cuando su propietario difiere; el cambio es solo de propietario (sin `chmod` y sin tocar datos) y después suelta root. Si ya arranca sin root, no cambia nada.
- **Compose del instalador:** `cap_drop: ALL` + `CHOWN, FOWNER, DAC_OVERRIDE, SETUID, SETGID` (solo para el cambio de propietario de una vez) y `no-new-privileges`. El proceso en ejecución tiene `CapEff` 0.
- **Verificación** en volúmenes Docker con nombre, desechables:
  1. instalación limpia;
  2. actualización desde un volumen con archivos de root (los datos se conservan y el cambio de propietario no se repite);
  3. arranque directo como 10001;
  4. arranque real con migraciones, seed y `/health`, con el PID 1 como 10001.

  **Salvedad:** la imagen de `main` no se puede construir hoy porque `build-website-public-runtime.mjs` exige revisar Atlas 0.11.0 (trabajo de otra sesión). La capa no root se aplicó exactamente igual sobre la imagen de API más reciente construida localmente desde el mismo Dockerfile, que tiene código anterior.
- **Al desplegar** (no hecho): en el primer arranque el directorio `custom-modules` del host pasa al uid 10001. Los trabajos del instalador que sustituyen el entrypoint (`migrate`, `seed`) siguen corriendo como root una sola vez.

## 9. Rendimiento

| Medición | Línea base | Con la nueva arquitectura |
|---|---|---|
| Bundle inicial (gzip) | 277,819 B | 277,861 B (+42 B) |
| Cierre estático de `AppEntry` (gzip) | 2,413,820 B | 2,416,248 B (+2.4 KB, incluye cambios de otras sesiones) |
| Build web | 9.4 s | 10 s |
| Gateway en proceso | — | p50 0.09 ms · p95 0.15 ms · p99 0.23 ms |
| Gateway HTTP local | — | p50 0.66 ms · p95 1.2 ms · p99 2.2 ms |
| Hash de confianza de un módulo Builder (17 archivos, 53 KB) | — | Completo 2.7 ms; con caché 1.4 ms por import |
| Trabajo aislado: arranque en frío / repetido | — | ~1.0 s / mediana ~0.9 s (sin *pool*) |
| Memoria por ejecutor en reposo | — | 9.6 MiB de 128 MiB |
| CPU bajo carga | — | ~51% con `--cpus 0.5` |
| 8 trabajos concurrentes en 4 lugares | — | 3.8 s; el exceso de la cola se rechaza (`RUNTIME_BUSY`) |
| Recursos tras ejecutar | — | 0 contenedores remanentes; contadores en 0 |
| Componente aislado listo | — | ~250 ms (Chromium) |

Notas:
- Los módulos declarativos no necesitan contenedores: corren dentro del gateway, en el host.
- La sobrecarga por llamada (por debajo del milisegundo) es despreciable frente a la latencia de base local medida antes (~84 ms por consulta a Supabase remoto).
- No se cargan todos los módulos al iniciar sesión: los componentes aislados se montan bajo demanda (`loading="lazy"`).

No se hacen afirmaciones de escalabilidad más allá de estas mediciones locales.

## 10. Developer Hub, Marketplace y release coordinado

- **Contratos y paquetes:**
  - `@runly/module-compiler` mantiene la versión `0.1.0` y el Hub consume `0.1.0-source.<sha>`, el formato que publica el workflow de paquetes compartidos por revisión.
  - El cambio del compilador (`JSON.stringify` en defaults y `shortName`) no rompe nada: los paquetes generados son equivalentes en datos y solo cambian las comillas.
  - Los ZIP y revisiones anteriores siguen instalando, porque el staging no recompila.
  - El Hub guarda pantallas en `definition.extensions` y genera ZIP que solo entran por la subida del propietario.
  - Las firmas oficiales no cambian.
  - El MCP de Runly no tiene herramientas de instalación.
- **Orden de actualización** (preparado, **no publicado**):
  1. ERP: desplegar la release (incluye la migración `20270114000000` y la cuarentena), con el inventario previo de §6 de Stage 1.
  2. Paquetes compartidos: correr `shared-packages.yml` en el SHA de esa release, con `package=@runly/module-compiler` (o todos).
  3. Developer Hub: subir el pin de `@runly/module-compiler` a `0.1.0-source.<sha>`, correr sus pruebas de compilación y desplegar.
  4. Marketplace/catálogo: republicar desde el Hub actualizado los paquetes oficiales que se generen con el compilador nuevo.

  Revertir cada paso no afecta a los anteriores.

## 11. Verificación

| Suite | Resultado |
|---|---|
| `pnpm test:security` (15 archivos) | 137/137 |
| Gateway y declarativo (`gateway.test.js`) | 8/8 |
| Integridad de módulos (`module-trust.test.js`) | 4/4 |
| `verify-module-security.mjs` (Stage 1, API real) | 13/13 en Stage 1; no se repitió en Stage 2 |
| `verify-postgrest-exposure.mjs` | 7/7 en Stage 1 |
| `verify-isolated-runtime.mjs` | 12/12 |
| `verify-isolated-frontend.mjs` | 7/7 |
| `verify-secure-runtime-vertical.mjs` | 7/7 |
| `verify-nonroot-image.mjs` | 4/4 |
| Instalador y contratos Docker | 66/66 |
| Build web | Pasa |
| Lint | Solo el error preexistente ajeno (`scripts/verify-bookings-rooms.mjs:34`) |
| Privacy check | 40 hallazgos, los mismos de la línea base (el probe de egress dejó de usar una IP literal) |
| Auditoría de dependencias | §7 |
| Suite general | 6483 pass, 22 fail, 12 skipped de 6517; las 22 son exactamente la línea base, ninguna nueva |

## 12. Plan de migración gradual y rollback

| Paso | Cambio | Criterio de salida | Rollback |
|---|---|---|---|
| M0 (hecho) | Autoridad de código, cuarentena, escapes del Builder cerrados | Suites de seguridad en verde | Imagen anterior; los registros de confianza se ignoran |
| M1 (hecho, referencia) | Gateway v1, runtime declarativo, runner y frame aislados | Este documento | Código experimental sin conectar a la API |
| M2 | Conectar el gateway a la API detrás de un flag, con la fixture y sin módulos reales | E2E con la API real; staging | Apagar el flag |
| M3 | Conversor ModuleDefinition v1 → declarativo; comparar respuestas plantilla por plantilla | Sin diferencias en todas las plantillas | Seguir con el código generado |
| M4 | Supervisor de ejecución separado; *pool* tibio aislado; gVisor opcional | Revisión de aislamiento del *pool* | Volver a contenedor por trabajo |
| M5 | Componentes del Builder en frame aislado; host de frames dedicado | Pruebas de navegador, PWA y Tauri en dispositivos reales | Componente oficial en contexto (solo oficiales) |
| M6 | Retirar la carga en proceso de código de terceros | Inventario sin código de terceros en proceso | Cuarentena (no se borra nada) |

Cada paso se verifica en staging antes del siguiente. Ninguno borra datos de módulos.

## 13. Riesgos residuales

| ID | Riesgo | Severidad | Siguiente paso |
|---|---|---|---|
| R-1 | El código de módulos autorizados sigue en proceso hasta M2–M6 | P1 | Plan §12 |
| R-2 | Un escape de contenedor queda fuera de la defensa sin gVisor | P2 | gVisor opcional en M4 |
| R-3 | El orquestador necesita Docker (equivalente a root) | P1 al integrarse | Supervisor separado y mínimo (M4) |
| R-4 | ~1 s por trabajo aislado | Operativo | *Pool* aislado (M4); usar para automatizaciones |
| R-5 | En Windows con Docker Desktop, la PoC expone el gateway en todas las interfaces durante la prueba (sigue exigiendo token) | P3 (solo pruebas) | En producción, gateway en la red interna |
| R-6 | Imagen de API de `main` no construible por Atlas 0.11.0 | Bloqueador de release | Revisión de Atlas 0.11.0 (otra sesión) |
| R-7 | Aislamiento del frame no probado en Tauri ni en dispositivos físicos | P2 | M5 |
| R-8 | Falta `integrations.http` y `secrets.get` en el gateway | — | Siguiente iteración del gateway |
| R-9 | El directorio `custom-modules` del host cambia de propietario al desplegar | Operativo | Avisar en las notas de release |
| R-10 | Marketplace comunidad: el admin de empresa ve el error 403 al instalar, el botón no se oculta todavía | P3 | Ajuste de UI |
| B-1 | Sin staging | — | Ningún P0 cerrado |

P0-01 sigue **CONTENIDO** y P0-02 **CORREGIDO LOCALMENTE**. RME3 y Module Builder Next siguen en **NO GO** hasta M2–M3 en staging.
