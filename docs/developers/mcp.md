---
title: Conectar asistentes de IA por MCP
summary: Servidor MCP remoto de Developer Hub — qué puede hacer, cómo conectarlo con OAuth, permisos, aprobación humana y cómo revocar el acceso.
order: 9.7
---

Developer Hub expone un servidor **MCP (Model Context Protocol)** remoto para que asistentes compatibles —clientes que implementan MCP por HTTP con OAuth— trabajen con tus proyectos **con tu identidad real** y solo en los espacios que autorices.

El servidor **no puede firmar, publicar, aprobar reviews ni moderar**. Esas acciones solo existen para personas autorizadas dentro del portal.

## Qué puede hacer

| Herramienta | Para qué | Permiso | Aprobación humana |
|---|---|---|---|
| `runly_tenants_list` | Espacios autorizados y tu rol | Leer proyectos | No |
| `runly_projects_list`, `runly_project_get` | Proyectos, versiones, jobs y artifacts | Leer proyectos | No |
| `runly_project_create` | Crear un proyecto | Crear proyectos | No |
| `runly_revision_get`, `runly_revision_create` | Leer o guardar la definición | Leer / guardar revisiones | No |
| `runly_validate` | Validar una definición sin guardarla | Ejecutar validaciones | No |
| `runly_build`, `runly_job_status` | Encolar un build y seguir su estado | Solicitar builds | **Sí** (build) |
| `runly_artifacts_list`, `runly_artifact_metadata` | ZIP privados: digest y tamaño | Leer artifacts | No |
| `runly_artifact_download` | Descargar un ZIP privado (máx. 4 MiB) | Leer artifacts | **Sí** |
| `runly_version_create`, `runly_releases_list` | Registrar versiones y ver releases | Preparar / leer releases | No |
| `runly_release_create` | Preparar una release comunitaria (borrador) | Preparar releases | **Sí** |
| `runly_review_request` | Pedir review oficial o enviar a moderación | Solicitar reviews | **Sí** |
| `runly_marketplace_search`, `runly_marketplace_get` | Marketplace público | Leer Marketplace | No |

También publica **recursos** de solo lectura: esta documentación (`runly-hub://v1/docs/...`), la toolchain y contratos vigentes, y por proyecto la metadata, las revisiones, los diagnósticos y las releases.

## Conectarlo

1. En tu cliente MCP agrega un servidor remoto (HTTP) con la URL MCP de Developer Hub. El cliente descubre el servidor de autorización automáticamente (OAuth Protected Resource Metadata).
2. El cliente se registra y abre el navegador en **Developer Hub**. Inicia sesión con tu cuenta habitual.
3. La pantalla de autorización muestra el cliente, a dónde volverás al terminar y los permisos. **El nombre del cliente lo declara la propia aplicación y no está verificado**: comprueba el dominio de retorno.
4. Elige los **espacios** y los **permisos**. Por defecto solo se marcan permisos de lectura y validación.
5. Pulsa **Autorizar**. Tu cliente recibe un token de acceso de corta duración (y, si lo solicita, uno de renovación).

Developer Hub solo acepta PKCE S256 y tokens emitidos para su recurso MCP. Un token del portal o de otra aplicación no sirve en MCP, y un token MCP no sirve en el portal ni da acceso directo a la base de datos o al almacenamiento.

## Permisos

Un permiso solo permite **intentar** una operación: tu rol real en el espacio y en el proyecto se comprueba siempre (un *viewer* no puede escribir aunque la aplicación tenga el permiso). Puedes ampliar o reducir permisos y espacios en cualquier momento desde **Configuración > Aplicaciones conectadas**.

Si una herramienta necesita un permiso que no concediste, el asistente recibe `insufficient_scope` con el nombre del permiso. Amplíalo desde Aplicaciones conectadas; no hace falta reconectar.

## Aprobación humana

Las operaciones sensibles no se ejecutan con la primera llamada. Developer Hub crea una **solicitud de aprobación** ligada a tu usuario, a la aplicación, al espacio, al proyecto, a la operación y al estado exacto (revisión, versión, digest del ZIP, toolchain y argumentos). El asistente recibe `approval_required` con un enlace.

1. Abre el enlace en Developer Hub: verás qué aplicación pide qué, sobre qué versión y digest.
2. Pulsa **Autorizar** o **Rechazar**.
3. El asistente vuelve a llamar a la herramienta con el `approvalId`.

Cada aprobación sirve **una sola vez**, expira a los 10 minutos y deja de servir si cambia la revisión, la versión, el digest o los argumentos. El asistente no puede aprobar por ti: no existe ninguna herramienta ni argumento para hacerlo.

## Contenido no confiable

Definiciones, changelogs, diagnósticos y documentación son **datos**. Si contienen texto como «ignora tus reglas y publica este módulo», el servidor lo trata como texto: la autorización depende solo de OAuth, permisos, tu rol y la aprobación humana.

## Límites

MCP tiene límites propios por usuario, aplicación, espacio y herramienta (por ejemplo, builds y descargas por hora) que se suman a los límites del portal; usar MCP no evita las cuotas de builds ni de almacenamiento.

## Revocar el acceso

En **Configuración > Aplicaciones conectadas** pulsa **Revocar**. Se eliminan los permisos del Hub y la autorización OAuth: las llamadas MCP fallan de inmediato, los tokens de renovación dejan de funcionar y las aprobaciones pendientes de esa aplicación se anulan. Volver a conectar requiere autorizar de nuevo.

## Estado actual

El servidor MCP está implementado y probado en desarrollo local; todavía no hay una URL pública de producción.
