# Website — cierre de publicación y adopción

Continuación de la [fase 3C](website-responsive-foundation-phase-3c.md).
Fecha: 22 de noviembre de 2026. **Publicación y adopción local completadas y
verificadas.** No se ejecutó un despliegue remoto ni se acepta como terminada la
fase global de aceptación visual/rollback del servidor.

## Bloqueo liberado y publicación real

Los cinco archivos LMS pendientes quedaron incluidos por su propietario en
`a448509ded5fad1b9b4d129bcff9482e4a9b7de2`. Se verificó su prueba de planificación,
se conservó el commit completo, se sincronizó main y se publicó desde ese SHA
con el árbol limpio. No se usaron revisiones anteriores ni excepciones al guard.

El [workflow 45046425281](https://github.com/Runly-MX/runly-erp/actions/runs/45046425281)
terminó con **prepare y publish aprobados**, usando `publish: true` y el entorno
protegido `shared-packages`, sin modificar sus protecciones.

Los ocho paquetes bajo `@runly-mx` están publicados en GitHub Packages con versión
exacta `0.1.0-source.a448509ded5fad1b9b4d129bcff9482e4a9b7de2`:

| Paquete | Estado |
| --- | --- |
| core | Publicado y adoptado |
| module-engine | Publicado y adoptado |
| module-compiler | Publicado y adoptado |
| ui | Publicado y adoptado |
| sdk | Publicado y adoptado |
| preview-runtime | Publicado y adoptado |
| studio-interchange | Publicado y adoptado |
| website-blocks | Publicado y adoptado; Atlas exacto 0.9.0 |

Manifiesto publicado: artifact `published-shared-package-manifest` de ese run,
archivo `<source-sha>/manifest.json`. Su SHA-256 es
`7a8004e668f3ea74cb9fa164dc077dae9abd430d23484178750adc98a55a06b1`.
El [registro de publicación](../releases/website-responsive-shared-a448509ded5f.json)
contiene las ocho versiones, SHA-256, SHA-512 y contentDigest reales. El manifiesto
completo queda adoptado en `shared-packages.lock.json` del Hub.

Se verificaron los tarballs y la metadata registry. Los manifiestos de prepare y
publish de CI son idénticos. El empaquetado local Windows difiere: siete archivos
CSS/licencia tienen CRLF al exportarse y la compresión también cambia. Los archivos
publicados afectados coinciden exactamente con los blobs Git. No se reemplazaron
hashes: se adoptó exclusivamente el manifiesto publicado por CI Linux.

Atlas npm 0.9.0 conserva su publicación anterior; no se modificó ni se publicó
de nuevo. ERP lo resuelve en API, desktop y Website Blocks.

## Adopción comprobada

Commit Hub: `b443e27cde7129ee21243a1bb845046b1c87fedc`.
Se ejecutó `pnpm shared:adopt --manifest <manifest publicado>` y se actualizaron
Atlas directo/override a 0.9.0, los tres manifests y lockfiles, fixture de preview,
snapshot de exports UI, catálogos y raíces de prueba del validador.

El flujo oficial verificó registry, tres instalaciones congeladas con stores
vacíos, contratos y build antes de escribir. Después se instalaron las nuevas
dependencias en raíz, API y worker: se comprobaron 16 declaraciones y cada archivo
contra el inventario publicado. Los ocho paquetes raíz pasaron también la
verificación completa de bytes. `pnpm shared:clean` pasó sobre el commit, sin ERP
hermano, tarballs locales ni node_modules previo.

Toolchain vigente:
`a17a090255e892b495a51acec74419305ef0547978c683e2d4fb997a457ffa90`.
No quedan consumidores activos del editor Atlas 0.8.2; sus documentos y snapshots
siguen soportados. Las referencias a lectores anteriores en pruebas de historia
y compatibilidad son deliberadas.

| Identidad activa | Bloques | Digest |
| --- | ---: | --- |
| 0.8.2 Hub | 156 | `2d7c84c46d74164981abb6028d6d278f5a9774a9eef32fb86a639cbe18c5d318` |
| 0.8.2 ERP | 157 | `cdb67dabfee8e546f4fb453935ac7a791bebba294ace9035e3159e3fb84126d1` |
| 0.9.0 canónico/default | 157 | `f5b5d67e4ddbffeedbc8e33e934a19b2973cae42ea7892192ca7849984d5a5b2` |
| 0.9.0 ERP/Ticketing | 158 | `bf50cd9eb4aeb731c2f35e21af7603f303f9c5c8626b4542b9594ea5f9bb8da1` |

## Verificaciones y correcciones de la certificación

- ERP: 174 casos críticos aprobados, Core 19/19, Module Engine 155 aprobados y uno
  omitido, dos regresiones públicas, build web y privacidad aprobados.
- Hub: lint y build aprobados; React Doctor 100/100 sin hallazgos. La instalación
  advierte peers React `latest`; se conserva React 19.3.0, probado por la suite.
- Unitarias ampliadas: 796 casos, **794 aprobados, cero fallidos, dos omitidos**.
  Los skips son modos POSIX en Windows y el perfil candidato opcional, sustituido
  en esta certificación por pruebas sobre la distribución publicada.
- Guardado MCP, edición, validación y reapertura de las cuatro identidades
  aprobados. Se preservan overrides y ceros explícitos, sin modificar SENDA.
- Frame real/Inspector responsive con paquetes publicados aprobado en Chromium,
  Firefox y WebKit dentro de la suite completa. Se retiró el antiguo skip que
  sólo ejercitaba el escenario responsive en modo candidato. El compilador y las
  imágenes de prueba se resuelven desde dependencias del Hub, sin otro checkout.
- SSR/hidratación nueva con Atlas y Website Blocks instalados desde registry:
  18 combinaciones, nueve anchos y Chromium/WebKit, incluido canvas móvil dentro
  de viewport 1920; navbar, tipografía, overflow y errores de hidratación comprobados.

La primera comprobación de la raíz production falló al intentar ejecutar binarios
Sharp Linux/musl desde Windows. Se conservó esa raíz registry para su plataforma
y se creó una raíz LAB con los mismos ocho tarballs y dependencias Windows. No
se relajó el requisito musl de producción ni se presentó LAB como despliegue.

Una prueba de permisos dependía de encontrar paquetes ajenos en la instalación
anterior. Ahora crea una fixture pnpm propia, sin escribir en la raíz instalada,
y mantiene los rechazos de hermanos, otros paquetes, lockfiles y repositorio;
también prueba positivamente la dependencia transitiva declarada.

La primera integración con la base local antigua rechazó trabajos por
`TOOLCHAIN_MISMATCH`. Se ejecutó el migrador oficial local, que valida loopback y
registra `hub.toolchain_current`; base y worker se verificaron con la identidad
nueva. Esa ejecución con configuración mezclada no cuenta como certificación.
La integración completa posterior terminó con **267 casos: 262 aprobados, cero
fallidos y cinco omitidos**. Los skips requieren los laboratorios explícitos de
Runtime/Studio, S3 real/Docker, S6 y S4 de actualizaciones reales; no sustituyen
la aceptación de un servidor remoto. La suite unitaria se repitió después de
añadir las comprobaciones publicadas y corregir la fixture de aislamiento.

## Entrega remota y aceptación pendiente

El usuario ejecutará la operación remota. La
[guía de actualización](../deployment/WEBSITE_RESPONSIVE_SHARED_UPDATE.md)
incluye las revisiones aprobadas, los comandos de compilación/actualización,
el retorno coherente de toolchain y las comprobaciones posteriores.
No se ejecutó SSH, staging, actualización productiva ni rollback de servidor.

Se consultó SENDA en modo lectura: **revisión 21**, una página, Atlas 0.8.2.
No se escribió ni se migró el recurso. Quedan capturas reales y aceptación visual
de navbar, hero, categorías, producto, historias, beneficios, footer, newsletter
y fotografías después del despliegue. Las fixtures no sustituyen esa aceptación.

Evidencias locales ignoradas en `.artifacts/website-responsive-foundation/publication-close/`
de ERP y Hub: logs de publicación/adopción, manifiestos, hashes, pruebas, instalación
limpia y versiones instaladas. El worker compilado para integración es local LAB;
el operador reconstruye la imagen limpia de producción mediante el flujo normal.
