# Runly Website Recovery — plan actualizado después de Fase 0

Fecha: 2026-11-02. Baseline ERP `main` / `5a716b43ac940a62172b96b67a369940e10fb26a`.

**Fase 0 de código y pruebas aisladas terminada; resultado NO APTO como recuperación/E2E. Fases posteriores pendientes de revisión del responsable.** No hay autorización inferida para implementarlas. Fuente de evidencia: `docs/superpowers/specs/2026-11-02-website-recovery-master.md` y `docs/superpowers/evidence/2026-11-02-website-recovery/probes.mjs`.

## 1. Resultado y alcance ejecutado

Se movieron los dos documentos a specs/plans y se conservaron originales preliminares bajo docs/private ignorado. La entrega tenía dos duplicados y **ningún SKILL.md**. No se instalaron skills inexistentes. Se siguieron AGENTS.md, referencias RME3, privacidad y skill Supabase; esta auditoría no convierte Website oficial en un módulo custom.

Se identificaron registro/ACL, pantallas y consumidores, modelos, borrador/publicación, paquete externo, formularios/Growth, Catálogo/Commerce, ZIP/Storage, Nginx/gateway, DNS/TLS conceptual y perfil external. Se evaluaron los 15 recorridos distinguiendo código, pruebas en memoria y operación integrada pendiente. No se arrancaron servicios, cargaron .env, migraron datos, instalaron nuevas dependencias ni cambiaron pantallas/backend/Commerce. No hubo SSH, fetch/pull, push, release, deploy, DNS ni certificados.

| Evidencia | Resultado | Interpretación |
|---|---|---|
| Probes auditables nuevos | 23/23 | Reproducen comportamiento actual, incluidos defectos; no son aceptación verde. |
| Suite ERP seleccionada | 76/77; falla fixture público obsoleto WR-17 | 1 failure por company.findUnique ausente en doble, no incidente productivo probado. |
| Catálogo tenant/proyección | 8/8 | Valida unidades/queries con dobles; no DB/RLS real. |
| Builder checkout externo | 114/114, 20 archivos | Código 424de9f, no tarball npm certificado. |
| Builder instalado ERP | 0.2.0; carga y round-trip mínimo correctos | Runtime del lock actual; integración histórica pendiente. |
| npm metadata | latest 0.2.4, gitHead 598795c | Checkout externo tiene dos commits posteriores; no actualizar a ciegas. |

## 2. Defectos que gobiernan el orden de trabajo

1. **Autoridad/tenant:** WR-04 transición published con pages.update; WR-15 categoría blog acepta companyId/siteId arbitrarios en update; WR-05 referencias de sitio no validadas. Prioridad P0; pruebas con dos empresas y roles diferentes antes de diseñar opciones de administración.
2. **Sesión/origen/gateway:** WR-02 host fallback y X-Forwarded-Host, WR-14 riesgo de JS ZIP en origen ERP. Definir modelo de confianza antes de abrir imports/subdominios. La explotabilidad pública real sigue sin probarse.
3. **Formulario/Growth:** WR-16 confunde propertyId con websiteSiteId; las pruebas previas usan IDs iguales. Resolver identidad sin romper captura/analytics ni respuestas existentes.
4. **Publicación:** WR-01 sitio status ignorado, WR-03 publica borrador viejo, WR-06 colisión por empresa, WR-07 reemplazo parcial. No construir UI de estados que el backend no puede garantizar.
5. **ZIP:** WR-08 wrapper incorrecto, WR-09 archivos/ratio sin controles, WR-10 URLs internas. Upload hoy ya afecta publicación; separar validación/staging de promoción.
6. **Contratos/editor:** WR-11 formatos distintos de draft, WR-12 tema sin vínculo público, WR-13 blog desconectado, WR-17 fixture obsoleto. Actualizar paquete tras validar consumidores y corpus, conservando schema1 y aliases.

Todos los IDs, fuentes/lineas, reproducciones, severidades y límites están en §8 del expediente. No confundir probes de propagación a persistencia con mutación probada de una DB de clientes.

## 3. Fases propuestas y responsables

| Fase | Responsable | Trabajo concreto | Gate y entregable |
|---|---|---|---|
| **0. Auditoría** | Codex | Código y pruebas en memoria; expediente actual y plan | Entregado con NO APTO E2E; revisión del responsable, sin iniciar implementación. |
| **1. Contratos/arquitectura** | Codex; Claude revisa impacto UX | ADR de origen, multisitio/host legacy, estados, revisión de documento, release/import/domains y mapeo Website/Growth. DTO y errores reales, compatibilidad y estrategia de pruebas desechables. | Aprobar contratos y ownership por archivo antes de código funcional. No migrar todavía. |
| **2. UX/UI actual y diseño** | Claude | Capturas del producto seguro/aislado, fricción y flows de setup progresivo/admin/editor/forms. Estados/errores/permisos de Fase 1, responsive/teclado y componentes @runly/ui. | Especificación revisada; no improvisar API ni desarrollar backend. |
| **3. Reparación funcional** | Codex | Autoridad y pertenencia, forms/Growth, draft/publish/theme/blog, pruebas aisladas y compatibilidad histórica; adaptar paquete externo/actualizar dependencia validada. | Tests rojos de aceptación → cambios mínimos → tests verdes, regresión Commerce sin modificar su contrato, commit local coherente. |
| **4. Frontend definitivo** | Claude | Implementar setup, selección de sitios, editor, formularios, publicación y manejo de conflictos según contratos estables. | Pruebas UI 390/1440, claro/oscuro, teclado/foco y estados de fallo. No editar rutas backend de Codex. |
| **5. Release/ZIP/hosting** | Codex; Claude UX | Staging/manifiestos/activación atómica/rollback/cache, gateway seguro y laboratorio de orígenes/TLS; imports compilados certificados. | Laboratorio aislado, todos los negativos; DNS/infra pública requieren autorización separada. Dominios propios optativos posteriores. |
| **6. Consolidación/piloto** | Codex + Claude con ownership explícito | Matriz E2E multitenant, permisos, histórico, external, seguridad y experiencia; plan de piloto/rollback. | Revisión formal; ningún push/deploy/publicación npm automática. |

El diseño puede avanzar con mocks contractuales después del gate técnico; las partes de Fase 5 necesarias para garantizar aislamiento deben preceder a cualquier piloto de ZIP. No esperar a terminar pantallas para resolver origen/sesión.

## 4. Contratos a entregar antes de implementar

| Contrato | Existente que debe respetarse | Falta decidir/probar | Dueño |
|---|---|---|---|
| Website-Site | companyId/siteId, siteType, status y sourceType separados; API GET singular elige primer sitio | Multisite explícito, slug/hostname unique, lifecycle público y roles | Codex |
| Website-Builder | Schema1, serialize string, parse string/objeto, alias `/draft`, paquete npm y bloques Runly | DTO canónico, revisión esperada/conflicto, theme por sitio, recursos; compatibilidad 0.2.0→versión validada | Codex + revisión Claude |
| Website-Release | PageVersion y publishedBuilderData; dist por empresa actual | Release privado/inmutable, hash, promoción, rollback, invalidación y unpublish efectivo | Codex |
| Website-Catalog | published Web independiente de pos_enabled/Commerce; endpoints públicos por empresa | Proyección permitida, agotados, refresh y política empresa/sitio inactivo | Codex con revisión Commerce |
| Website-Forms | WebsiteForm.siteId, GrowthProperty.websiteSiteId, captura v1/legacy, submission idempotente | Mapeo IDs distintos, permisos de respuestas, legacy limit/retención, tratamiento de datos | Codex + revisión Claude |
| Website-Import | ZIP de estáticos con index; ningún runtime de servidor | Límites descomprimidos, validación ruta original/archivos/tipos, origen y fixtures auténticos | Codex |
| Website-Domains | domain string; normalización y fallback histórico | Ownership, unique, estados TLS, proxy confiable y host desconocido | Codex |
| Instalaciones | Tablas históricas, /app y SDK/aliases/MCP, perfil external configurable | Upgrade aditivo, backup/rollback, aislamiento demostrado por destinos y almacenamiento | Codex |

No renombrar `atlas.*`, tablas, permisos, campos ni URLs almacenadas por conveniencia. No modificar Commerce sin incompatibilidad demostrada y aprobación posterior. Catálogo conserva autoridad de producto/precio/stock; no añadir un segundo maestro.

## 5. Actualización del paquete externo

1. Mantener el baseline actual: ERP lock 0.2.0; npm 0.2.4 corresponde a 598795c; fuente externa 424de9f añade dos fixes hero aún no garantizados en npm.
2. En fase de reparación autorizada, inspeccionar tarball publicado y probar API/exports/CSS, peer React y corpus histórico representativo con bloques Runly, sanitización, guardar/reabrir y preview/publicación.
3. Si basta 0.2.4, actualizar dependencia desde registry con pnpm del monorepo, revisar manifest+lock y pruebas consumidoras. Si se necesitan fixes posteriores, preparar nueva versión en el repo del paquete, correr tests/build y revisar contenido del tarball antes de solicitar publicación externa. No reutilizar versión publicada.
4. Documentar versión de esquema/documento y plan de reversión al lock anterior. No vincular una carpeta local con link/workspace sustituyendo accidentalmente el contrato distribuido por npm.
5. Ningún npm publish, push o deploy está autorizado por la Fase 0. No se cambió el repo externo.

## 6. Banco de pruebas y condiciones de ejecución

**Ya reproducible sin servicios:**

```powershell
node --test --test-reporter=spec docs/superpowers/evidence/2026-11-02-website-recovery/probes.mjs
```

Los comandos de las suites existentes están en §9 del maestro. En el repositorio externo: `pnpm exec vitest run`. No sustituirlos por un arranque completo de API: boot ejecuta ensureBuckets; captura/config puede crear espejos Growth al leer.

**Para pruebas integradas posteriores:** crear DB/Storage/config exclusivos, seed sintético con empresas A/B, dos sitios A1/A2, dominio desconocido y conocido, lector/editor/publicador, WebsiteSite.id **distinto** de GrowthProperty.id y páginas schema1. Sin compartir `.env.external`, buckets ni claves con instancias existentes. Registrar nombres ficticios, comandos y resultados sanitizados; no publicar direcciones reales.

| Aceptación | Prueba que falta cerrar |
|---|---|
| A01–A03 | Sitio sin comercio; dos sitios independientes; slug/domain único; tercer tenant sin acceso. |
| A04–A06 | Corpus histórico string/objeto; conflictos de dos editores; preview privado sin promover release. |
| A07–A08 | Draft→publish→republicar→rollback→unpublish; fallo de cada etapa sin mezcla; cache entre réplicas/browser y URL directa Storage. |
| A09–A13 | Matriz published/pos_enabled independiente; lista/ficha/id/slug/categoría/variante/agotados y cambio en pestaña abierta; no alterar Commerce. |
| A14–A17 | Form IDs Website/Growth distintos; v1+legacy, required/types/unknown/retry, respuesta/lead/activity, permisos, rate/Turnstile, SMTP fallido sin pérdida. |
| A18–A21 | Builds auténticos HTML/Vite/Vue/Angular/Astro/Next export; root/deep links/base/chunks; traversal original/symlink/duplicados/ratio/privados; fuente/SSR rechazados y JS aislado. |
| A22–A24 | Host desconocido y forwarded-host manipulados; DNS/TLS de laboratorio y takeover/colisión. No hacer pruebas en dominios de clientes. |
| A25–A26 | Upgrade histórico aditivo, aliases/SDK/MCP, almacenamiento/DB propios en local y external, reversión comprobada. |
| A27–A28 | Responsive/a11y/estados y roles; pages.update sin publish no reactiva publicación; ownership de padres inmutable. |

Probes actuales observan defectos; los futuros tests de aceptación deben exigir el comportamiento corregido, no mantenerlos verdes artificialmente.

## 7. Decisiones pendientes y costos

| Decisión | Recomendación | Estado |
|---|---|---|
| Iniciar Fase 1 | Revisar este expediente y aprobar alcance de contratos | Pendiente del responsable |
| Builder | Conservar/adaptar; validar 0.2.4 o nueva versión para fixes no publicados | Propuesta |
| ZIP | Solo estáticos compilados; no SSR/build de fuentes en host | Propuesta |
| Origen público | Dominio registrable separado para JS no confiable; sin compartir token ERP | Pendiente de análisis formal y aprobación |
| Subdominios de marca | Namespace por sitio, hostname strict y wildcard TLS específico | Viabilidad conceptual; no implementado ni aprovisionado |
| Dominio propio | Diferir hasta release/ownership/TLS estables | Propuesta |
| Compatibilidad primary fallback | Mantener solo en hosts legacy explícitos, con pruebas | Propuesta |
| Retención y datos públicos | Definir política de respuestas, campos públicos y backups ZIP | Pendiente |

Fuentes oficiales revalidadas y links en §7 del maestro. Cloudflare SaaS: 100 hostnames incluidos y USD 0.10 por adicional según plan público; no presupuesto de cuenta. ACM USD 10/mes del borrador **no revalidado**, sujeto a cotización. Hosting/tráfico/operación/registro sin medición ni costo aprobado. No emitir certificados ni cambiar DNS como parte de este plan documental.

## 8. Transferencia a Claude y ownership

La Fase 0 queda disponible para revisión; **no se pidió a Claude que implemente ni se lanzó otro agente**. Handoff tras aprobación: rutas reales de screens, paquete activo y diferencias npm/fuente, estados actuales y objetivos, permisos/errores/DTO de Fase 1, límites ZIP/Catálogo y fallos parciales conocidos.

Problemas concretos de UX a auditar con capturas: setup de varias peticiones sin recuperación, selección implícita del primer sitio, edición en path público, guardado/publicación divergentes, tema editor/público, IDs manuales de producto/formulario, semántica preview vs publicación inmediata ZIP, logos de frameworks sin certificación y blog placeholder. Son pistas sustentadas en código, no una evaluación visual WCAG final.

Codex conserva propiedad de servicios/API/persistencia/publisher/contratos y pruebas de backend. Claude posee diseño/React/estilos en fases autorizadas. Registrar ownership por archivo antes de editar; contratos compartidos cambian tras revisión cruzada, sin editar el mismo archivo simultáneamente. Documentos rectores fueron editados solo por Codex en esta fase.

## 9. Acta de cierre

- SHA auditado: `5a716b43ac940a62172b96b67a369940e10fb26a`.
- Entregables: maestro técnico, plan revisado, probes locales ejecutables, originales preliminares preservados fuera de Git.
- Confirmado: arquitectura y consumidores reales, campo published, paquete 0.2.0 vs registry 0.2.4, controles existentes de captura y defectos con evidencia.
- Incompleto: multisitio/ownership/estados/releases, integración forms/Growth y blog; ZIP seguro y dominio verificado no están cerrados.
- Bloqueado para certificar: E2E DB/Storage/browser aislados, corpus histórico, builds de frameworks, origen/sesión y TLS de laboratorio. Estos bloqueos no se confunden con falta de acceso al checkout: el checkout sí se auditó.
- Veredicto: **NO APTO E2E; auditoría estática y pruebas con dobles entregadas para revisión.**
- Calidad del expediente: sintaxis del probe y whitespace correctos; privacidad global falla por 67 alertas preexistentes ajenas al cambio. Los tres entregables pasaron inspección individual del mismo verificador con 0 hallazgos. Se conserva el fallo global como limitación, sin modificar otros módulos.
- No hay aprobación de la siguiente fase, actualización funcional del builder, publicación npm ni despliegue. Detenerse después de Fase 0 y esperar revisión.
