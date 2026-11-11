# Website Marketplace: informe final de distribución controlada

## Ejecución autorizada y bloqueo de bytes — 2026-11-11

Se ejecutó `git fetch origin` en los tres repositorios, con árboles limpios y `main` como rama. Los commits requeridos W1/W2/W3 y del cierre son ancestros de las revisiones publicadas. Los tres pushes fueron normales y fast-forward; no se reescribió historia:

| Repositorio | SHA remoto del push funcional |
| --- | --- |
| ERP | `e641756d04b798d0bb27bd023554b3eda8bb69ea` |
| Developer Hub | `fe0f363b7e4472bcce4ce26e1987a86f2e27e7af` |
| Runly Web | `ca22e40fd7cb33921b3c5663b91a768c698ddfa9` |

El commit documental de este resultado es posterior al push funcional ERP. No modifica paquetes, código ni locks. La revisión fuente de paquetes continúa siendo `3a071090875b9f3803f895e00d78fc25a047e829`.

**Paquetes publicados: 0/8. Locks adoptados: ninguno. Instalación limpia desde el registro: pendiente. Producción: sin intervención.** Se detuvo la publicación al fallar la comparación SHA-256 exigida por este runbook; no se ejecutó `publish=true`, no se concedieron accesos y no se actualizaron plugins ni recursos Marketplace.

La [preparación Actions 43121932322](https://github.com/Runly-MX/runly-erp/actions/runs/43121932322) terminó correctamente: revisión fuente, instalación frozen, pruebas dirigidas y compilación/inspección de cada módulo distribuido. El guard local de comparación con el manifiesto autorizado **falló**, antes de publicar. El manifiesto Linux tiene SHA-256 `a8b87a051de59663cda395e87b5e86d952f52c2d8f3b57f8d7ed9dab4d25cadf`, diferente del local autorizado `99245bf43ac8622cb765f8333a2e4a7cfe6aa3a5264fd804235f99be1281ac03`.

### Diagnóstico concreto y candidato Linux pendiente de aprobación

La inspección segura de ambos conjuntos verifica mismos nombres, versiones, dependencias, manifiestos internos, licencias, paths, modos, uid/gid y mtime de archivos. El byte de plataforma gzip es 10 en Windows y 3 en Linux. En seis CSS y `LICENSE.shadcn.txt`, Git convierte CRLF/LF según plataforma: `.gitattributes` fija LF para JS/JSON/Markdown, pero no para CSS/TXT. Normalizando sólo CRLF a LF, todos los contenidos de ambos conjuntos coinciden. Los inventarios/contentDigest de seis paquetes coinciden sin normalizar; UI y website-blocks difieren por esos finales de línea. El aviso shadcn conserva el mismo texto y obligaciones. No es un conflicto de una versión publicada ni un cambio de comportamiento, pero **los bytes e integridades son distintos y no se aceptan automáticamente**.

Los ocho artefactos de Actions fueron inspeccionados con `readConsumerArtifacts`: inventarios, SHA-256, SHA-512, identidades y licencias válidos. El candidato Linux usa para los ocho la versión exacta `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` y propone los siguientes SHA-256, **todavía no autorizados en sustitución de los locales**:

| Paquete físico | SHA-256 tarball Linux |
| --- | --- |
| `@runly-mx/core` | `262ad4cc7588b69267301aab5e5d5bdad88e59614814676756ef4664766855fb` |
| `@runly-mx/module-engine` | `80c9fbdfbe072b51f1b119f4644ca4320ac1c1531ef0e258098000578acb09ee` |
| `@runly-mx/module-compiler` | `fb26f66de5c7b2f6c6afa8c2e7259325969de049b682e6a7fbf3da1da4a41186` |
| `@runly-mx/ui` | `1d3b5ef7dddf60ba69607994328895194019d63c6a4d343b3740afe6716baf00` |
| `@runly-mx/sdk` | `092db2f04ffe99e9b8a13210eea39701dc822ad39b1d1abb4e6a5b2d4157d144` |
| `@runly-mx/preview-runtime` | `198d2335a5689a5426c7b010737b8f636ada656c30b2afee523963ea93adf314` |
| `@runly-mx/studio-interchange` | `c74770d92a1866023ab9fd0d57aec797983a473a9ba0c971d412d294e7045aef` |
| `@runly-mx/website-blocks` | `66688ff4113cb8898c0d77452608fb625c61daf2c6a65b01fbf6c922fddcafc0` |

Los originales locales permanecen intactos. El artefacto Linux está en `.artifacts/website-integration/actions-43121932322/3a071090875b9f3803f895e00d78fc25a047e829/manifest.json`, junto a los ocho TGZ. Evidencia adicional privada: `authorized-push-preflight.json`, `actions-preparation-mismatch.json`, `actions-preparation-byte-diagnosis.json` y `authorized-actions-preparation.json` bajo `.artifacts/website-integration/`.

Para continuar hace falta aceptar expresamente este manifiesto Linux como candidato canónico, con los ocho hashes de esta tabla, conservando nombres/versiones y el publicador existente. Antes de ejecutar `publish=true`, actualizar el hash esperado del guard y el manifiesto de adopción a ese conjunto; no conservar los hashes locales como si coincidieran. La nueva ejecución Linux debe regenerar exactamente este manifiesto, y cualquier diferencia debe detener la publicación de nuevo. No se modifica H7, no se publica Elevate y no se instala una versión distinta de las ocho aprobadas.

### Comandos VPS: preparados, no ejecutados

El bloque de lectura del registro de este informe sigue siendo válido; después de publicar deberá recibir el manifiesto Linux aceptado. Todavía no puede obtener `published-candidate`, `ok:true`, `packages:8`. No ejecutar despliegue hasta completar publicación, adopción/commit de locks y prueba limpia. Los comandos ERP/Hub inferiores son únicamente para la autorización posterior del operador.

Runly Web usa el flujo de runtime/estático emparejado existente, no una copia de `dist/client`. Para un servidor ya preparado según `runly-web/docs/MARKETPLACE_HOSTING.md`, con checkout limpio fijado a `ca22e40fd7cb33921b3c5663b91a768c698ddfa9`, y variables de rutas/origen reales configuradas fuera del repositorio, los comandos posteriores son:

```bash
cd "$WEB_CHECKOUT"
test "$(git rev-parse HEAD)" = ca22e40fd7cb33921b3c5663b91a768c698ddfa9
corepack pnpm install --frozen-lockfile
sudo /usr/bin/node scripts/deploy-marketplace.mjs prepare --release "$WEB_RELEASE_ID" --target "$WEB_TARGET"
sudo /usr/bin/node scripts/deploy-marketplace.mjs deploy --release "$WEB_RELEASE_ID" --target "$WEB_TARGET" --health-url "$WEB_HEALTH_URL" --dry-run
# Sólo con autorización posterior de despliegue:
sudo /usr/bin/node scripts/deploy-marketplace.mjs deploy --release "$WEB_RELEASE_ID" --target "$WEB_TARGET" --health-url "$WEB_HEALTH_URL"
sudo systemctl status runly-web-marketplace.service --no-pager
```

Si el host no está preparado, detenerse y revisar los requisitos del documento de hosting; no inventar un destino ni modificar Nginx/systemd durante esta entrega. `WEB_RELEASE_ID` debe ser nuevo. La recuperación utiliza `sudo /usr/bin/node scripts/deploy-marketplace.mjs rollback --target "$WEB_TARGET"`, preservando el par y sus diarios. Ninguno de estos comandos se ejecutó en el VPS.

## Revisión definitiva de los tres bloqueos — 2026-11-11

Se volvió a verificar el registro a las `23:01:15 UTC` y la configuración de permisos a las `22:30:22 UTC`. Las **ocho versiones** `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` están ausentes: siete paquetes existentes responden 200 sin esa versión y `website-blocks` responde 404 con la credencial autenticada. Las siete versiones históricas son controles positivos con integrity coincidente. Los nuevos SHA-256, inventarios y procedencia de los ocho TGZ se verificaron y se fijan en la tabla de distribución de este informe.

El permiso de administración/push del repositorio y la membresía administrativa de la organización se comprobaron por lectura. El publicador previsto es el `GITHUB_TOKEN` del job, con `contents:read`, `packages:write` y habilitación explícita del entorno. Esto acredita la configuración, **no una escritura efectiva** ni los permisos de lectura futuros de Actions/VPS sobre el paquete nuevo. No se probó publicación con la credencial local ni se crearon versiones de prueba.

El listado completo de paquetes de la organización y sus siete fichas respondieron 200: todos son privados, pertenecen a Runly-MX y están asociados a `Runly-MX/runly-erp`. El nuevo `website-blocks` no aparece en ese listado. No se infiere que el token lector local tenga permiso de publicación por poder consultar estas fichas.

### Licencias de los cinco paquetes corregidos

El titular confirmó expresamente `UNLICENSED` exclusivamente para las partes propias de Runly, sin conceder redistribución ni alterar licencias de terceros. Se aplicó a `core`, `ui`, `sdk`, `preview-runtime` y `website-blocks`; los otros tres ya lo declaraban. Los cinco manifiestos fuente conservan `private:true`. La clasificación distingue fuente mantenida por Runly, dependencias instaladas separadamente y adaptaciones de código; no atribuye automáticamente MIT a los paquetes.

| Paquete lógico | Evidencia del código distribuido | Terceros y alcance confirmado |
| --- | --- | --- |
| `@runly/core` | 16 archivos fuente; procede del baseline `b682bbacc`; utilidades y contratos Runly | Sin imports de paquetes externos ni payload binario en el inventario. `UNLICENSED` para código propio. |
| `@runly/sdk` | 22 archivos fuente; procede del mismo baseline; cliente y transporte Runly | Sin imports externos ni payload binario. `UNLICENSED` para código propio. |
| `@runly/preview-runtime` | 11 archivos fuente y README; extracción del shell ERP en `21268d9b9`, documentada en su README | Importa UI, React y TanStack Query; no incluye sus distribuciones en el TGZ. `UNLICENSED` para fuente propia; no relicencia dependencias. |
| `@runly/website-blocks` | 87 archivos fuente; extracción de los bloques ERP en `ce9d6939f` | Importa React y Atlas 0.3.5 por dependencia. No empaqueta el código del builder ni las 16 imágenes de Elevate. `UNLICENSED` para código propio; no hereda MIT de Atlas. |
| `@runly/ui` | 353 archivos fuente; baseline y evolución Runly; wrappers Radix y patrón shadcn en Button/Select/Accordion y utilidades `cn` | `UNLICENSED` sólo para partes propias. Incluye `LICENSE.shadcn.txt` original y README de alcance; dependencias, atribuciones y obligaciones de terceros permanecen separadas. |

Las cinco distribuciones contienen fuente, CSS y los avisos/README indicados; no contienen `node_modules`, fuentes tipográficas, imágenes raster ni binarios FFmpeg. UI sí contiene código que carga el core FFmpeg servido por la aplicación: la licencia de ese binario no se determina a partir de la del wrapper y no se concede mediante los metadatos de UI. No se incorporó ni modificó ese binario para distribuir estos paquetes.

La [documentación de npm](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#license) contempla `UNLICENSED` para código privado sin una concesión de licencia; no es `Unlicense`, MIT ni una autorización de redistribución pública. La [licencia de shadcn](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) es MIT y exige conservar sus avisos cuando se redistribuyen sus partes. Las similitudes de componentes no se convierten por sí solas en una certificación de titularidad o en una atribución de toda UI a shadcn.

**Decisión aplicada:** código propio propietario `UNLICENSED`; ninguna autorización de redistribución pública. El aviso shadcn se conserva íntegro desde su fuente oficial fijada a `6ea6856f5a1082d4d9c231559b6bc3ee73827493`, sin modificar la licencia MIT ni atribuirla al conjunto Runly. README y aviso se verificaron dentro del TGZ de UI. Los avisos anteriores de Studio se conservaron byte por byte. No se cambiaron las licencias ni los manifiestos instalados de terceros.

La corrección está en el commit fuente `3a071090875b9f3803f895e00d78fc25a047e829`. Se preparó un conjunto nuevo de ocho versiones; los artefactos anteriores `db6deb300f0835df6d74c6d46198ded1b2a375a2` permanecen intactos en `.artifacts/website-integration/shared-final/` y quedan sustituidos como candidato a publicar. Los comandos y hashes de este informe apuntan exclusivamente al nuevo conjunto. Todos los archivos de implementación y avisos preexistentes de los ocho paquetes conservan sus SHA-256: sólo cambian metadatos/identidades y se añaden README/aviso de UI.

Este punto es independiente de Elevate: `license_unknown` describe los derechos no acreditados de su contenido visual. No lo corrige la licencia de los paquetes internos ni bloquea por sí solo la distribución de funcionalidad Website. Elevate permanece fuera de cualquier publicación pública.

### Instalación limpia y autorización pendiente

El runbook inferior conserva el flujo existente: push autorizado → preparación Actions `publish=false` → comparación de manifiesto/TGZ → publicación inmutable autorizada → `shared:adopt --check-only` → adopción → commit local de todos los locks/derivados → `shared:clean` → push autorizado del commit de adopción y workflow limpio → lectura del VPS ejecutada por el operador. **`shared:clean` debe correr después del commit local:** usa `git archive HEAD`, por lo que ejecutarlo antes comprobaría los locks históricos. La adopción ya prueba su candidato aislado antes de escribirlo.

No se repiten pruebas funcionales W1–W3. Para dar por cerrado el bloqueo de instalación hacen falta el pase desde el registro real con stores vacíos, los tres locks frozen y build, seguido de `published-candidate`, `ok:true`, `packages:8` desde el VPS. No se certifica ninguno antes de publicar. No se ha identificado otro cambio funcional necesario. La decisión de metadatos internos está aplicada; quedan autorización y resultados efectivos de publicación/lectura/instalación. Elevate conserva su bloqueo independiente.

Evidencia privada adicional: `.artifacts/website-integration/distribution-license-provenance.json` (diagnóstico previo), `distribution-permissions-final.json`, `distribution-registry-associations.json`, `distribution-license-only-diff.json` y `distribution-shadcn-license-source.json`. Se ejecutaron cinco pruebas de publicación/empaquetado (5/5), el empaquetador existente con compilación de cada módulo distribuido y la inspección segura de los ocho TGZ nuevos. No incluyen credenciales ni se publican como atestaciones legales o criptográficas.

## Preparación final de distribución — 2026-11-11

**Preparación local verificada; publicación, adopción e instalación limpia del candidato todavía pendientes de autorización.** No se ejecutó ningún push, workflow remoto, publicación de paquetes, modificación de servicios externos ni despliegue. El manifiesto nuevo está fijado a `3a071090875b9f3803f895e00d78fc25a047e829`, posterior a la confirmación de licencias; no se sobrescribieron los artefactos anteriores.

| Comprobación nueva | Resultado y alcance |
| --- | --- |
| Ocho tarballs locales | SHA-256, integrity SHA-512, contentDigest e inventario por archivo coincidentes con el manifiesto; extracción segura sin ejecutar scripts |
| Identidad y dependencias internas | Nombres físicos `@runly-mx/*`, aliases `@runly/*`, versión/sourceRevision exactos, registro `https://npm.pkg.github.com`, acceso `restricted`; sin dependencias internas `file:`, `link:` o `workspace:` |
| Catálogo/contratos | ERP y Hub: Atlas 0.3.5, 148 bloques, mismo digest; Website Template v2 y entrypoints nativos presentes |
| Lectura local autenticada del registro | Las siete versiones históricas `7d945e…` son legibles y coinciden con sus integridades: control positivo de acceso |
| Versiones candidatas | Las siete versiones nuevas no figuran en la metadata HTTP 200 de sus paquetes; `website-blocks` devuelve 404 autenticado. El listado autenticado de GitHub devuelve siete paquetes, sin `website-blocks`. No se observó contenido previo en conflicto; repetir la comprobación con la identidad del publicador antes de escribir |
| Commits remotos | Los commits ERP `3a0710908…` / `645fb83a8`, Hub `fe0f363` y Web `ca22e40` aún no están disponibles en GitHub. Se comprobaron `origin` y la posibilidad de push fast-forward, sin realizarlo |
| Workflow compartido | Los cuatro refs de Actions usados existen. `RUNLY_SHARED_PUBLISH_ENABLED=true`; el entorno `shared-packages` tiene **cero revisores requeridos**. El nombre del entorno no constituye una segunda aprobación humana: ejecutar primero `publish=false` y autorizar expresamente el paso posterior |
| Adopción `--check-only` | El intento del candidato anterior se detuvo en `SHARED_REGISTRY_UNAVAILABLE_OR_UNAUTHORIZED`, antes de instalar o modificar locks. No se repite contra versiones nuevas ausentes; tampoco se interpreta ese error como una instalación aprobada |
| Instalación limpia del candidato desde registro | **No realizada**: faltan las versiones. No se sustituyó por tarballs locales, un registro loopback ni una instalación histórica |
| Lectura desde producción | **Pendiente de ejecución por el operador.** El usuario indicó que la comprobación del VPS debe hacerse mediante comandos que él ejecutará. Las consultas locales y los intentos SSH no acreditan acceso al registro desde el Hub productivo |
| Plugin dev.11 | 26 pruebas dirigidas aprobadas: empaquetado ChatGPT/Claude, contratos MCP y distribución/consentimientos. Grants anteriores de recursos y Studio no adquieren permisos Website |

Las consultas al registro son una fotografía temporal, no una reserva de versiones. El publicador existente vuelve a consultar las ocho antes del primer `publish`: sólo un E404 explícito se trata como ausencia, otros fallos detienen el flujo, y una versión existente con integrity diferente produce conflicto inmutable. Después de publicar vuelve a verificar el registro. La publicación de ocho paquetes no es una transacción atómica; el procedimiento de recuperación de publicaciones parciales se detalla más abajo.

### Licencias inspeccionadas

| Paquetes | Declaración en los tarballs |
| --- | --- |
| `module-engine`, `module-compiler`, `studio-interchange` | `UNLICENSED` |
| `core`, `ui`, `sdk`, `preview-runtime`, `website-blocks` | `UNLICENSED` exclusivamente para código propio; UI incluye aviso shadcn MIT y README de alcance |
| Atlas Web Builder 0.3.5 independiente | `MIT` en su manifiesto; no convierte el código Runly en MIT |

Los ocho artefactos están preparados para **distribución privada restringida** entre servicios autorizados de Runly, no para distribución pública con una licencia abierta. No hay LICENSE raíz en ERP. `UNLICENSED` no concede redistribución ni sustituye obligaciones de terceros. Se conservan los avisos internos de Studio y el aviso MIT de shadcn. Cualquier cambio posterior de licencias, dependencias o fuentes requiere otro commit/versión/manifiesto; no se parchean estos TGZ ni se reutiliza su versión con bytes diferentes.

Las dependencias compartidas son exactas, pero varias dependencias externas de UI y los peers conservan rangos o `latest`. No se alteraron para reabrir el candidato. La reproducibilidad del árbol completo deberá fijarse mediante los **tres locks pnpm generados por la adopción real**, seguida de instalaciones frozen con stores vacíos. El manifiesto por sí solo no fija todo el árbol externo ni sustituye una revisión de licencias transitivas.

### Evidencia de esta preparación

En ERP, bajo `.artifacts/website-integration/`: `distribution-licensed-audit.json`, `distribution-licensed-registry-read.json`, `distribution-package-list-read.json`, `distribution-github-read.json`, `distribution-remote-commits.json` y `distribution-push-preflight.json`. En Hub: `.artifacts/website-distribution-directed.log` (26/26). Son evidencia privada de lectura/auditoría, no releases, atestaciones H7 ni una certificación productiva. No contienen tokens y no se incorporan al repositorio público.

Se reutiliza la evidencia funcional W1–W3 y del cierre anterior; no se repitieron esas suites. No se ejecutó la instalación de versiones ausentes del registro ni se afirmó acceso productivo. Esta corrección sólo cambia cinco metadatos `license`, añade aviso/README de UI y actualiza este informe. No cambia implementación ni contratos.

### Comprobación que ejecutará el operador en el VPS

Usar el checkout del Hub que incluya `fe0f363` y las rutas reales del servidor. `HUB_CURRENT_LOCK` debe apuntar al lock de la release **activa**, no al candidato local. `PUBLISHED_SHARED_MANIFEST` se deja vacío antes de publicar y se fija al manifiesto publicado para comprobar después los ocho. La credencial existente sigue fuera del checkout y no se imprime, copia ni pasa en argumentos.

```bash
cd "$HUB_CHECKOUT"
sudo pnpm exec node --input-type=module - "$HUB_CURRENT_LOCK" "${PUBLISHED_SHARED_MANIFEST:-}" <<'NODE'
import {readFileSync} from 'node:fs';
try {
  const {registryAuthEnvironment, validateRegistryManifest, probeRegistry} =
    await import('./scripts/lib/shared-registry.mjs');
  const env = registryAuthEnvironment(process.cwd());
  for (const [label, file] of [
    ['production-current', process.argv[2]],
    ['published-candidate', process.argv[3]],
  ]) {
    if (!file) continue;
    const lock = validateRegistryManifest(JSON.parse(readFileSync(file, 'utf8')));
    if (label === 'published-candidate' &&
        (lock.packages.length !== 8 || lock.revision !==
          '3a071090875b9f3803f895e00d78fc25a047e829')) throw Error();
    probeRegistry(lock, {env});
    console.log(JSON.stringify({check: label, ok: true,
      packages: lock.packages.length, revision: lock.revision}));
  }
} catch (error) {
  console.log(JSON.stringify({ok: false, code: error.code ?? 'REGISTRY_CHECK_FAILED'}));
  process.exitCode = 1;
}
NODE
```

Este comando usa el mecanismo existente de permisos del archivo privado y consultas de metadata/integrity; no instala, publica ni reinicia servicios. El resultado necesario tras publicar es `published-candidate`, `ok: true`, `packages: 8`. Un error no autoriza a mostrar `.npmrc`, tokens o variables del servidor ni a desactivar permisos. La lectura con la credencial local, con la credencial productiva y con el `GITHUB_TOKEN` de Actions del Hub son tres comprobaciones distintas.

## Estado del candidato

La integración general está implementada y comprobada localmente. Se conservan W1, W2 y W3: contrato Website v2, edición Atlas en Hub e instalación ERP como borrador con imágenes privadas. Este cierre añade distribución verificable del renderer, herramientas MCP Website y revisión institucional con alcance explícito por tipo. No publica paquetes, recursos o plugins ni despliega servicios.

**La activación exige publicar y adoptar los paquetes desde el registro con autorización.** Los tarballs están preparados; el lock activo del Hub permanece en su versión histórica publicada. No se apuntó producción a tarballs locales ni se fabricó una resolución de versiones aún no publicadas. El build productivo del Hub falla con `WEBSITE_REGISTRY_ADOPTION_REQUIRED` hasta completar esa adopción. El desarrollo con snapshots W2 sigue siendo local y no sustituye este paso.

Elevate sigue bloqueada para distribución pública por `license_unknown`. Esta limitación no impide distribuir la funcionalidad general Website ni editar el recurso privado. La fidelidad exacta al prototipo no está certificada.

## Versiones y commits

| Componente | Revisión |
| --- | --- |
| ERP W1 / Hub W1 | `c2eb2b1e9` / `79f86d5` |
| ERP W2 / Hub W2 | `ce9d6939f` / `803f5a2` |
| ERP W3 | `2361f0b1d` |
| Corrección Docker de los manifiestos workspace | `42c138dd2` |
| ERP: preparación de distribución y contratos | `ac41e2574` |
| ERP: verificación de exports comodín acotados | `b55857082` |
| Fuente exacta de los ocho paquetes finales | `3a071090875b9f3803f895e00d78fc25a047e829` |
| ERP: corrección visual nativa y fallback | `c003b53ce8b8804a3db27d0e80be0fb578b27b25` |
| ERP: candidato de integración antes de este informe | `645fb83a8d0d8d4446664e59d219964205b6b033` |
| Hub: cierre funcional, institucional y MCP | `fe0f363b7e4472bcce4ce26e1987a86f2e27e7af` |
| runly-web: documentación sincronizada y contrato institucional | `ca22e40fd7cb33921b3c5663b91a768c698ddfa9` (incluye `2eec678` y `cbcf4d4`) |
| Atlas independiente | `0.3.5`, checkout `dc30666923a6b4d19919a0e154bb4eb2cdd65e2f`; sin cambios en este cierre |
| Plugin ChatGPT y Claude | `0.1.0-dev.11`; `dev.9` permanece intacto |

El commit de este documento es posterior a los commits funcionales; no altera el contenido de los paquetes fijados arriba. La fuente incluye la documentación canónica y sus copias generadas con revisión/digest. Los commits son locales; no se hizo push.

## Distribución, locks y digests

Los ocho paquetes usan la versión exacta `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829`, nombres físicos `@runly-mx/*` y aliases lógicos `@runly/*`. El registro sigue siendo GitHub Packages; no se cambian versiones publicadas. `website-blocks` se incorpora al conjunto completo y conserva su dependencia exacta de Atlas 0.3.5.

Manifiesto final: `.artifacts/website-integration/shared-licensed-final/manifest.json` en ERP. SHA-256: `99245bf43ac8622cb765f8333a2e4a7cfe6aa3a5264fd804235f99be1281ac03`. Contiene SHA-256 de cada tarball, integrity SHA-512, inventario por archivo, contentDigest, sourceRevision y contrato de preview.

| Paquete en el registro | Versión exacta | SHA-256 tarball | contentDigest |
| --- | --- | --- | --- |
| `@runly-mx/core` | `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` | `d9e10463108397e4c1b5e227d862723ea4951aee4388ba220f01c7ea1b39c8b8` | `3bb7df78d6b708b9c8e90c669e9e02864293e05dfa07ee3031f61a278433090d` |
| `@runly-mx/module-engine` | `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` | `18e0712a986ca9c4a50e2aa4bde2251b1425765d25b98885a6baa503ae7297ef` | `790b62994a64d6bb3e655632955cd966488184526fbbc33e95d8d109cf075358` |
| `@runly-mx/module-compiler` | `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` | `0a0e588285b6c0f0cbea4737a025498eddfdb2fb501ce46b9eba2784315685d7` | `af730436856656cd0cdbaed1cd39f6b19ea62ae11fa45be5e274a749bf29812b` |
| `@runly-mx/ui` | `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` | `09c91b16f57e0ad34eb8c0565631dbc40facd64e6d638e4b6628c904ace8cf02` | `1f0c1a192c0685e52f10d9d39abde999c25906a696801c0f756d56bd0489852f` |
| `@runly-mx/sdk` | `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` | `88b1c814f8321625f41ded13412c45955289784738395dfb5ffec0f2bf549ef4` | `96138625a47ebfdcd732c41c2acc63828c2c0262d80a912a51f69e5e6d4a6fb6` |
| `@runly-mx/preview-runtime` | `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` | `f8ffaa94cc2a2db6ffce654d52814c8457783e5a622adc6100318d2294c486b5` | `7f2c388dc90301da6496d07cd937fada4caadbcd378bd5e6eeaa683c7d039340` |
| `@runly-mx/studio-interchange` | `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` | `3f4e9f5e1fe46c2ece5bbbeb804c9641aaf2bf30af29277e12fe864da611283d` | `bf05a4b9f11a0c0795a161a226be9a57e52cf34e543a33fac23a4b81e08ce3ff` |
| `@runly-mx/website-blocks` | `0.1.0-source.3a071090875b9f3803f895e00d78fc25a047e829` | `9ed9c4f8e5287d0f8eff85b5f0e89595bfca40e4a30df93b9ee492c0360f7814` | `4164e0addc6b9b9e2a6886dc5a07f597d938ebaf1e7cfc29fb16c1acfacaa2e2` |

El catálogo Atlas continúa con 148 bloques, versión 0.3.5 y digest canónico `0e6f77787d7351448f05dc87af8b1f2bb701170a1077eacc76633d548216d248`. No se introdujeron tipos ni propiedades sin renderer. ERP conserva sus workspaces propios; Hub adopta aliases exactos del mismo código mediante su flujo de registro. El validador productivo mantiene la comprobación de identidad, contenido instalado, dependencias fijadas y catálogos; no acepta `local-candidate` como distribución productiva.

El lock activo del Hub todavía apunta a `7d945e3f3fcc720863eb0c2dc158d76870d255fc` y al conjunto de siete paquetes. Se preparó el consumidor para admitir conjuntos históricos completos de seis/siete y el nuevo de ocho, rechazando mezclas y conjuntos parciales. Se actualizaron también el instalador, la preparación del validador, el montaje por revisión y la adopción limpia. No basta con cambiar una longitud en un solo punto.

Vite consume `website-blocks` y `studio-interchange/website-document` instalados desde el registro y comprueba sus inventarios/digests. No usa `.website-editor` en ningún build; ese snapshot queda reservado al servidor de desarrollo. El flujo `shared:adopt` añade ambos paquetes al manifiesto raíz, resuelve las versiones, comprueba los tres locks, instala en un checkout aislado desde el registro y compila antes de escribir los resultados. No se ejecutó contra versiones remotas inexistentes.

## Elevate: preservación y diferencias visuales

Se conserva intacto el ZIP W2/W3 original: 552600 bytes, SHA-256 `0357fe46788bbf78b4dbdc68a1818707f240466d45fb82c29f52539be1fe6b4f`. El candidato visual separado está en `.artifacts/website-integration/website.elevate-wellness-v2.zip`: 554080 bytes, SHA-256 `f052e48ec5255117914303af03c450949783d4a38933463ee13a749cb37c1908`.

El candidato conserva una página, 133 bloques, 16 imágenes, sus bytes/SHA-256 y todas las licencias originales. Se comprobaron esos invariantes al exportar e inspeccionar. Sólo utiliza propiedades existentes: `HeroBlock.split` para mostrar la imagen original que la variante centrada ignoraba, alineación/ancho/padding del hero, peso/interlineado/tracking de HeadingBlock y radio de ImageBlock. No contiene código del prototipo ni otro renderer. No se fuerza Inter sin distribuirla: se preserva el fallback original del tema.

Se compararon prototipo, base W2 y candidato con el runtime y SSR existentes en Chromium a 1440, 768 y 390 px. Las nueve capturas, carga de imágenes y ausencia de overflow están en `.artifacts/website-integration/visual/`. Las capturas de comparación son privadas, no recursos públicos. El prototipo original sigue preservado en `docs/private/elevate-wellness/prototype/`.

| Diferencia pendiente | Capacidad existente investigada | Ampliación reutilizable a evaluar; criterio de comprobación |
| --- | --- | --- |
| Progreso, avatares y badges sobre el hero | Hero split, Section, Grid, Stats | Slots/variantes de composición y progreso con valor/rango/etiqueta/defaults, accesibilidad y layout responsive. Comparar superposición sin perder lectura móvil. |
| Métricas compactas y tarjetas fotográficas | Stats, Card, Image, Grid | Variantes de tamaño, jerarquía y recorte; conservar texto, imagen y CTA editables. Comparar densidad y crop en tres anchos. |
| Checklist superpuesto de nutrición | SplitFeature, Section y texto | Lista semántica de items/iconos y panel superpuesto, con defaults y renderer compartido. No incrustar SVG activo del paquete. |
| Agenda editorial y testimonios | Texto, Grid, Testimonial/Testimonials | Variante de filas con fecha/duración/modalidad y tarjeta retrato. Un carrusel necesita contrato de navegación accesible. No implica agenda conectada. |
| Teléfono, modal y selector bilingüe | Imagen, enlaces y marcador de formulario | Composición visual del teléfono; contratos separados para modal y traducciones. No simular aplicación, traducción, pagos ni formularios conectados. |
| Tipografía exacta | Tokens de tema y fallback del renderer | Acreditar/distribuir fuentes y declarar su contrato antes de exigir Inter. No usar una URL externa como sustituto de un asset local. |

El checkout independiente Atlas está limpio y sigue en 0.3.5. Las mejoras aplicadas no requieren modificarlo. Las ampliaciones de la tabla son pendientes estéticos verificables, no bloques ya disponibles ni una fase funcional exigida para distribuir Website. Cuando se ejecuten, requerirán versión nueva, campos/defaults/slots, renderer ERP/Hub, pruebas y catálogo/digest nuevos; no se sustituirá 0.3.5 silenciosamente.

## Derechos y canal institucional

Validar técnicamente no acredita derechos. Elevate conserva avisos y licencias `unknown`; ni metadatos SPDX cambiados por el cliente ni una autoridad institucional eliminan ese bloqueo. Los borradores privados siguen siendo editables.

Las migraciones Hub nuevas son aditivas y ordenadas después de W2:

- `20261126090003_website_institutional.sql`: admitir Website en el guard institucional existente y bloquear revisión/distribución Website sin derechos en evidencia y licencia. El guard SQL cubre solicitudes e intents; el publicador vuelve a comprobar la evidencia inmutable.
- `20261126090004_website_read_scope.sql`: consentimiento explícito para leer documentos e imágenes Website por MCP.
- `20261126090005_website_authority_scope.sql`: alcance institucional inmutable por tipo. Las autoridades previas quedan sólo en `studio_template`; Website requiere una concesión nueva explícita de plataforma con `resourceTypes: ['website_template']`. El endpoint histórico sin tipos sigue siendo Studio-only. No se otorgan permisos al migrar.

Se reutilizan autoridad por publicador/organización/persona, revocación, bloqueo de evidencia/revisión/archivo, confirmación humana de versión y hash, historial y elegibilidad institucional del firmador. Una decisión institucional no se presenta como moderación comunitaria independiente. Cambiar el tipo admitido no modifica dominios, algoritmo, claves, firmas, cadena de snapshots ni garantías criptográficas de H7. Los consumidores ERP y runly-web verifican también la prueba Website con el mismo contrato; las pruebas Studio anteriores siguen siendo válidas.

La UI de autoridades permite elegir Studio o Website, muestra el alcance y lo incluye en la confirmación. Creator sólo ofrece autoridades válidas para el tipo del recurso. Ninguna herramienta MCP concede autoridad, decide revisión, crea un intent de publicación institucional, firma ni publica. Las pruebas usan cuentas sintéticas y transacciones revertidas; no crearon publicaciones oficiales reales.

## MCP y plugins

Con `MCP_MARKETPLACE_RESOURCES=true`, las cuatro herramientas nuevas se montan sobre el mismo servicio Website de W2:

| Herramienta | Permiso y comportamiento |
| --- | --- |
| `runly_website_contract` | `hub:docs:read`; formato, política raster, límites y catálogo del validador activo |
| `runly_website_get` | `hub:website:read`; documento, imágenes privadas, revisiones y diagnósticos; `fileId` abre una versión anterior |
| `runly_website_document_save` | `hub:website:write`; documento Atlas completo, assets raster base64/SHA/licencia y `expectedRevision`; guarda y valida otra revisión |
| `runly_website_package_import` | `hub:website:write`; ZIP v1/v2 exacto con SHA-256, sin URLs ni ejecución, importado por el servicio existente |

`hub:website:write` implica lectura Website; los permisos anteriores de metadata y Studio no adquieren acceso a bytes privados. La membresía, el grant al tenant, el rol del publicador y las cuotas se comprueban en el servidor. No se duplicaron endpoints HTTP ni almacenamiento. `runly_resource_get` y `runly_resource_validate` mantienen sus informes y revisión humana existentes. La edición posterior se realiza en Atlas del portal.

El límite HTTP MCP permanece en 1 MiB: importación ZIP hasta 640 KiB y documento hasta 900 KiB JSON, dejando margen al sobre. El portal conserva 25 MiB para Website. El servidor no puede abrir archivos privados de conversaciones ni descargar imágenes arbitrarias; el cliente debe enviar bytes reales o utilizar el portal. No se promete acceso automático a adjuntos del host.

Se actualizaron instrucciones compartidas ChatGPT/Claude conservando Studio, los módulos RME3, la identidad del plugin y su configuración OAuth. La skill de Claude se sincroniza desde la fuente ChatGPT. El empaquetado comprueba YAML real, JSON, esquemas, rutas, inventario exacto, credenciales, CRC y bytes deterministas.

| Artefacto final Hub | Bytes | SHA-256 |
| --- | --- | --- |
| `.artifacts/openai/runly-developer-0.1.0-dev.11.zip` | 54373 | `80712ee5253252e7c1856513c4d9c705893165f7822d73dd5278e80c7dcf16c7` |
| `.artifacts/claude/runly-developer-0.1.0-dev.11.zip` | 15019 | `57607d422297dce29be224f4d06bc5206bbc2cab614de6d93ff51d4e4346abaa` |

Los digests de esta tabla se fijan después del empaquetado final; no usar los ZIP intermedios dev.10. No se subió nada a OpenAI Platform ni se actualizó un plugin remoto. La subida posterior requiere autorización independiente y un Hub desplegado con los servicios/permisos nuevos. No se probó una instalación remota de dev.11 en ChatGPT o Claude.

## Verificación realizada y evidencia reutilizada

Se reutilizan los informes W1/W2 y las 16 comprobaciones W3 para componentes que no cambiaron: ZIP seguro, imágenes, round-trip, Files, recuperación, publicación aislada y conservación de releases activas. No se repitieron sus suites completas.

En este cierre: cinco pruebas ERP de release compartida; 39 pruebas Hub de MCP, documentación, permisos, contratos, paquetes de plugins y fuente de distribución; pruebas dirigidas de registro/instalador/montaje (incluido el conjunto de ocho); lint dirigido y React Doctor sin diagnósticos en los cambios. Se regeneró el candidato por el escritor v2 y se inspeccionó en ERP. La integración real Hub usa esos mismos bytes y los tarballs finales: Auth, grant MCP, SQL, Storage, importación, guardado, reapertura, revisión antigua, CAS, publicador ajeno, derechos, autoridad por tipo y revocación. Compila además el frame Atlas real con el renderer/CSS extraído de esos paquetes.

El runner usa el validador preparado en `.artifacts/website-integration-validator-final` como laboratorio fuera de producción; no modifica locks productivos. Se aplicaron únicamente las migraciones nuevas a la base local de pruebas. Las pruebas institucionales se revierten y no llaman al firmador ni publican una release.

El pase limpio descargando las versiones finales del registro, build completo del Hub adoptado y smoke VPS/DNS/TLS quedan pendientes de publicación/adopción y despliegue autorizados. No se certifican como ejecutados. No se ejecutaron suites generales ni se repitió la certificación H7 de criptografía sin cambios.

Privacidad global ERP: 72 hallazgos heredados, sin ampliar excepciones. Los archivos ERP/runly-web del cierre no añaden hallazgos. En los archivos Hub cambiados hay tres avisos preexistentes (dos de infraestructura en el instalador y un marcador sintético de clave en la prueba del ZIP), comparados con HEAD: cero avisos nuevos. No se copiaron valores privados al documento.

## Secuencia de activación autorizada

Los comandos siguientes son un runbook, **no acciones ejecutadas**. Primero revisar/aprobar commits y push. La publicación de paquetes, adopción de locks, despliegue, concesión institucional y subida de plugin son autorizaciones distintas. No publicar Elevate mientras sus derechos sigan desconocidos.

### 0. Autorizar y hacer push del código, sin desplegar

Los commits fuente no están aún en el remoto. Desde ERP, después de autorizar los tres push y volver a comprobar fast-forward:

```bash
git push origin main
git -C ../runly-developer-hub push origin main
git -C ../runly-web push origin main
```

No usar force-push. Estos push no constituyen autorización para desplegar. La publicación depende de que `3a071090875b9f3803f895e00d78fc25a047e829` sea accesible y ancestro de `main`; el workflow lo comprueba. No ejecutar el workflow con otra revisión ni con HEAD como sustituto de esa fuente.

### 1. ERP: preparar en Actions, comparar y autorizar la publicación

Primero, con autorización para crear una ejecución remota, ejecutar **sólo preparación**:

```bash
gh workflow run shared-packages.yml --repo Runly-MX/runly-erp --ref main \
  -f revision=3a071090875b9f3803f895e00d78fc25a047e829 -f publish=false
gh run watch "$SHARED_PREPARE_RUN_ID" --repo Runly-MX/runly-erp --exit-status
gh run download "$SHARED_PREPARE_RUN_ID" --repo Runly-MX/runly-erp \
  --name shared-package-manifest-and-tarballs --dir "$SHARED_PREPARE_DIR"
```

Asignar `SHARED_PREPARE_RUN_ID` a esa ejecución y `SHARED_PREPARED_MANIFEST` al `manifest.json` descargado junto a sus ocho TGZ. Desde ERP, comprobar el mismo manifiesto y archivos con el lector existente, sin instalar esos tarballs:

```bash
node --input-type=module - "$SHARED_PREPARED_MANIFEST" <<'NODE'
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readConsumerArtifacts} from './scripts/lib/shared-consumer-registry.mjs';
const path = process.argv[2];
const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
if (sha256 !== '99245bf43ac8622cb765f8333a2e4a7cfe6aa3a5264fd804235f99be1281ac03')
  throw Error('REVIEWED_MANIFEST_MISMATCH');
const {artifacts} = readConsumerArtifacts(path);
console.log(JSON.stringify({ok: true, packages: artifacts.length, sha256}));
NODE
```

Si difieren el manifiesto o cualquier tarball, detenerse antes de publicar y revisar la diferencia de fuente/empaquetado; no cambiar el informe para simular coincidencia. El primer workflow no publica paquetes, pero sí modifica el estado de Actions, por lo que tampoco se ejecutó sin autorización.

**Después de revisar el resultado y autorizar expresamente la publicación privada de los ocho paquetes**, ejecutar:

```bash
gh workflow run shared-packages.yml --repo Runly-MX/runly-erp --ref main \
  -f revision=3a071090875b9f3803f895e00d78fc25a047e829 -f publish=true
gh run watch "$SHARED_PUBLISH_RUN_ID" --repo Runly-MX/runly-erp --exit-status
gh run download "$SHARED_PUBLISH_RUN_ID" --repo Runly-MX/runly-erp \
  --name published-shared-package-manifest --dir "$SHARED_MANIFEST_DIR"
```

Repetir la comprobación anterior sobre `PUBLISHED_SHARED_MANIFEST`. El workflow consulta versiones existentes y rechaza contenido diferente; no sobrescribe versiones históricas. No se depende de una segunda aprobación del entorno, porque actualmente no tiene revisores requeridos. Cambiar esa configuración sería otra operación externa autorizada, no un cambio ya realizado en esta preparación.

`website-blocks` será un paquete nuevo. Tras publicarlo, comprobar la lectura con el `GITHUB_TOKEN` del repositorio Hub y con la credencial del VPS. Si no hereda el acceso esperado, conceder únicamente la lectura necesaria mediante la configuración autorizada de GitHub Packages; no copiar la credencial de publicación al VPS ni introducir tokens en `.npmrc` versionados.

### 2. Hub: adoptar desde el registro y fijar otra revisión de despliegue

Credenciales de lectura del registro fuera del repositorio, con su mecanismo existente. Desde un Hub limpio que incluya el cierre:

```bash
pnpm shared:adopt --manifest "$PUBLISHED_SHARED_MANIFEST" --check-only
pnpm shared:adopt --manifest "$PUBLISHED_SHARED_MANIFEST"
git diff -- shared-packages.lock.json package.json pnpm-lock.yaml \
  apps/api/package.json apps/api/pnpm-lock.yaml \
  apps/worker/package.json apps/worker/pnpm-lock.yaml
```

La adopción resuelve contra el registro, verifica inventarios, los tres installs frozen y el build; sólo entonces escribe los locks y derivados. Revisar y crear un commit local de adopción, incluyendo también los derivados que informe el script. Publicarlo únicamente con autorización. Ese commit adicional es el `$HUB_APPROVED_SHA` del despliegue: no se puede inventar su hash antes de resolver las versiones publicadas. No usar el root de laboratorio ni copiar fuentes manualmente a producción.

Locks/derivados que deben revisarse y conservarse como una unidad:

- Hub: `shared-packages.lock.json`; `package.json` y `pnpm-lock.yaml` raíz; los pares `apps/api/package.json` / `apps/api/pnpm-lock.yaml` y `apps/worker/package.json` / `apps/worker/pnpm-lock.yaml`; `.npmrc` sin credenciales; `apps/playground/generated-fixture.json` y los Compose que realmente cambie el mecanismo de adopción.
- ERP: conserva `pnpm-lock.yaml` del monorepo y sus workspaces `@runly/*` de la revisión aprobada. Es el productor del código, no debe reemplazar sus workspaces por sus propios aliases publicados. La fuente de los ocho directorios de paquetes coincide con la revisión del manifiesto; no hay un segundo lock de consumo que inventar en ERP.
- Atlas: continúa fijado a 0.3.5, sin publicar otra versión del builder ni regenerar otro catálogo.

Después de la adopción local aprobada, desde Hub:

```bash
git add shared-packages.lock.json .npmrc package.json pnpm-lock.yaml \
  apps/api/package.json apps/api/pnpm-lock.yaml \
  apps/worker/package.json apps/worker/pnpm-lock.yaml \
  apps/playground/generated-fixture.json
# Añadir también sólo los Compose modificados que informe shared:adopt.
git diff --cached --check
git commit -m "chore(packages): adopt verified Website shared release"
pnpm shared:clean
# Push sólo con autorización para este commit de adopción:
git push origin main
gh workflow run shared-packages-clean.yml --repo Runly-MX/runly-developer-hub --ref main
gh run watch "$HUB_CLEAN_RUN_ID" --repo Runly-MX/runly-developer-hub --exit-status
```

Ese workflow usa `GITHUB_TOKEN` nativo con `packages:read`, sin sibling ERP ni tarballs locales, y ejecuta instalaciones frozen con stores vacíos, contratos y build. No confundir un pase local con una lectura correcta desde Actions o VPS. Obtener el resultado `packages: 8` del comando del VPS incluido arriba antes de desplegar.

**Orden completo:** push inicial aprobado de ERP/Hub/Web → preparación Actions sin publicación → comparación de manifiesto/TGZ → autorización y publicación inmutable de los ocho → comprobación de lectura del conjunto completo → adopción y pase limpio desde registro → commit/push de adopción aprobado → pase limpio Actions del Hub → comprobación VPS por el operador → autorización de imágenes/respaldos/despliegue coordinado. Ningún paso pendiente se marca como ya ejecutado. Publicar paquetes no autoriza publicar Elevate ni actualizar el plugin remoto.

### 3. Preparación coordinada, respaldos y migraciones

Antes de tocar servicios: respaldos completos verificados y fuera del servidor. En ERP incluir DB, Files, `runly-website-releases`, módulos/configuración y material de recuperación. En Hub incluir DB, buckets privados, claves/configuración protegidas y roots de validadores/versiones anteriores; no imprimir secretos. Ensayar restauración en un destino aislado. Registrar digests de imágenes actuales y revisiones de ambos servicios.

En el equipo de release ERP, después de aprobación de publicación de imágenes:

```bash
node infra/docker/release-selective.mjs --images=api,web,worker --ref="$ERP_APPROVED_SHA"
node infra/docker/release-selective.mjs --images=api,web,worker --ref="$ERP_APPROVED_SHA" --build
node infra/docker/release-selective.mjs --images=api,web,worker --ref="$ERP_APPROVED_SHA" \
  --push --confirm="$ERP_SHA12"
```

No usar un `latest` mutable como identidad. Registrar los digests del manifiesto de release y fijar las variables de imágenes API/Web/Worker del instalador a esos tags/digests. La imagen API reconstruye runtime público/SSR y contiene las migraciones W3. No omitir los manifiestos workspace corregidos en Docker.

En el VPS ERP, desde su raíz de instalación y con el entorno existente respaldado, usar el actualizador correspondiente al modo instalado. Para external:

```bash
cd "$ERP_INSTALL_ROOT"
RUNLY_INSTALLER_REF="$ERP_APPROVED_SHA" ./update-external.sh
```

El ref debe estar publicado y aprobado. El instalador aplica Prisma/migraciones y recrea los componentes coordinados; no sustituirlo por copiar código en contenedores. No ejecutar `db:reset`. Para instalaciones locales seguir `update-local.sh` del mismo release, no mezclar modos.

En el checkout operador del VPS Hub, fijado a la revisión aprobada de adopción:

```bash
sudo pnpm prod:backup
sudo pnpm prod:prepare --env-file "$HUB_BASE_ENV"
sudo pnpm prod:update --env-file "$HUB_BASE_ENV"
sudo pnpm prod:status
```

El flujo normal prepara imágenes/validador y verifica antes de activar. Mantener `HUB_MARKETPLACE_VALIDATOR=on`, root de **esa** revisión compartida de ocho paquetes, montaje de sólo lectura y permisos existentes. Aplicar las migraciones con ese flujo (`prod:migrate`), no con el script de laboratorio `scripts/migrate.mjs`, que está restringido a loopback. Configurar/servir el origen HTTPS aislado W2 del editor y su origen padre; comprobar CSP/sandbox. Habilitar recursos MCP sólo con su feature flag y consentimientos nuevos. No habilitar autoridad institucional por variables de entorno.

Puede desplegarse primero ERP compatible y después Hub con el nuevo validador; no habilitar distribución nueva antes de comprobar ambos. No cambiar claves H7 ni hacer grants institucionales como parte del deploy. Sólo tras smoke aprobado se puede autorizar aparte la actualización del plugin remoto.

## Recuperación y smoke posterior

Si la publicación se interrumpe tras algunos paquetes, no adoptar el conjunto parcial. Conservar las versiones ya publicadas, volver a comprobar las ocho identidades y reejecutar el publicador con la misma revisión: omite las existentes cuya integrity coincide y publica sólo las ausentes. Si hay contenido diferente, detenerse; no sobrescribir, borrar ni republicar una versión histórica. Una corrección de contenido requiere otra fuente y versión completa. Los paquetes publicados pueden permanecer privados sin activar ninguna release de aplicaciones.

Si falla la adopción o la instalación limpia, conservar el commit y los locks anteriores como unidad. El intento `--check-only` de esta preparación terminó antes de escribirlos. No combinar código nuevo del Hub con el conjunto antiguo de siete para eludir el bloqueo de build. Antes del despliegue, la recuperación consiste en no activar el nuevo commit; después, se aplican los controles de compatibilidad y datos que siguen.

Detener la activación si falla la descarga/integridad, falta un paquete, difiere el catálogo, las migraciones quedan incompletas o no está listo el origen aislado. La preparación de Hub conserva el root anterior y no reemplaza un root existente con contenido diferente. Reintentar una fase interrumpida con su misma revisión y diario, no borrar estados para forzar el avance.

ERP: volver a las tres imágenes previas fijadas y su instalador sólo si el esquema y los datos son compatibles. Las migraciones son hacia adelante; no hacer down manual. Antes de retirar la API W3, drenar importaciones y comprobar que no hay trabajos `preparing`/`cleanup` ni uploads activos. Si no puede verificarse la recuperación de Files, mantener una API W3 operativa y corregir hacia adelante; una API anterior no conoce su diario. No eliminar FileAssets ni tombstones para desbloquear rollback. Los manifiestos y copias públicas de releases deben conservarse.

Hub: `sudo pnpm prod:rollback --to "$HUB_PREVIOUS_SHA"` usa su flujo existente y no revierte SQL ni restaura datos. Si rechaza una base con migraciones nuevas desconocidas, respetar el bloqueo: usar una corrección hacia adelante o restauración coordinada aprobada en entorno aislado, nunca falsear el ledger. Guardar buckets y DB como un punto coherente; restaurar sólo DB puede romper imágenes/revisiones. Las autoridades nuevas no se convierten en permisos automáticos para un servidor anterior. No volver a publicar un feed antiguo para simular rollback: se mantienen anti-rollback y revocaciones H7.

Smoke obligatorio tras desplegar:

1. Health de ERP/Hub, ocho aliases exactos, catálogos y validador de la misma revisión; cero dependencias `file:`, `link:` o snapshots locales productivos.
2. Abrir un Website privado con Atlas: páginas, imágenes, texto/color/imagen editables; guardar y reabrir sin perder revisión anterior. Preview aislado y responsive.
3. MCP: consentimiento Website read/write explícito; grants antiguos no leen bytes; publicador ajeno y escritura sin permiso rechazados. Validaciones ligadas al archivo/revisión.
4. Elevate: comprobar rechazo de revisión/distribución por derechos desconocidos, incluso con metadata de licencia cambiada o autoridad Website. No publicar el fixture para este smoke.
5. Autoridades: Studio legado no habilita Website; una concesión nueva sólo por administrador; confirmación humana exacta y revocación. No crear autoridad real sólo para probar.
6. ERP: importación de un recurso de prueba firmado autorizado como borrador; Files privados, idempotencia y CAS; no cambia la release activa. Publicación de prueba sólo en dominio aislado autorizado y sin URL privada de Storage.
7. Comprobar reaper/compensación, logs sin secretos, backups/restauración y disponibilidad de releases previas. Confirmar que Studio y los flujos RME3 existentes siguen disponibles.

La aprobación de esos pasos habilita operación general Website. Los derechos de Elevate, la publicación institucional concreta y la subida del ZIP a OpenAI Platform siguen siendo decisiones humanas separadas.
