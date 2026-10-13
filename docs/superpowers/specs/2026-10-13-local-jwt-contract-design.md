# Contrato del verificador JWT local

Date: 2026-10-13
Status: Complete (local verification)
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md, Task 6.

## 1. Feature title

Validar estructura, algoritmo y vigencia en verifySupabaseJwt.

## 2. Status

Continuación local autorizada del bloque de autenticación. Sin usar cuentas, claves o servicios reales.

## 3. Context

El graph identifica authMiddleware y tests de JWT/invitados como consumidores. La función verifica HMAC pero ignora el header y sólo comprueba exp cuando es truthy. Existe un test que acepta explícitamente ausencia de exp; se cambia ese contrato deliberadamente, no como reconciliación de un test obsoleto.

## 4. Problem

Tokens correctamente firmados pueden omitir exp, usar un tipo incorrecto o declarar otro algoritmo y todavía ser aceptados localmente. nbf se ignora. Esto no prueba que alguien sin el secreto pueda falsificar una firma.

## 5. Goals

1. Rechazar formato/header/payload inválido y algoritmos distintos de HS256 en este verificador local.
2. Exigir exp numérico finito y validar nbf opcional con la tolerancia existente de 10 segundos.
3. Preservar tokens legítimos HS256, claims devueltos y tokens de invitados generados por Runly.

## 6. Non-goals

No cambios de login, caché auth, issuer/audience, sesiones revocadas, CORS, claves, algoritmo de firma, schema, RLS, endpoints, SDK o despliegue. Verificar firma local no acredita que la sesión siga vigente. El fallback existente continúa manejando algoritmos asimétricos/rotación.

## 7. User stories

Como mantenedor quiero que una firma HMAC válida no evite comprobar formato y vigencia del token.

## 8. UX requirements

Sin UI. Mantener la tolerancia PWA de 10 segundos y los mensajes externos actuales del middleware.

## 9. Routes/screens

N/A: no nuevas rutas.

## 10. Data model

N/A: sin modelos nuevos o modificados.

## 11. Prisma impact

N/A: sin consulta/migración o modificación de auth.sessions.

## 12. API contract

Sin endpoints nuevos. verifySupabaseJwt(token, secret) conserva payload/null. El middleware decide fallback/401 como antes. Un rechazo local no afirma rechazo de todas las rutas/fallbacks o cachés.

## 13. Service contract

Token compacto con tres segmentos base64url no vacíos; header/payload objetos no array. Header alg exactamente HS256; rechazar critical headers no soportados y declaraciones de payload no codificado. Verificar firma HMAC existente en tiempo constante. Exigir exp de tipo number finito; rechazar exp + 10 <= ahora. Si nbf está presente, exigir number finito y nbf <= ahora + 10. Retornar claims sin usar user_metadata para autorización.

## 14. SDK impact

N/A: no cambios de SDK o frontend.

## 15. Module manifest

N/A: no módulo RME3 nuevo o modificado.

## 16. Views/pages

N/A.

## 17. Navigation

N/A.

## 18. RBAC/permissions

Sin cambios. No agregar decisiones de autorización basadas en metadata editable. Claims issuer/audience y principal invitado requieren diseño separado antes de imponer una política global.

## 19. Multi-company behavior

Sin cambios. El contrato no acepta aislamiento empresarial real por unit tests.

## 20. Files/storage impact

Sólo source/test/docs. Secretos de prueba constantes ficticios; logs en temporal local, sin credenciales reales.

## 21. Export/import requirements

Mantener exports y signHs256Jwt existentes; no incorporar biblioteca crypto nueva ni reimplementar el algoritmo. Una migración a SDK/JWT library requiere contemplar JWTs locales de invitados que no provienen de Supabase Auth.

## 22. Audit log requirements

Documentar baseline negativa, contrato cambiado y pruebas de compatibilidad. No imprimir JWTs o claves reales; errores de formato devuelven null.

## 23. Edge cases

Header sin alg/alg distinto/malformado, arrays/strings como payload, exp ausente/null/string/no finito, expiración y nbf en límites de leeway, nbf de tipo incorrecto, firma manipulada y segmentos inválidos. typ no es obligatorio. NumericDate fraccional finito permanece admitido; no se fija duración máxima comercial.

## 24. Risks

Rechazar tokens sin exp es un endurecimiento intencional: Supabase y el signer de invitados incluyen expiración. No imponer iss/aud/session_id aquí porque el signer local no declara todos los claims de una sesión Supabase. Caché por sufijo del token y TTL de fallback quedan abiertos; este cambio no basta para cerrar la autenticación completa.

## 25. Acceptance criteria

1. Nuevos tests fallan en el baseline por los defectos de claims/header.
2. Todos los tests JWT/invitados/PWA relacionados pasan después, con reloj controlado y sin servicios reales.
3. Tolerancia y signer legítimo conservados; ninguna dependencia modificada.
4. Regresión API y privacidad/secrets pasan; decisiones de revocación/caché documentadas como abiertas.

## 26. Verification plan

node:test del verificador e invitados; tokens sintéticos firmados con helper independiente y reloj fijo. Contrastar SDK/Supabase docs actuales; no query o sesión de producción. API acotada después del cambio, whitespace, privacidad y secrets.

## 27. Rollback plan

Revertir el commit local; reaparecen los contratos permisivos anteriores. Sin datos modificados.

## 28. Future enhancements

Extraer/revisar middleware y caché: clave de token completa, expiración en fallback y límites de revocación. Diseñar issuer/audience con configuración por instalación, sesiones sensibles y separación de invitados; validar algoritmos asimétricos con SDK/JWK compatible. Readiness/MirAI siguen pendientes.

Sources consulted: [JWTs](https://supabase.com/docs/guides/auth/jwts), [sesiones](https://supabase.com/docs/guides/auth/sessions), [changelog](https://supabase.com/changelog). El índice Markdown se leyó mediante fetch directo después de que web rechazara text/markdown. No breaking change detectado que sustituya este contrato HS256 local; no cambio TLS/gateway/issuer en este scope.

Verified: 2026-10-13, implementation c11cefe3. JWT/invitados 19/19; grupo relacionado 37/37; API 2374 pass/2 skip/0 fail. Límites y siguiente scope en authentication-review.md.
