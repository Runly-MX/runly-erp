# Website responsive — actualización por el operador

Esta entrega publica paquetes y adopta dependencias; **no ejecuta el despliegue**.
Usa los checkouts, configuración, permisos y backup que ya tiene la instalación.
No crea staging, destinos SSH, claves ni variables privadas nuevas.

## Revisiones y orden

| Componente | Revisión aprobada de código |
| --- | --- |
| ERP y fuente de los ocho paquetes | `a448509ded5fad1b9b4d129bcff9482e4a9b7de2` |
| Developer Hub con adopción | `b443e27cde7129ee21243a1bb845046b1c87fedc` |
| Hub antes de adoptar, sólo como referencia de código | `bcc584bdfae574d22bfa78772a20385acbdabb24` |

Actualizar primero ERP (API, worker y web juntos); comprobar su renderer e
importador. Actualizar después Hub y su editor aislado. Finalmente refrescar el
contrato del conector MCP y ejecutar la aceptación. El rollback se basa en la
revisión **realmente activa** capturada antes, no en suponer que era la de esta tabla.

La publicación de paquetes es el
[run 45046425281](https://github.com/Runly-MX/runly-erp/actions/runs/45046425281).
Los ocho `@runly-mx/*` usan
`0.1.0-source.a448509ded5fad1b9b4d129bcff9482e4a9b7de2`.
[Hashes y manifiesto](../releases/website-responsive-shared-a448509ded5f.json).
No se publicaron imágenes Docker ERP ni se movieron tags `latest` en esta entrega.

## 1. Capturar el punto de retorno

En cada checkout existente, guardar `git rev-parse HEAD` y comprobar
`git status --short`. Si hay cambios, conservarlos y resolverlos con su dueño;
no usar reset/stash para continuar. Capturar por el procedimiento vigente las
imágenes activas por digest, la configuración y un backup verificable. Mantener
esa evidencia fuera de Git porque puede contener configuración operativa privada.

En una instalación Hub gestionada por sus scripts:

```bash
pnpm prod:status
```

Guardar la revisión `installer.current` y las imágenes activas como punto de
retorno. Si informa que no hay instalación, no ejecutar `prod:setup` como sustituto:
identificar el procedimiento con el que ya está operando ese Hub.

## 2. ERP: checkout y compilación

Desde el checkout ERP existente, con árbol limpio:

```bash
ERP_APPROVED_SHA=a448509ded5fad1b9b4d129bcff9482e4a9b7de2
test -z "$(git status --porcelain)"
git fetch origin main
git merge --ff-only "$ERP_APPROVED_SHA"
test "$(git rev-parse HEAD)" = "$ERP_APPROVED_SHA"
pnpm install --frozen-lockfile
pnpm --filter @runly/desktop build:web
pnpm check:privacy
```

Si el checkout ya avanzó más allá de esa revisión, el último test se detiene:
revisar esa nueva revisión, sin retroceder ni descartar cambios. Los commits de
documentación posteriores no cambian los paquetes publicados.

La compilación web se ejecutó localmente en esta entrega. API/worker son Node y
usan las fuentes del mismo checkout; en una instalación por imágenes necesitan
reconstruirse y activarse también. Para construir en el daemon del servidor:

```bash
docker build --pull=false -f infra/docker/api.Dockerfile \
  -t raulbellosom/runlyerp:api-a448509ded5f .
docker build --pull=false -f infra/docker/worker.Dockerfile \
  -t raulbellosom/runlyerp:worker-a448509ded5f .
docker build --pull=false -f infra/docker/web.Dockerfile \
  -t raulbellosom/runlyerp:web-a448509ded5f .
```

Estos son builds locales, no pushes. Se revisaron los Dockerfiles y el plan de
las tres imágenes; estos tres builds Docker ERP no se ejecutaron aquí. Se omite
el override localhost del modo de laboratorio de `release-selective --build`:
el web distribuido recibe su configuración por el entrypoint habitual.

### Instalación externa gestionada por el Installer existente

Aplicar este bloque sólo cuando esa instancia ya usa `.env.external` y
`setup-external.mjs`. Conservar su configuración y backups; primero verificar
los gates de las entregas Ticketing/LMS integradas en la misma revisión, incluidos
los del [RC Ticketing](../releases/TICKETING_V1_RELEASE_CANDIDATE.md).

```bash
test -f infra/installer/.env.external
RUNLY_API_IMAGE=raulbellosom/runlyerp:api-a448509ded5f \
RUNLY_WORKER_IMAGE=raulbellosom/runlyerp:worker-a448509ded5f \
RUNLY_WEB_EXTERNAL_IMAGE=raulbellosom/runlyerp:web-a448509ded5f \
node infra/installer/setup-external.mjs --skip-pull
```

El script usa la configuración existente, sus verificaciones de Storage/Realtime,
migraciones y recreación. `--skip-pull` utiliza las imágenes recién construidas:
sus tags no existen por el hecho de haber publicado los paquetes compartidos.
No usar este bloque para una instancia de otro tipo; conservar su orquestador
vigente y activar las tres imágenes con las mismas configuraciones y volúmenes.

Verificar `/health` por el origen API existente y el sitio publicado por su
origen real. El navegador debe cargar el nuevo web/renderer, no una caché anterior.

## 3. Developer Hub: preparación y actualización

Desde el checkout operativo existente, con el estado anterior ya capturado:

```bash
HUB_APPROVED_SHA=b443e27cde7129ee21243a1bb845046b1c87fedc
test -z "$(git status --porcelain)"
git fetch origin main
git merge --ff-only "$HUB_APPROVED_SHA"
test "$(git rev-parse HEAD)" = "$HUB_APPROVED_SHA"
pnpm install --frozen-lockfile
pnpm --dir apps/api install --frozen-lockfile
pnpm --dir apps/worker install --frozen-lockfile
node scripts/verify-shared.mjs
node -p "require('@raulbellosom/atlas-web-builder/package.json').version"
pnpm build
sudo pnpm prod:prepare
```

Esperado: Atlas **0.9.0**, distribución `github-packages`, ocho paquetes de `a448…`.
`prod:prepare` construye y verifica la revisión/configuración/validador/imágenes
sin detener el runtime actual. Usa el acceso read:packages ya provisionado fuera
del checkout. Mantener las variables Website existentes; no copiar valores de
ejemplo ni regenerar locks en el servidor para superar un error.

Después de revisar el plan y disponer de la aceptación operativa correspondiente:

```bash
sudo pnpm prod:update
sudo pnpm prod:status
```

El actualizador realiza drain, parada de los componentes afectados, backup,
migración, arranque y health/smoke. **No sustituirlo por cambiar sólo el web o el
worker:** el migrador registra la nueva identidad en `hub.toolchain_current`.
La prueba local detectó `TOOLCHAIN_MISMATCH` hasta registrar esa identidad con el
migrador oficial; no se debe desactivar ese control.

La instalación remota gestionada y sus claves privadas no se inspeccionaron ni
ejecutaron desde esta sesión. Ante un preflight fallido, conservar su diagnóstico
y corregir su causa antes de activar; no instalar una configuración nueva por
inferencia.

## 4. Verificación posterior

En el checkout Hub desplegado, comprobar los ocho inventarios completos:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
import {verifyInstalledToolchain} from './packages/contracts/toolchain.js';
import {loadBuilderCatalogs} from './apps/api/src/services/marketplace-validation/builder-catalogs.js';
const lock=JSON.parse(fs.readFileSync('shared-packages.lock.json'));
const identity=verifyInstalledToolchain(lock.packages);
const loaded=loadBuilderCatalogs({includeCandidate:false});
console.log({revision:identity.revision,toolchainId:identity.id,
  catalogs:Object.fromEntries(['0.8.2','0.9.0'].map(version=>[version,
    Object.entries(loaded.identities[version]).map(([digest,catalog])=>({digest,blocks:catalog.blocks.length}))]))});
JS
```

Esperado: toolchain
`a17a090255e892b495a51acec74419305ef0547978c683e2d4fb997a457ffa90`;
0.8.2 con 156/157 bloques y 0.9.0 con 157/158, los cuatro digests del
[informe de cierre](../architecture/website-responsive-foundation-publication-close.md).

Comprobar además en los orígenes reales ya configurados:

1. API health, portal autenticado, editor Website y renderer público sin errores
   de red, CSP ni hidratación; API, worker y base con la misma toolchain.
2. Contrato MCP: `runly_website_contract` con `builderVersion: "0.9.0"` anuncia
   el digest canónico `f5b5d67e…`, 157 bloques y la variante ERP `bf50cd9e…`.
   Comprobar también ambos catálogos 0.8.2. Si el conector no ofrece `catalogDigest`,
   actualizar/reconectar su inventario y releer; no ampliar scopes por inferencia.
3. En un recurso de prueba 0.9.0: Inspector móvil/tablet/desktop, guardar, reabrir,
   undo/redo, ceros explícitos, imágenes PNG/WebP y preview privado/público.
4. Anchos 320, 360, 390, 768, 820, 1024, 1280, 1440 y 1920 en Chromium/WebKit;
   viewport 1920 con canvas 390, navbar, foco, overflow y persistencia responsive.
5. Newsletter transaccional en un recurso de prueba y con el destinatario de
   prueba autorizado. SENDA se usa sólo para lectura y capturas, sin envíos ni
   guardados: revisión 21, navbar, hero, categorías, producto, historias,
   beneficios, footer e imágenes. Registrar errores de diseño por separado de
   defectos del componente o renderer.

## 5. Retorno y rollback

ERP: conservar las tres imágenes anteriores por digest/ID y la configuración
capturada. Reaplicar las tres referencias juntas mediante el procedimiento de
la instancia; no borrar volúmenes, restaurar bases ni intentar deshacer migraciones.
Repetir health y los documentos históricos. Las imágenes previas de la instancia
son el punto de retorno; no se conoce su digest desde esta sesión.

Hub dispone del comando `sudo pnpm prod:rollback --to <SHA-anterior-activo>`,
que exige una release retenida y rechaza esquemas posteriores desconocidos.
**Esta adopción cambia la toolchain de la base:** el rollback de runtime por sí
solo no registra la identidad anterior. Para esta entrega, el retorno coherente
se prepara como una reversión revisada y un update normal:

```bash
# En el checkout de desarrollo, conservando la historia de main:
git revert b443e27cde7129ee21243a1bb845046b1c87fedc
# Verificar manifests/locks anteriores, pruebas y build antes de enviar.
# En el servidor, actualizar a ese nuevo SHA aprobado y ejecutar:
sudo pnpm prod:prepare
sudo pnpm prod:update
sudo pnpm prod:status
```

Así el migrador oficial vuelve a registrar la identidad correspondiente a los
paquetes anteriores, sin SQL manual ni desactivar el fencing. No ejecutar una
reversión aquí por adelantado: anularía la adopción entregada. Mantener sin cambios
los paquetes, assets y revisiones almacenados. El runtime anterior puede rechazar
la edición de documentos 0.9.0; comprobar que sus bytes/SHA y propiedades siguen
intactos y volver a la revisión nueva para editarlos.

Este procedimiento de servidor no se ensayó remotamente. La aceptación real y el
ensayo de retorno siguen a cargo del operador; las pruebas locales no acreditan
que producción ya esté actualizada o aceptada.
