# Preparación de adopción Atlas 0.4.0

## Adopción autorizada local — 2026-11-13

Se aplicaron los tres pins npm exactos 0.4.0 y se instaló el lock con pnpm 9.15.0 y frozen-lockfile. API, desktop y website-blocks resuelven el paquete publicado; ESM/CJS y CSS instalados coinciden con el tarball aprobado, SHA-256 `988739086c54ecb2e50843f5738a66008db38ec528f3d23df5eb20071c73c9c2`.

La resolución inicial del gestor actualizaba dependencias latest ajenas. Se descartaron esos cambios: el lock conserva los metadatos Atlas generados por pnpm y todas las resoluciones anteriores de dependencias y peers; la instalación frozen validó ese resultado. No se actualizaron otras dependencias.

Verificaciones posteriores a publicación aprobadas: capacidades v1, 140 exports, preservación de propiedades/SEO/efectos, SSR, Chromium de edición y reapertura, React 19.3.1, 148 bloques y rechazo de versiones no revisadas. La construcción real instalada del cliente/SSR produce los mismos hashes aprobados: cliente `a062570ae8afd649bdab103eb8199e57ab0a3ba2db355eba657d1615edf16d12`, CSS `0b03ec3960b35e412ed70607f940a39fb28a1653f4d014f9f22c61f143da9e43`, SSR `a3caef8ee6bb53cf98f208ed9f97f319568f6754fb3297b04d4d2d654e4d4532`. Lint dirigido aprobado.

**Integración y push ERP detenidos:** el gate obligatorio de privacidad devuelve código 1 y los mismos 72 hallazgos globales documentados. Los siete archivos de preparación/adopción pasaron inspectFile sin hallazgos nuevos antes de añadir este registro; el documento actualizado también debe pasar la misma comprobación antes del commit. El resultado dirigido no sustituye al gate global. No se modificaron políticas ni validadores. Se conserva el trabajo ajeno sin incorporar al commit.

El procedimiento de preparación siguiente queda como evidencia previa: su parche ya está aplicado localmente. No se repitieron suites globales ni se desplegó.

Sin publicar ni desplegar. El runtime público admite exactamente 0.3.5 y 0.4.0; cualquier otra versión sigue requiriendo revisión explícita. No cambian el catálogo, Page schema ni formatos Website.

Consumidores directos: apps/api, apps/desktop y packages/website-blocks. Los imports del editor, SSR, SEO, efectos y scripts de catálogo/runtime se resuelven a través de esos paquetes. Ningún lock definitivo apunta a un tarball temporal.

El parche `atlas-0.4.0-dependencies.patch` prepara los tres pins exactos para el paquete **publicado**, pero permanece sin aplicar hasta comprobar su integridad en el registro:

```powershell
git apply --check docs/releases/atlas-0.4.0-dependencies.patch
git apply docs/releases/atlas-0.4.0-dependencies.patch
pnpm install --lockfile-only --ignore-scripts
pnpm install --frozen-lockfile
pnpm why -r @raulbellosom/atlas-web-builder
```

Estos comandos modifican manifests/lock únicamente después de la autorización y publicación. Usar la versión pnpm declarada por el proyecto. Revisar y confirmar el diff antes de cualquier integración. No actualizar otros paquetes por conveniencia.

La prueba del tarball se reproduce desde el checkout hermano Atlas con `node scripts/verify-packed-release.mjs <tarball>`. Extrae los bytes en carpetas temporales y reutiliza las dependencias/React que ya fijan los consumidores; no modifica node_modules ni locks originales. Compila el runtime público real y su SSR en una copia aislada, comprueba hidratación/menú móvil en Chromium y rechaza versiones no revisadas. La versión del renderer 0.4.0 no obliga a renombrar el catálogo de plantilla 0.3.5.

Después de descargar el tarball del registro se repite esa prueba, además del lint dirigido y la validación de efectos. Se genera el runtime cliente y el SSR juntos, con hashes correspondientes. No se despliega en esta fase.

## Rollback

Antes de adoptar, registrar el commit y los hashes del runtime/SSR vigentes. Si falla el paquete o hay pérdida de valores, detener adopción; restaurar manifests y lock como conjunto desde ese commit, instalar con frozen-lockfile y reconstruir el par runtime/SSR. Mantener releases y assets inmutables anteriores; no sobrescribir un hash ni publicar automáticamente para probar rollback.

No hay migraciones de datos en esta entrega. Un rollback de publicación de un sitio usa su release sellada anterior, bajo autorización independiente. No se deben podar documentos incompatibles ni relajar el validador para hacerlos publicables.
