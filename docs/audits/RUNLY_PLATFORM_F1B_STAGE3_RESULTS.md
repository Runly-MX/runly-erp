# RUNLY PLATFORM STABILIZATION — F1B Stage 3: integración del Secure Runtime

## Contexto

- **Base:** `main` @ `2e77b26d3`, con el árbol limpio al iniciar. Durante la fase entraron cambios de otras sesiones (login, website); no los incorporé ni los toqué.
- **Commits locales de esta fase**, sin push, PR ni despliegue: `d7909022d`, `01aac3c39`, `6fa4abf4a`, `a565246bd`, el del experimento del pool, el de symlinks, `7f5a98c12` y el de esta documentación.
- **Entorno:** estación Windows 11 con Docker Desktop y Playwright (Chromium, Firefox y WebKit). Todo se verificó en **infraestructura desechable**, nunca en staging, producción ni dispositivos físicos.
- **Estados:**
  - P0-01 sigue **CONTENIDO**.
  - RME3 y Module Builder Next siguen en **NO GO**.
  - Ningún candidato de release se declara aceptado: la imagen de la API de `main` no se puede construir (§9).

## 1. Preflight

| Revisión | Resultado |
|---|---|
| Suite de seguridad | 137/137 al inicio; ahora 148/148 con las suites nuevas (§11) |
| Integridad (`node_modules`, symlinks) | Vigente. La cadena de ejecución en proceso, el registro del gateway (rehash en cada llamada) y el supervisor (rehash por trabajo) comparan el hash exacto |
| Línea base de 22 fallas | Se mantiene: mismo conjunto (§11) |
| 40 hallazgos de privacidad | Todos son de la regla `non-example-ipv4`, en 4 archivos de la lógica y las pruebas de proxies de confianza (`client-ip.test.js`, `trusted-proxies*.mjs`, `docs/deployment/trusted-proxies.md`). Ninguno es infraestructura real (detalle abajo). Son falsos positivos de la regla |
| Atlas 0.11.0 | Sigue bloqueando: `scripts/build-website-public-runtime.mjs` solo admite hasta 0.10.0 y `main` usa 0.11.0. Es trabajo pendiente de otra sesión; no lo toqué |

Detalle de los 40 hallazgos de privacidad:
- 35 son rangos privados o reservados (RFC 1918, loopback, link-local, CGNAT);
- 12 son direcciones de documentación (RFC 5737);
- el resto son `1.2.3.4` de prueba, `999.1.1.1` (inválida a propósito) o `0.0.0.0`.

## 2. Capability Gateway integrado (experimental)

- **Flag:** `RUNLY_SECURE_RUNTIME=experimental`. Con cualquier otro valor no se monta nada y no se crea el esquema. Apagarlo no relaja la cuarentena de Stage 1, porque son mecanismos independientes (`integration-flag.test.js`).
- **Identidad y contexto, siempre derivados por el host:**
  - el módulo sale de un registro de paquetes declarativos cuyos bytes exactos son de confianza; se vuelve a comprobar el hash en cada llamada;
  - empresa, usuario y permisos salen del `tenantContext` de la sesión;
  - las capacidades salen solo de la concesión del propietario (denegadas por defecto).
- **Tokens:** se emiten en el servidor con una validez de 30 s y nunca salen de la API.
- **Confused deputy:** la API no acepta del cuerpo de la petición el módulo, la empresa, el usuario ni los permisos. Cada llamada se evalúa con los permisos que la sesión del usuario ya tiene, y cada operación se cruza con su permiso por entidad y la capacidad aprobada.
- **Carreras entre emisión, uso y revocación:** revocar incrementa la versión de concesión y el gateway la compara en cada llamada, así que un token emitido antes de la revocación falla en su siguiente uso. Además, el supervisor mata los trabajos del módulo.
- **Protecciones:**
  - nonce de un solo uso y expiración;
  - límite de llamadas por módulo y empresa, de notificaciones y de 20 operaciones simultáneas por empresa;
  - timeouts del gateway y de cada sentencia;
  - idempotencia por módulo, empresa y usuario;
  - auditoría sin datos sensibles;
  - errores normalizados (`{ error, message }`), sin detalles internos.
- **Efectos externos:** no hay. Notificaciones y eventos son internos y quedan cubiertos por la idempotencia.

Evidencia: `verify-secure-runtime-api.mjs` **10/10** con la API real:
- denegación por defecto;
- solo el propietario concede capacidades;
- creación y aprobación con el tenant tomado de la sesión;
- dos empresas, y un usuario que cambia de empresa sin cruzar datos;
- idempotencia;
- extensión ejecutada a través del supervisor;
- ruta de frame con CSP;
- revocación inmediata;
- paquete alterado que deja de estar disponible sin caer al runtime anterior;
- errores normalizados.

## 3. Supervisor de ejecución

Diseño, threat model y recuperación: `docs/architecture/2026-11-24-execution-supervisor.md`. En resumen:
- Es un proceso separado; la API no tiene acceso al socket de Docker.
- Acepta un contrato cerrado y firmado con HMAC (marca de tiempo y nonce).
- Los perfiles están en un allowlist con imagen fijada por digest; los límites los fija el supervisor.
- Recalcula el hash del paquete por trabajo.
- Mantiene un registro de trabajos con ejecución como máximo una vez. Tras un reinicio, los trabajos que estaban en curso quedan como `INTERRUPTED` y no se relanzan, y los contenedores huérfanos se matan al arrancar (hueco encontrado y corregido en esta fase).
- Admisión con cola acotada, cancelación por módulo y auditoría.

Evidencia: `supervisor.test.js` 5/5:
- solo acepta peticiones firmadas y frescas;
- el contrato está cerrado: imagen, mounts, red, comando, perfil, ruta y timeout fuera de rango dan 422;
- rechaza un hash que no coincide;
- `jobId` duplicado se rechaza, el trabajo interrumpido no se relanza y los huérfanos se limpian;
- la saturación responde 429;
- la auditoría no guarda tokens.

**Riesgo arquitectónico.** Quien tenga el socket de Docker tiene root en el host. Para producción recomiendo Docker rootless o `userns-remap`, y gVisor para código de terceros sin revisar. No se integró en el compose del instalador: requiere revisión.

## 4. Estrategia de ejecución y rendimiento

| Tipo | Dónde corre |
|---|---|
| A. Operaciones declarativas síncronas (CRUD, formularios, validaciones, reglas) | En el gateway dentro de la API, **sin contenedor** |
| B. Automatizaciones declarativas | En el gateway, como efectos de una transición |
| C. Código personalizado en segundo plano | Supervisor, un contenedor por trabajo |
| D. Código personalizado interactivo | **No soportado todavía**: ~0.5–1 s por trabajo es demasiado para la ruta de una petición |

Pool tibio (`experiment-warm-pool.mjs`):
- latencia de arranque: de ~445 ms a ~122 ms;
- **sin limpieza**, el segundo trabajo leyó el archivo del primero y vio su proceso suelto;
- **con limpieza**, el proceso desapareció pero el archivo quedó, porque la limpieza falló en silencio.

**No se adopta.** El aislamiento dependería de una limpieza frágil.

| Medición | Valor |
|---|---|
| Gateway en proceso (Stage 2) | p50 0.09 ms, p95 0.15 ms |
| Gateway HTTP local (Stage 2) | p50 0.66 ms, p95 1.2 ms |
| Contenedor por trabajo, sin red ni gateway | mediana 445 ms (365–506) |
| Trabajo completo con gateway (Stage 2) | ~0.9–1.0 s |
| `docker exec` en un ejecutor tibio | mediana 122 ms |
| Ejecutor en reposo | 9.6 MiB de 128 MiB |
| Rehash por llamada (con caché) | ~1.4 ms |
| Bundle inicial / `AppEntry` (gzip) | 277,858 B / 2,417,014 B (+766 B por `IsolatedComponent`) |

## 5. Convertidor RME3 → declarativo

`apps/api/src/secure-runtime/converter.js`:
- Es puro: lee la definición guardada y nunca importa código. Una prueba lo confirma con un canario.
- Conserva clave, entidades, campos (tipos, requerido, opciones y valores guardados tal cual, defaults), relaciones con Contactos y con entidades del mismo módulo, permisos por entidad con las mismas claves, navegación y tabla de origen.
- Clasifica cada elemento como `preserved`, `transformed`, `review` o `unsupported`.

**Clasificación de las plantillas del Builder** (todas `DECLARATIVE_WITH_REVIEW`):

| Plantilla | Puntos de revisión |
|---|---|
| visitas | delete; relación con RR.HH.; Kanban y Dashboard |
| prestamo-herramientas | delete; relaciones con inventario y RR.HH.; Kanban y Dashboard |
| mantenimiento | delete; relación con inventario; decimal → número; Kanban y Dashboard |
| solicitudes | delete; relación con RR.HH.; markdown → texto largo; Kanban y Dashboard |
| inventory-lite | delete; decimal; Kanban y Dashboard |
| simple-crud | delete |

**Clases y cuándo aplican:**
- `FULLY_DECLARATIVE`: todo se conserva sin revisión.
- `DECLARATIVE_WITH_REVIEW`: hay elementos marcados para revisar.
- `HYBRID_REQUIRED`: tiene extensiones con código.
- `UNSUPPORTED`: entidad sin `company_id` o sin borrado lógico, o definición inválida.
- `LEGACY_TRUSTED` o `QUARANTINED`: el módulo no tiene definición del Builder y solo se puede clasificar por su estado de confianza.

Pruebas: `converter.test.js` 4/4. Ningún campo desaparece sin un aviso de revisión, los cambios de significado se reportan, el código nunca se ejecuta y la clasificación es conservadora.

## 6. Compatibilidad de datos

**Hallazgo arquitectónico.** El almacén JSONB de Stage 2 habría creado una segunda fuente de verdad. Los módulos convertidos operan ahora **sobre sus tablas RME3 existentes** (`rme3-table-store.js`):
- columnas tomadas solo de la definición y validadas como identificadores;
- filtro por `company_id` y `enabled = true`;
- concurrencia optimista sobre `updated_at`.

| Aspecto | Resultado (`verify-declarative-data-compat.mjs` 8/8, módulo real del Builder) |
|---|---|
| Identificadores de registros | Los mismos IDs por los dos runtimes |
| Tablas existentes | Mismas tablas, sin copia ni migración |
| Escrituras en ambos sentidos | Lo que escribe uno lo ve el otro |
| Concurrencia | Una versión vieja se rechaza (409) |
| Empresas | Aislamiento en la tabla compartida |
| Permisos | Mismas claves; mismos 200 y 403 que la API anterior |
| Configuración por empresa | `company_module` sin cambios |
| Dry-run | Convertir no toca la base |
| Activación | Explícita: escribir el paquete, aprobarlo y conceder capacidades |
| Rollback | Quitar el paquete deja todas las filas y la API anterior sigue funcionando |
| Archivos y adjuntos | `file_asset` no se toca; los adjuntos siguen con sus rutas actuales (el gateway responde 409 a `files.attach` en tablas RME3) |
| Historial y auditoría | Las escrituras del gateway quedan en `audit_log`. El historial de actividad generado por las rutas del Builder **no** se genera desde el gateway (pendiente) |
| Migraciones | Ninguna: el runtime declarativo no ejecuta DDL sobre tablas de módulos |

Hallazgo preexistente: el ciclo de vida de módulos solo resuelve carpetas dentro de `<raíz>/modules` e ignora `RUNLY_MODULES_DIR`. Con los módulos fuera de la raíz, se instalan sin tablas y sin error. En el instalador no ocurre (`/app/modules/custom`).

## 7. Frontend

| Elemento | Estado |
|---|---|
| Frame aislado | 7/7 en **Chromium, Firefox y WebKit**: origen opaco; sin DOM, almacenamiento, cookies, IndexedDB ni sesión del host; CSP sin red, popups ni navegación; puente estricto; revocación |
| `IsolatedComponent` (`@runly/ui`) | Revoca el frame al desmontar, al cambiar de empresa y al cambiar de sesión. Carga perezosa del iframe |
| Ruta del frame | Pública, sin credenciales, con CSP `sandbox allow-scripts` y `frame-ancestors` configurables |
| Renderer declarativo | Mapeo a blueprints listo y probado. **No conectado** a `RunlyTable`/`RunlyForm`: esos renderers cargan sus propias rutas REST y necesitan un adaptador de datos (siguiente paso) |
| Tauri, PWA y nativo | **No probados.** WebKit cubre el motor de Safari y WKWebView; WebView2 es Chromium. La compatibilidad nativa no se declara |

## 8. Feature flags y activación gradual

| Nivel | Estado | Comportamiento |
|---|---|---|
| Instalación | Disabled (por defecto) | Sin rutas ni esquema |
| Instalación | Experimental (`RUNLY_SECURE_RUNTIME=experimental`) | Rutas activas solo para paquetes declarativos aprobados |
| Módulo | Sin paquete | `MODULE_NOT_AVAILABLE` |
| Módulo | Paquete sin aprobar o alterado | `MODULE_NOT_AVAILABLE`; nunca cae al runtime inseguro |
| Módulo | Aprobado sin capacidades | `CAPABILITY_DENIED` |
| Módulo | Aprobado con capacidades | Operativo |
| Módulo | En cuarentena (Stage 1) | Su código en proceso no corre, con o sin flag |

Los estados Validated y Enabled por módulo se definirán al pasar a staging; hoy no hay activación general.

Comportamiento ante cada acción:

| Acción | Efecto |
|---|---|
| Cambiar el flag | Requiere reiniciar la API |
| Reiniciar la API | Los tokens anteriores dejan de valer, porque la clave del host es por proceso |
| Reiniciar el supervisor | Los trabajos en curso quedan `INTERRUPTED` y los huérfanos se matan |
| Actualizar la imagen | Los paquetes y concesiones siguen en disco y en `instance_config` |
| Restaurar una versión anterior | Sin el código nuevo, nada de esto existe y los datos quedan en sus tablas |

## 9. Imágenes no root

- **No se construyó la imagen real del candidato:** `main` falla en `build-website-public-runtime.mjs` por Atlas 0.11.0, que es de otra sesión.
- **Verificado sobre la capa no root aplicada a la imagen local anterior** (5/5): instalación limpia, actualización desde un volumen de root con los datos conservados, **volumen con symlink que impide el arranque sin cambiar nada** (corregido en esta fase), arranque directo como 10001 y arranque real con migraciones y `/health`.
- **Idempotencia:** el segundo arranque no vuelve a cambiar propietarios.
- **Rollback:** la imagen anterior corre como root y puede leer el volumen ya entregado a 10001.
- Esta evidencia **no** acepta el candidato actual; hay que repetirla con la imagen real cuando Atlas esté resuelto.

## 10. Developer Hub, Marketplace y compatibilidad de versiones

| Componente | Versión / contrato | Compatibilidad |
|---|---|---|
| ERP | `main` local (no publicado) | Acepta paquetes ZIP v1, catálogo v1, v2 y oficial, y Builder ModuleDefinition v1 |
| `@runly/module-compiler` | `0.1.0` publicado como `0.1.0-source.<sha>` | El Hub fija el SHA exacto. Hace falta republicar en un SHA ≥ `164353d6d` para la emisión segura de defaults y `shortName` |
| SDK (`@runly/sdk`) | Workspace | Agrega `getModuleTrust` y `decideModuleTrust` (aditivo) |
| Protocolo del gateway | `runly.capabilities/v1` | Una versión distinta se rechaza (`PROTOCOL_UNSUPPORTED`), así que un cliente incompatible falla de forma segura |
| Definición declarativa | `runly.declarative/v1` | Esquema estricto; una versión desconocida no carga |
| Contrato del supervisor | Esquema cerrado | Un campo de más da 422 |
| Developer Hub | Pin `0.1.0-source.fd16dc513` (anterior al arreglo) | Seguro mientras el ERP recompile al publicar desde el Builder. Los ZIP del Hub solo entran por el propietario |
| Marketplace | Firmas oficiales sin cambios | Los paquetes antiguos se instalan como código con autoridad, sujetos a la cuarentena de Stage 1 |

Orden de publicación (preparado, **no publicado**):
1. ERP: la release que contiene la cuarentena y la migración `20270114000000`.
2. Paquetes compartidos en ese SHA.
3. Pin del Hub y sus pruebas de compilación.
4. Republicación de los paquetes oficiales.

Un paquete antiguo no reintroduce las vulnerabilidades corregidas: el Builder recompila siempre con el compilador corregido, y los ZIP antiguos solo entran como código con autoridad explícita.

## 11. Verificación

| Prueba | Resultado |
|---|---|
| `pnpm test:security` | 148/148 |
| Gateway y declarativo | 8/8 |
| Convertidor | 4/4 |
| Flag | 2/2 |
| Supervisor | 5/5 |
| API real + supervisor + Docker | 10/10 |
| Compatibilidad de datos (módulo real del Builder) | 8/8 |
| Frontend aislado, 3 motores | 7/7 en cada uno |
| Imagen no root (capa sobre imagen anterior) | 5/5 |
| Experimento del pool tibio | Rechazado con evidencia |
| Build web | Pasa |
| Lint | Solo el error preexistente ajeno (`scripts/verify-bookings-rooms.mjs:34`) |
| Privacidad | 40 hallazgos de la línea base (§1) |
| Auditoría | 1 crítica / 14 altas / 12 moderadas / 7 bajas; ninguna crítica o alta alcanzable en el runtime de la API (igual que en Stage 2) |
| Suite general | 6494 pass, 22 fail, 12 skipped de 6528; las 22 son exactamente la línea base, ninguna nueva |

## 12. Riesgos residuales y criterios de aceptación operativa

| ID | Riesgo | Severidad | Bloquea |
|---|---|---|---|
| R-1 | Socket de Docker en el supervisor, equivalente a root en el host | P1 al desplegar | Requiere Docker rootless o userns, y revisión |
| R-2 | Imagen real del candidato no construible (Atlas 0.11.0) | Bloqueador de release | Aceptación del candidato |
| R-3 | Sin borrado lógico, sin automatizaciones del Builder y sin relaciones externas fuera de Contactos en declarative/v1 | P2 | Conversión completa de módulos reales |
| R-4 | Renderer declarativo no conectado a `RunlyTable` y los demás | P2 | Uso por usuarios finales |
| R-5 | El historial de actividad no se genera desde el gateway | P2 | Paridad funcional |
| R-6 | El código personalizado interactivo no está soportado (~1 s por trabajo) | P3 | Extensiones interactivas |
| R-7 | Tauri, PWA y dispositivos físicos sin probar | P2 | Compatibilidad nativa |
| R-8 | El ciclo de vida ignora `RUNLY_MODULES_DIR` fuera de la raíz (preexistente) | P3 | — |
| R-9 | Error del `activity-publisher` (`entityId` que no pasa `uuid()` de zod) visto en el log de la API desechable; posiblemente relacionado con la subida de zod 4.6 | P3, por investigar | — |

**Criterios para pasar a staging:**
1. La imagen real se construye y pasa `verify-nonroot-image.mjs`.
2. `verify-secure-runtime-api.mjs` y `verify-declarative-data-compat.mjs` pasan contra esa imagen.
3. El supervisor corre con Docker rootless o `userns-remap`.
4. El adaptador de datos del renderer está listo, con borrado lógico y actividad.
5. Hay un inventario de módulos reales convertidos en dry-run, revisado.

**Criterios para producción:**
1. Staging en verde con datos sintéticos de dos empresas.
2. Revisión de seguridad del supervisor.
3. Plan de reversión probado.
4. Activación por instalación y módulo.
