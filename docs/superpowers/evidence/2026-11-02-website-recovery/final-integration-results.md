# Website: integración final y validación consolidada

Fecha: 2026-11-02. Rama `website-final-integration` sobre `7b69b5062` (contiene `e8df5c181`). Sin push, merge a main, SSH, DNS ni producción.

## Cambios de este bloque

- Plantillas: la aplicación pide confirmación (`ConfirmDialog`) y explica que solo crea borradores, no toca páginas existentes ni lo publicado, y que el tema del borrador se reemplaza si la plantilla lo incluye.
- Accesibilidad: el workspace por sitio anidaba un `main` dentro del `main` del AppShell; ahora es una región con nombre. La burbuja global de chat no tenía nombre accesible.
- Pruebas actualizadas a los contratos vigentes (plantillas disponibles en sitios no predeterminados, rutas explícitas que bloquean al lector, acciones de Catálogo por empresa) y aserciones de aislamiento independientes del orden de ejecución.
- `scripts/test-website-final.mjs`: aislamiento entre empresas en lectura y mutación (sitio, estado, páginas, Blog, Catálogo, selección, plantillas, releases, configuración), salida pública sin credenciales, y UI real con landmark único, nombres accesibles, teclado, modo oscuro y 390 px.

## Resultados (laboratorio desechable: PostgreSQL, Auth, Storage, API y Vite reales; Chromium)

| Prueba | Resultado |
|---|---|
| `test-website-functional-browser` | 16/16 |
| `test-website-sections-browser` | 11/11 |
| `test-website-dependencies` (HTTP + SQL) | 12/12 |
| `test-website-dependencies-browser` | 5/5 |
| `test-website-final` | 3/3 |
| `node --test` Website (lib, SDK, servicios, rutas) | 68/68 |
| Build web (vite), ESLint de archivos modificados, `git diff --check`, `prisma validate` | correctos |
| Imagen Docker de la API | construida (no se ejecutó el instalador completo) |

S1-S4 y el corpus del builder no se repitieron: su código no cambió. Los recorridos de ZIP, conflicto 409, rollback, publicación y formularios provienen de `functional-browser`.

## No acreditado

Touch real y lector de pantalla, instalador completo, dominios propios, Calendar, DNS/TLS y subdominios automáticos reales, checkout y cobros. Las comprobaciones de accesibilidad son automatizadas y razonables, no sustituyen una auditoría con axe o lector de pantalla. Laboratorio e imagen se eliminaron al terminar.
