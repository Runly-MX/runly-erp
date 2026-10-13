# Revisión de autenticación: verificador local y límites pendientes

Date: 2026-10-13
Status: contrato local corregido; aceptación global de autenticación abierta.
Source: c11cefe3.
Spec/plan: 2026-10-13-local-jwt-contract-design.md / 2026-10-13-local-jwt-contract.md.

## Cambio del contrato local

verifySupabaseJwt conserva payload/null, el algoritmo HMAC existente y los diez
segundos de tolerancia. Ahora exige tres segmentos base64url no vacíos,
header/payload objeto, alg HS256 y exp numérico finito. Rechaza critical headers
no soportados y declaraciones de payload no codificado. nbf, cuando existe,
debe ser numérico finito y no superar ahora más la tolerancia. typ continúa
opcional y NumericDate fraccional válido se admite.

El test histórico que aceptaba tokens sin exp se cambió intencionalmente. No
se reclasificó como obsoleto: se endureció una conducta existente. Las firmas
de todos los casos negativos son válidas con un secreto ficticio para probar
que la firma sola no sustituye las comprobaciones de estructura y vigencia.
Esto no demuestra falsificación de tokens sin conocer el secreto.

Baseline JWT/invitados: 19 tests, 11 pass/8 fail; después 19/19. Grupo relacionado
sesión/Realtime/login/JWT: 37/37, sin skips. El signer de invitados y sus claims
siguen funcionando. Reloj fijo cubre límites exp/nbf; no se usaron sesiones
reales ni credenciales de una instalación.

El [contrato JWT de Supabase](https://supabase.com/docs/guides/auth/jwts)
describe algoritmo y expiración. El SDK getClaims se orienta a tokens de Auth;
Runly también genera JWTs de invitados, por lo que una migración de verificador
requiere revisar ambos flujos. Aquí se endureció el verificador existente sin
nueva biblioteca o implementación de firma.

## Lo que este parche no cierra

authMiddleware conserva el fallback getUser y su caché. Un rechazo local no
equivale a rechazo de toda solicitud: puede haber una identidad ya cacheada o
una verificación remota válida con otro algoritmo. No se verificaron esas rutas
por HTTP contra una instancia real ni se alteraron sus decisiones.

| Frente | Evidencia de source | Siguiente criterio de cierre |
|---|---|---|
| Identidad de caché | Cache key usa los últimos 32 caracteres del token, sin revalidación en un hit | Clave derivada de todo el token; dos entradas con el mismo sufijo no comparten autenticación. Test del middleware con getUser/cache simulados y solicitudes Hono |
| TTL del fallback | getUser exitoso almacena userId durante TTL.USER_CONTEXT; no lo limita explícitamente a exp | Clamp conservador a vigencia conocida y configuración; tokens próximos a vencer no mantienen identidad después del límite. Reloj controlado; no autorizar por claims sin verificar |
| Issuer/audience | Verificador local no comprueba iss/aud | Inventario de emisores/algoritmos y tokens de usuario/invitado; configuración por instalación y fixtures. No imponer valores de nube a self-hosted |
| Principal/claims | El middleware toma sub truthy de payload válido; el helper devuelve claims sin inferir permisos | Definir tipo/uso de sub y separar usuario de token Realtime de invitado; conservar restricciones de perfiles/empresas existentes |
| Revocación | Firma local y caché no consultan auth.sessions en cada operación | Política explícita para operaciones sensibles, TTL de propagación y sesión revocada; pruebas locales de fallo/negación antes de aceptación real |
| Rotación/asimétricos | Fallback remoto existe; firma local sólo HS256 | Pruebas de fallback/errores/rotación, política de caché de claves y disponibilidad antes de migrar a JWK/SDK |
| CORS | FODA registra reflexión de origen con credentials | Inventario de orígenes web/públicos/nativos y pruebas por ruta; no endurecer globalmente sin contemplar invitados y hosts |

Son hallazgos de contrato/topología, no exploits demostrados. El caso de sufijos
requiere disponer de un sufijo cacheado; no se deduce una escalada sin esa
condición. No se afirma una sesión vigente sólo porque el JWT verifica.

Supabase explica que tras cerrar sesión se pueden contrastar session_id y la
fila de auth.sessions para garantías estrictas; la firma no hace esa consulta
por sí sola. [Sesiones](https://supabase.com/docs/guides/auth/sessions).

## Siguiente scope independiente recomendado

Extraer el middleware a una factory comprobable sin importar index.js, que
arranca servidor y dependencias. Primero conservar su comportamiento con
fixtures Hono; después reemplazar el key de sufijo y limitar el TTL del fallback
con reloj fijo y pruebas de manipulación, expiración y rotación. Mantener mensajes
externos y no registrar tokens. Esto no exige adoptar ahora una política comercial
de revocación, ni consultar auth.sessions real.

Las políticas de sesiones sensibles/issuer/audience necesitan un diseño separado
con valores de configuración y compatibilidad claros. La revisión local puede
continuar sin credenciales. B2 real, CI y transporte empresarial permanecen
diferidos; no hubo despliegue, rotación, cambio de schema, RLS o base de datos.

## Verificación final

API posterior: 2376 tests, 2374 pass/2 skip/0 fail (213.38 s). Node 22.12.0,
concurrency 8, timeout 60000 ms, force-exit; mismas exclusiones del regression-ledger.
Force-exit no prueba limpieza de handles. Grupo relacionado 37/37 sin force-exit,
finaliza normalmente. El barrido shared/build anterior pertenece a dependencias,
no se presenta como repetición después de este cambio de API. Privacidad y
escaneo local de secretos se verifican al cerrar; sin aceptación de historial,
sesiones reales, algoritmo asimétrico real o revocación.
