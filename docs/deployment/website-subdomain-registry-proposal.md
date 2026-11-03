# Propuesta: registro global de subdominios de Website

## Estado de las decisiones

| Elemento | Estado |
|---|---|
| Arquitectura de registro centralizado para múltiples instalaciones | **Dirección aprobada** |
| Implementación del registro (servicio, ruta REST, cliente, enrolamiento) | **Pendiente** |
| Despliegue (DNS, certificados, edge, servicio) | **No autorizado** |
| Dominio registrable independiente de `runly.mx` para contenido ZIP no confiable | **Aprobado conceptualmente; dominio aún sin seleccionar ni comprar** |

Objetivo vigente: ofrecer subdominios automáticos `<slug>.sites.runly.mx` a empresas de múltiples instalaciones de Runly, con unicidad global. No se implementó ningún registro, no se tocó DNS ni certificados y no se cambió ninguna validación de aislamiento.

## Lo que existe hoy (verificado en el código)

- `website-gateway-service.reserve()` crea `slug.<RUNLY_WEBSITE_NAMESPACE_ROOT>` con unicidad **local** (`website_domain.hostname` único en esa base). No tiene ruta REST: nada la llama fuera de pruebas.
- La fila nace `pending` y `ready=false`; solo pasa a `assigned/ready` automáticamente si la raíz termina en `.test`. No existe ningún proceso que complete la transición en producción, y `resolve()` exige `assigned` y `ready`. Resultado: hoy un hostname de plataforma nunca se sirve fuera del laboratorio. El ensayo del instalador asigna la fila por SQL, como el laboratorio.
- Lista de nombres reservados en código: admin, api, app, auth, login, public, preview, support, status, www, mail, erp, mcp, runly, atlas, internal, system (más prefijos `runly-`, `atlas-`, `internal-`, `system-`, `admin-`, `api-`, `auth-`).
- `website-content-isolation.js` rechaza como raíz de contenido o vista previa cualquier host bajo `runly.mx`, igual al origen del ERP o que comparta dominio registrable con él, y exige HTTPS. **Se conserva tal cual**: el JavaScript no confiable de un ZIP nunca se sirve bajo `runly.mx`.

## Decisiones que siguen abiertas

1. Dónde se aloja el registro y quién lo opera (se recomienda un servicio propio de Runly, descrito abajo).
2. Selección y compra del dominio registrable independiente para ZIP y vista previa (ejemplo `runly-sites.net`).
3. Si `sites.runly.mx` se solicita a la Public Suffix List (recomendado) antes del primer cliente.
4. Si las instalaciones auto-hospedadas pueden reclamar nombres (recomendado: sí, con licencia/enrolamiento) o solo las gestionadas por Runly.

## Arquitectura recomendada

**Registro central** `registry.runly.mx` (servicio pequeño, base propia, no parte del ERP). Las instalaciones lo llaman con credencial de instancia; el ERP nunca expone el registro a navegadores.

Modelo:

- `registry_instance(instance_id, public_key, status, enrolled_at)`: una instalación se enrola una vez y firma sus peticiones.
- `registry_name(name PK, instance_ref, company_ref, site_ref, state, version, created_at)` con `state` en `reserved | active | suspended | quarantined | released`. `company_ref` y `site_ref` son opacos (hash con sal de instancia), nunca identificadores del ERP.
- `registry_audit` solo de anexión.

Operaciones (todas idempotentes por clave y firmadas):

- `claim(name)`: crea `active` si el nombre es válido y está libre; devuelve el mismo registro si ya es de esa instancia/sitio. Unicidad global por restricción de base de datos.
- `rename(old,new)`: reclama el nuevo, marca el anterior `quarantined` 90 días y lo mantiene como redirección 301 al nuevo.
- `release(name)`: pasa a `quarantined` 90 días y luego a libre. La cuarentena evita que otro tome un nombre con enlaces vivos.
- `reassign(name, instance)`: solo con transferencia firmada por ambas instancias o aprobación manual de un operador de Runly; queda en auditoría.
- `suspend/revoke(name)`: acción de operador (abuso, impago, orden legal); el edge responde 410.

Validación de nombres: solo ASCII `[a-z0-9-]`, 3 a 50 caracteres, sin punycode, sin guiones al inicio o final, lista reservada del código más marcas de Runly y términos de suplantación (bancos, soporte, pago), detección de confundibles y límite de reclamos por instancia y por hora.

Prevención de secuestro: el nombre queda ligado a `instance_id` con firma; la cuarentena en `release/rename`; no hay CNAME hacia terceros ni registros dangling (el wildcard apunta siempre al edge de Runly); un nombre `suspended` nunca se reutiliza automáticamente.

## Resolución y DNS/TLS

- DNS: `*.sites.runly.mx` (wildcard) hacia el **edge de Runly**. Para multi-instalación el edge consulta el registro (`name → instance origin`) y reenvía al gateway público de esa instalación con el `Host` original; las instalaciones no necesitan DNS propio para esto. Alternativa descartada: subzonas por instancia, porque rompe el formato `<slug>.sites.runly.mx`.
- TLS: certificado wildcard `*.sites.runly.mx` emitido por DNS-01 en el edge, con CAA restringido a la CA elegida y renovación automática. Segundo wildcard independiente para `*.content.<dominio ZIP>` y `*.preview.<dominio ZIP>`; la clave privada de cada uno vive solo en su edge.
- Separación: administración en `app.runly.mx` o el dominio de la instalación; sitios de plataforma en `sites.runly.mx` (solo contenido generado por el builder, sin JS arbitrario); ZIP y vista previa en el dominio registrable independiente. Sin cookies compartidas: las del ERP deben ser de host exacto, y la inscripción de `sites.runly.mx` en la Public Suffix List impide cookies entre sitios de distintos clientes.
- Caché: HTML con TTL corto y revalidación; activos con hash inmutables. La activación o el rollback de un release purga por hostname. Falta probar encabezados reales en staging.

## Cambios de código previstos (después de aprobar)

1. Ruta REST protegida para `reserve` (permiso `website.domains.manage`) que llame al registro en lugar de la unicidad local, con modo local explícito para instalaciones sin registro.
2. Proceso que haga la transición `pending → assigned/ready` al confirmar el registro y la salud del edge.
3. Cliente del registro con firma de instancia y reintentos idempotentes; enrolamiento en el instalador.
4. Gateway: respuesta 410 para nombres suspendidos y 301 para renombrados.

## Qué se probó ahora

Solo la resolución de hostnames en un namespace de laboratorio (`*.lab-sites.test`) a través del Nginx empaquetado y el gateway real, con la fila de dominio asignada directamente. No se probó DNS, TLS, edge, registro ni nada de lo anterior.
