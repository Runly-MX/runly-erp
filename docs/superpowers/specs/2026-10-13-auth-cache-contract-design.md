# Identidad y vigencia de la caché de autenticación

Date: 2026-10-13
Status: Complete (local verification)
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md, Task 6.

## 1. Feature title

Extraer el middleware y corregir key/TTL de autenticación.

## 2. Status

Continuación autorizada de la revisión local de autenticación; no requiere un proveedor real o decisión de duración de sesiones.

## 3. Context

authMiddleware vive en index.js, que inicia servidor al importarse. Su key usa token.slice(-32); el camino remoto cachea por TTL.USER_CONTEXT (300 segundos) sin clamp de expiración. El camino local ya usa buffer de 30 segundos y cap de 300. Ver authentication-review.md.

## 4. Problem

Entradas distintas con el mismo sufijo pueden reutilizar una identidad cacheada sin nueva verificación. Un token validado remotamente cercano al vencimiento puede permanecer cacheado después de exp. No se afirma robo de un sufijo real ni escalada sin esa condición.

## 5. Goals

1. Factory comprobable por solicitudes Hono sin iniciar servidor/DB.
2. Key con SHA256 de todo el token, preservando prefix auth:token:.
3. Caché remota limitada por expiración conocida y TTL configurado; sin caché cuando no se conoce vigencia segura.
4. Preservar identidad verificada, local HS256, fallback, mensajes externos y cache hits legítimos.

## 6. Non-goals

No issuer/audience/principal policy, revocación inmediata, auth.sessions, permisos, empresas, CORS, single-flight, JWT library, SDK, CI o deployment. No nueva duración de sesión comercial.

## 7. User stories

Como mantenedor quiero que una identidad cacheada corresponda a un token completo previamente verificado y que no sobreviva a su vigencia conocida.

## 8. UX requirements

Conservar mensajes 401 existentes y comportamiento normal de PWA/nativo/invitados. El último tramo de un token cercano a exp puede requerir verificación adicional en el camino remoto; no autorizarlo sólo por una caché demasiado larga.

## 9. Routes/screens

N/A: no ruta nueva. Fixtures Hono sólo de test.

## 10. Data model

N/A: sólo caché in-process existente, valores userId.

## 11. Prisma impact

N/A: sin consulta, schema o migración.

## 12. API contract

createAuthMiddleware({ supabaseAdmin, cacheGet, cacheSet, userContextTtlSeconds, getJwtSecret?, warn? }) devuelve middleware Hono. Const authMiddleware conserva su uso en index.js. userContextTtlSeconds recibe TTL.USER_CONTEXT actual. No HTTP nuevo ni import de index.js en tests.

## 13. Service contract

Primero extraer sin cambiar comportamiento y probar fixtures. Después key auth:token: + sha256(token). Camino local conserva min(exp - floor(ahora) - 30, 300). Tras getUser exitoso, parsear únicamente exp para acortar caché, nunca para decidir identidad: min(exp - floor(ahora) - 30, userContextTtlSeconds); cachear sólo TTL positivo finito. Si exp es ausente/inválido o token no decodifica, no cachear, pero conservar la respuesta autoritativa getUser para esa solicitud. getUser rechazado mantiene 401.

## 14. SDK impact

N/A: conservar cliente Supabase y fallback actuales. No implementar verificación RSA en el fixture; el stub de autoridad remota es explícito.

## 15. Module manifest

N/A.

## 16. Views/pages

N/A.

## 17. Navigation

N/A.

## 18. RBAC/permissions

Sin cambios. Sólo c.set(authUserId, identidad verificada). Claims no verificados no autorizan y no se usan user_metadata/roles para conceder permisos.

## 19. Multi-company behavior

Sin cambios de tenant context, company headers o cache de permisos.

## 20. Files/storage impact

Nueva factory y tests locales. No guardar tokens ni keys reales. Prefix de caché conservado; reiniciar proceso ya pierde toda caché, no requiere migrar entradas.

## 21. Export/import requirements

index.js importa factory en lugar de verificador y sustituye sólo su bloque middleware por la instancia configurada. Es una extracción que reduce el archivo grande, no un refactor global.

## 22. Audit log requirements

Preservar diagnóstico de rechazo existente sin imprimir token. Tests usan valores ficticios; errores/payloads privados no se copian a tracked docs.

## 23. Edge cases

Sin Bearer; secret ausente/rotado; getUser rechazado; token local válido/casi expirado; hit repetido; token manipulado conservando sufijo; remoto próximo a exp; exp desconocido/tipo incorrecto; TTL configurado menor que vida del token. Reloj simulado y caché con expiración real en el fixture.

## 24. Risks

No confundir parseo de exp con verificación: sólo acorta una caché después de autoridad remota. Cualquier exp inválido evita caché. No convertir red caída en autenticación válida. Mantener mensajes, callback y routing; const se inicializa antes de todos sus usos. Sesiones revocadas pueden seguir dentro de JWT/cache válida: política separada.

## 25. Acceptance criteria

1. Extracción inicial conserva contratos positivos y se commitea separada.
2. Nuevos casos sufijo/TTL reproducen fallos sobre factory sin corregir.
3. Corregido no reutiliza identidad para token distinto y revalida después del TTL seguro.
4. JWT/invitados/sesión y API pasan; sin dependencias o conexión real nueva.

## 26. Verification plan

node:test + Hono request + getUser/cache ficticios; fechas fijas, contador de llamadas y usuario visible tras middleware. node --check, fixtures relacionados y regresión API acotada, privacidad/secrets/whitespace. Liveness del servidor real/revocación no aceptados por estos fixtures.

## 27. Rollback plan

Revertir hardening o extracción por commit y reiniciar desde código previo. Sin cambios de datos; reaparecen riesgos previos.

## 28. Future enhancements

Issuer/audience, tipo de sub/separación invitado, revocación sensible, rotación/JWK y CORS con scopes propios. Readiness y recuperación MirAI pendientes. CI/B2/transporte continúan diferidos.

Verified: 2026-10-13, extracción 5f27efce, hardening e08c07aa. Middleware 12/12, grupo relacionado 49/49; API 2386 pass/2 skip/0 fail. Sin dependencias o sesiones reales.
