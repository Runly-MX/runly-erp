# Verificación HTTP aislada de la caché de autenticación

Date: 2026-10-13
Extraction: 5f27efce.
Hardening: e08c07aa.
Spec/plan: 2026-10-13-auth-cache-contract-design.md / 2026-10-13-auth-cache-contract.md.

## Cambios

authMiddleware se extrajo de index.js a createAuthMiddleware con dependencias
inyectadas. Index conserva la instancia, cliente Supabase, cache get/set,
TTL.USER_CONTEXT y usos posteriores; no arranca otro servidor. La extracción
se commiteó antes de cambiar su comportamiento, con seis fixtures HTTP positivos
y JWT/invitados, 25/25.

La corrección usa SHA256 del token completo con prefix auth:token:. Así un token
distinto con el mismo sufijo no reutiliza una identidad cacheada. No guarda el
texto del token en la key; userId sigue siendo el valor.

El camino local conserva el buffer de 30 segundos y cap de 300. El remoto
cachea sólo después de getUser exitoso y limita TTL por exp, buffer y el máximo
configurado existente. Si exp es desconocido, de tipo incorrecto, no finito o
el token no decodifica, no crea caché. La autoridad remota sigue decidiendo la
identidad de esa solicitud; leer exp no autoriza ni toma sub/roles/metadata.

## Fallos reproducidos y compatibilidad

Sobre la factory original: 12 tests, 7 pass/5 fail. Cuatro conductas inseguras y
la nueva forma de key fallan antes; después middleware 12/12 y grupo completo
sesión/Realtime/login/JWT/invitados/middleware 49/49, sin skips o force-exit.

| Caso | Baseline | Corregido |
|---|---|---|
| Token válido seguido de payload manipulado conservando firma/sufijo | Segunda solicitud obtiene identidad cacheada sin verificar su firma inválida | Segunda solicitud delega verificación y recibe 401 del stub de autoridad |
| Fallback validado con 40 s de vigencia; autoridad rechaza después de 41 s | Hit de caché de 300 s conserva 200 | Caché dura 10 s; revalidación rechazada devuelve 401 |
| Fallback dentro del buffer de expiración | Se cachea por 300 s | Cada solicitud vuelve a autoridad; ninguna entrada |
| Fallback con expiración ausente/string/null/token opaco ficticio | Se cachea identidad por TTL fijo | Autoridad sigue respondiendo; ninguna entrada cacheada |
| Token local/hit, remoto largo, secret ausente, rechazo, casi expirado | Contratos positivos pasan | Contratos conservados |
| TTL remoto configurado de 20 s | Respeta máximo configurado | Respeta máximo y revalida al agotar TTL |

Los fixtures usan Hono app.request, reloj fijo y cache Map con vencimiento.
getUser es un stub explícito: sólo los tokens registrados se aceptan. No se
presenta como verificación RSA, sesión Supabase real o prueba del proveedor.
El caso de sufijo requiere conocer un sufijo cacheado; no se afirma explotación
remota sin esa condición. Los tokens modificados y secretos son ficticios.

## Límites y próximos scopes

- Hits de caché siguen evitando verificación completa durante su TTL seguro.
  Esto no garantiza logout/revocación inmediata ni detecta borrado de una sesión
  antes de que expire la entrada.
- getUser verifica identidad en el fixture por contrato; no se demuestra que
  comprobarlo equivalga a consultar auth.sessions para cada operación sensible.
- Issuer/audience, tipo de sub y separación de token invitado, rotación/JWK,
  revocación sensible y CORS siguen en authentication-review.md.
- No cambios de permisos, caché de tenant context, empresas, tokens de clientes,
  dependencies, schema, claves, sesiones o configuración real.
- Tokens cortos o de vigencia desconocida pueden requerir más verificaciones
  remotas. No se midió latencia del proveedor; se preservan los hits legítimos.

## Verificación final

API posterior: 2388 tests, 2386 pass/2 skip/0 fail (208.47 s). Node 22.12.0,
timeout 60000 ms, concurrency 8 y force-exit, globs/exclusiones del regression-ledger.
Las pruebas dirigidas terminan sin force-exit; el barrido no prueba limpieza de
todos los handles. Syntax, privacidad y secrets se verifican al cerrar; un
snapshot sin hallazgos no prueba limpieza histórica. No publicación, deployment
o acceso a cuenta/base real. CI, B2 real y transporte permanecen diferidos.
