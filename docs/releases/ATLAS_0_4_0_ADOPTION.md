# Preparación de adopción Atlas 0.4.0

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
