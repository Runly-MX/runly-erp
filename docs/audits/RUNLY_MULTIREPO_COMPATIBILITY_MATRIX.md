# Matriz de compatibilidad multirepositorio (preflight 2026-11-24)

| Repositorio | Ruta local | Rama | SHA | Workspace | Notas |
|---|---|---|---|---|---|
| Runly ERP | `runly` | `main` | `eb5401889` al redactar | limpio, sin push | Programa de estabilización; decenas de commits locales sin publicar |
| Atlas Web Builder | `atlas-web-builder` | `main` | `c08de3e` = `v0.11.0` | limpio | `package.json` 0.11.0; `dist/` ignorado por git |
| Developer Hub | `runly-developer-hub` | `main` | `70a685a` | limpio | Fija Atlas **0.10.0** y paquetes de ERP en `fd16dc513` |
| runly-web (runly.mx) | `runly-web` | `main` | `c12283d` | limpio | Contenido generado desde `docs/developers`; no consume Atlas |

Otros árboles presentes y no tocados: `runly-developer-hub-*` (integración, studio), `runly-website-*` (worktrees de ERP en ramas de trabajo) y `runly-9f08`.

## Dependencias entre repositorios

| Consumidor | Consume | Versión | Observación |
|---|---|---|---|
| ERP | Atlas | 0.11.0 (`apps/desktop`, overrides raíz, lockfile con integridad) | Binario idéntico a la reconstrucción del tag |
| Hub | Atlas | 0.10.0 | **Desalineado** con ERP |
| Hub | `@runly/*` (core, module-compiler, module-engine, preview-runtime, sdk, studio-interchange, ui, website-blocks) | `@runly-mx/*@0.1.0-source.fd16dc513...` | Anclados a un SHA de ERP; cambios posteriores de `@runly/ui` (p. ej. `sideEffects`) no llegan al Hub hasta reanclar |
| ERP | paquetes compartidos | `workspace:*` | Se publican desde ERP |

## Versiones publicadas

No verificadas contra el registro (sin consulta de red). Las versiones consumidas se leen del lockfile de cada repositorio.

## Orden de publicación propuesto (preparado, no ejecutado)

1. ERP (API, worker, web) con el flag experimental apagado.
2. Paquetes compartidos desde el SHA publicado.
3. Hub: subir Atlas a 0.11.0, registrar los catálogos 0.11.0, reanclar los paquetes de ERP y pasar sus pruebas de compilación.
4. Republicar catálogo y plantillas oficiales.
5. Activar el runtime experimental solo en staging.
