# Website Marketplace: candidato de integración

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
| Fuente exacta de los ocho paquetes finales | `db6deb300f0835df6d74c6d46198ded1b2a375a2` |
| ERP: corrección visual nativa y fallback | `c003b53ce8b8804a3db27d0e80be0fb578b27b25` |
| Hub: cierre funcional, institucional y MCP | `fe0f363b7e4472bcce4ce26e1987a86f2e27e7af` |
| runly-web: documentación sincronizada y contrato institucional | `ca22e40fd7cb33921b3c5663b91a768c698ddfa9` (incluye `2eec678` y `cbcf4d4`) |
| Atlas independiente | `0.3.5`, checkout `dc30666923a6b4d19919a0e154bb4eb2cdd65e2f`; sin cambios en este cierre |
| Plugin ChatGPT y Claude | `0.1.0-dev.11`; `dev.9` permanece intacto |

El commit de este documento es posterior a los commits funcionales; no altera el contenido de los paquetes fijados arriba. La fuente incluye la documentación canónica y sus copias generadas con revisión/digest. Los commits son locales; no se hizo push.

## Distribución, locks y digests

Los ocho paquetes usan la versión exacta `0.1.0-source.db6deb300f0835df6d74c6d46198ded1b2a375a2`, nombres físicos `@runly-mx/*` y aliases lógicos `@runly/*`. El registro sigue siendo GitHub Packages; no se cambian versiones publicadas. `website-blocks` se incorpora al conjunto completo y conserva su dependencia exacta de Atlas 0.3.5.

Manifiesto final: `.artifacts/website-integration/shared-final/manifest.json` en ERP. SHA-256: `1f4bb3912436bc38431277af36b5edd84697caa6dc83c5e113dd793424c04893`. Contiene SHA-256 de cada tarball, integrity SHA-512, inventario por archivo, contentDigest, sourceRevision y contrato de preview.

| Paquete | SHA-256 tarball | contentDigest |
| --- | --- | --- |
| `@runly/core` | `50354129c360900a05c3b75e900f707b365eea05c788f8102fc5ee57e542ebe9` | `2828ecd676d9bf4d8556dac2d8300177417740301c96de09ca5833edb49345ad` |
| `@runly/module-engine` | `93632bb34465ba1f029fca58f9e97d5969fddbda4f8e6f1ff0dd61ce23eb1739` | `13aab7a3b004b308bb602d2f1187b4dbe843ea9c1e782f86a7b7a96d60f004a9` |
| `@runly/module-compiler` | `9f90ade1939ed81f770fb81cc2526da0b889f54d8a776d99f0053925b0257072` | `c42fe4d3eea84a7dde5518b7d8ca28da026a482c1f8e11e95afcd782ae951166` |
| `@runly/ui` | `efd44d0769dacc245b67bfc8d6a67fc2f854a404a2cde5079c4dc3e2806a0f82` | `1648703f6b689eee03f4d6b3bcbf0b960cc55420a808790056f304994104649a` |
| `@runly/sdk` | `1018ecbbeddd20f60aaa176f2591330ae4115b387751b887e41a1a5b5f18c9a2` | `2a131df2685ebbb6d4f68d04bb86c5ff23b64d9a03f4c39a8ec5d2cecccff9f1` |
| `@runly/preview-runtime` | `cfc62322724516c0364e886e32d7de3fe5fdcfff56ed3aa964c9411892f20093` | `66999d79b9eff7cd76a30f30db85701efa7ee2356ca919e5f692da25d7e46fc2` |
| `@runly/studio-interchange` | `38dfaba4c767e681fe095a409f7d891455ca7f6917cabfbe372076cd2c2542e6` | `8447085ce8c0ed3c29eceeea2817752146f44e72018a673c264f77d92685a96f` |
| `@runly/website-blocks` | `f9ce749c81921977eac57d20367ab78edec871f4d352171f4a250b96d6ab91aa` | `6ecb8980a7eabfd413d84af952973fcb37fef28d96d03be9cb80744b45054cbc` |

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

### 1. ERP: publicar artefactos compartidos

Desde el checkout aprobado y accesible en GitHub, usar el workflow existente, con aprobación del entorno protegido:

```bash
gh workflow run shared-packages.yml --repo Runly-MX/runly-erp --ref main \
  -f revision=db6deb300f0835df6d74c6d46198ded1b2a375a2 -f publish=true
gh run download "$SHARED_PUBLISH_RUN_ID" --repo Runly-MX/runly-erp \
  --name published-shared-package-manifest --dir "$SHARED_MANIFEST_DIR"
```

Comprobar los ocho artefactos, revisión, SHA-256, integrity y contenido contra este manifiesto. El workflow consulta versiones existentes y rechaza contenido diferente; no sobrescribe versiones históricas. Para reproducir sólo el empaquetado, en un checkout limpio de esa revisión: `pnpm release:shared --output .artifacts/shared-release-candidate` (sin `--publish`).

### 2. Hub: adoptar desde el registro y fijar otra revisión de despliegue

Credenciales de lectura del registro fuera del repositorio, con su mecanismo existente. Desde un Hub limpio que incluya el cierre:

```bash
pnpm shared:adopt --manifest "$PUBLISHED_SHARED_MANIFEST"
git diff -- shared-packages.lock.json package.json pnpm-lock.yaml \
  apps/api/package.json apps/api/pnpm-lock.yaml \
  apps/worker/package.json apps/worker/pnpm-lock.yaml
pnpm shared:clean
```

La adopción resuelve contra el registro, verifica inventarios, los tres installs frozen y el build; sólo entonces escribe los locks y derivados. Revisar y crear un commit local de adopción, incluyendo también los derivados que informe el script. Publicarlo únicamente con autorización. Ese commit adicional es el `$HUB_APPROVED_SHA` del despliegue: no se puede inventar su hash antes de resolver las versiones publicadas. No usar el root de laboratorio ni copiar fuentes manualmente a producción.

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
