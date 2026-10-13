# Paquetes compartidos: consumidor aislado

Date: 2026-10-12
Status: local packed-consumer verified; GitHub registry/Hub acceptance pending.

## Resultado

Seis tarballs de la revisión limpia 257771de39f3f9d966eae1c0e47d9ca2598309c9 se
instalaron con npm aliases exactos en dos carpetas temporales fuera del repositorio.
La segunda usó el lockfile de la primera con frozen-lockfile. No hubo publicación,
credenciales GitHub, cambios de imports ERP, modificación del Hub ni workflow CI.

En ambas instalaciones pasaron contratos Node, build JSX/CSS y Chrome real.
El bundle tiene 4539 inputs, todos resueltos dentro del consumidor. Se verificó
una implementación de React, ReactDOM y TanStack Query; fixture pins: React y
ReactDOM 19.3.0, Query 5.104.1. Estos pins se toman del host y se aplican como
overrides de singleton en el consumidor; no se promete deduplicación automática
para un host con configuración arbitraria.

Los archivos instalados de cada paquete se contrastan por SHA256 con el inventario
del manifest, antes de ejecutar sus contratos Node. Aliases @runly/@atlas de core,
engine, SDK y UI comparten implementación. Se comprobó compilación/ZIP RME3,
rechazo de JSON del SDK tras cambio de empresa, sesión de preview/dispose,
renderer Dashboard, componente Button con estado y lectura de tokens CSS.

## Defecto descubierto y corregido

La primera preparación desde 5f9066dc pasó los controles de archivos, pero el
consumer falló al importar AtlasTable. Los exports históricos del renderer habían
desaparecido pese al contrato de migración de 2026-09-13. El commit 257771de
restaura AtlasTable/Form/Detail/CrudView/CardView como aliases de los mismos
componentes Runly; no duplica componentes o identidades persistentes.

Pruebas de package scopes/bundle: 3/3. Dev Kit export/snapshot: 2/2.
Build web pasó; React Doctor revisó los dos archivos de exports sin problemas.
El consumer posterior comprobó igualdad de las cinco parejas en ejecución.

## Aislamiento y procedencia

Preparación usa git archive del commit exacto, no fuentes sucias. Como el CLI de
prueba estaba en desarrollo, se preparó desde un worktree limpio del commit de
aliases. Esbuild del entorno local sirvió como herramienta de preparación;
la instalación/build del consumidor usa exclusivamente sus dependencias instaladas.

El registro temporal escucha en 127.0.0.1 y sirve únicamente metadata y tarballs
allowlisted; no tiene publicación. Antes de instalar verifica seis identidades,
versiones source, SHA256/SHA512, inventario y contrato preview. Pruebas negativas
cubren metadata inválida, duplicados, traversal, corrupción, deriva y métodos HTTP
de escritura. Scripts de instalación se deshabilitan; npmrc de usuario es vacío
y el entorno del child no transmite secretos, NODE_PATH o configuración de despliegue.

Tarballs se recuperan y verifican por HTTP local; pnpm puede usar cache de paquetes
con contenido comprobado. No hay file/workspace links a fuentes ERP ni hoisting
de dependencias del repo. Chrome solo puede solicitar recursos del fixture local.
Servidores, navegador y carpetas propias se limpian al finalizar.

## Reproducir

Desde un checkout limpio y con dependencias locales instaladas:

```powershell
pnpm release:shared
$runlyRevision = git rev-parse HEAD
pnpm verify:shared-consumer --manifest ".artifacts/shared-release/$runlyRevision/manifest.json"
node --test scripts/tests/shared-consumer-registry.test.mjs scripts/tests/shared-package-release.test.mjs
```

Requiere pnpm, Node, tar, Chrome local y acceso al registry npm público. Los logs,
lockfile y receipt quedan en .artifacts/shared-consumer/<SHA>, ignorados por Git.
Ese lockfile usa el puerto temporal del registro fixture y no es un lockfile para
adoptar directamente en Hub. El comando rechaza flags de publicación.

## Límites y siguientes cierres

No se descargaron las versiones publicadas desde GitHub Packages ni se verificaron
permisos/credenciales o el pin actual del Hub. El pin 4299bec... sigue siendo la
última referencia documental, no una lectura nueva del consumidor remoto.
El intento read-only de obtener package.json del Hub mediante el conector GitHub
devolvió 404; eso no demuestra inexistencia del repositorio ni ausencia de paquetes.
La confirmación del consumidor remoto queda pendiente de acceso disponible.

La prueba valida exports, compilación y contratos seleccionados; no todos los
componentes, editores, integraciones o callbacks. CSS exports se resuelven,
procesan por esbuild y cargan en Chrome; generación completa de utilities Tailwind
y fidelidad visual de pantallas requiere la integración del host. Persisten peer
warnings transitivos que no se silencian como evidencia de compatibilidad total.

ERP conserva workspace:*; consumidores externos mantienen npm aliases y versiones
source exactas. Actualizar un consumidor requiere set completo, manifest revisado,
frozen install y contratos/build. Para rollback se vuelve al set anterior completo
y su lockfile. Ningún artifact local se considera publicado automáticamente.

Verified: 2026-10-12 (dos instalaciones, Node/browser/build/singletons/inventario,
tests de policy/registry, web build y checks descritos; aceptación remota pendiente).
