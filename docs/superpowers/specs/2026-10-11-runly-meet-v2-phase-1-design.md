# Runly Meet v2 — Fase 1: correcciones funcionales — Design

Date: 2026-10-11
Status: In Progress
Module: `runly.chat` (calls + channels), `runly.projects` (channel entry point)
Program plan: `docs/superpowers/plans/2026-10-11-runly-meet-v2-program.md`

## 1. Feature title
Runly Meet v2, Fase 1: N canales por registro vinculado, acceso a reuniones con
ID + PIN, reunión sin timbre y "Grabar reunión presencial".

## 2. Status
In Progress (1A implementado y verificado; 1B y 1C pendientes).

## 3. Context
Auditoría del 2026-10-11 sobre chat y videollamadas (LiveKit + Supabase Realtime).

## 4. Problem
1. `POST /chat/channels` con `linkedEntityId` ya vinculado devolvía el canal
   existente con 201 (idempotencia del plan de conectores): un canal privado
   nuevo nunca se creaba y "no aparecía". `GET /chat/channels/linked` exponía
   canales privados de cualquier compañía.
2. El "código" de la reunión no es una contraseña: es un alias del enlace y
   todos los invitados caen en la sala de espera.
3. No se puede iniciar una reunión sin que suene el timbre a todos los miembros
   ni grabar una reunión presencial.

## 5. Goals
1. Un registro (proyecto) puede tener varios canales; uno es "principal".
2. El creador siempre ve el canal que crea (público o privado).
3. `GET /chat/channels/linked` solo lista canales de la compañía activa que el
   usuario puede ver (públicos o de los que es miembro).
4. Acceso de invitados con tres modos: Sala de espera, Con PIN, Libre.
5. Reunión sin timbre (`ring:false`) y modo "Presencial / Grabar" con
   grabación y transcripción automáticas.

## 6. Non-goals
1. Rediseño visual de la llamada (Fases 2-5).
2. Selección de dispositivos (Fase 6).

## 7. User stories
- Como líder de proyecto quiero crear varios canales (general, bugs, diseño)
  para el mismo proyecto.
- Como anfitrión quiero dar un PIN a los externos para que entren sin que yo
  los admita uno por uno.
- Como usuario quiero iniciar una reunión sin hacer sonar a todo el canal y
  grabar una reunión presencial desde mi teléfono.

## 8. UX requirements
- Proyecto: 0 canales -> botón "Crear canal"; 1+ -> menú "Canal"/"Canales (n)"
  con la lista (estrella en el principal) y "Nuevo canal".
- Configuración del canal: interruptor "Canal principal del proyecto".
- Crear canal: texto de ayuda "Un proyecto puede tener varios canales."

## 9. Routes/screens
`/app/m/runly.projects` (header y menú overflow), `/app/m/runly.chat/chat/*`
(CreateChannelModal, ChannelGeneralTab), `/p/call/:token` (gate de invitado).

## 10. Data model
- `chat_conversations.metadata.linkPrimary` (boolean, opcional).
- `CallLink.access_mode` (`LOBBY|PIN|OPEN`) y `CallLink.pin` (1B).

## 11. Prisma impact
- `20261017000000_chat_channel_links_multi`: elimina el índice único
  `chat_conversations_linked_entity_unique`, crea índice no único
  `(company_id, linked_module, linked_entity_id)` sin borrados, normaliza
  `atlas.projects` -> `runly.projects`.
- 1B: migración nueva para `CallLink`.

## 12. API contract
- `POST /chat/channels`: ya no deduplica por vínculo; slug repetido -> 409.
- `GET /chat/channels/linked?module&entityId` ->
  `{ data: primary|null, channels: [{id,title,slug,is_public,avatar_emoji,avatar_file_id,created_at,link_primary,is_member}], primaryId }`.
- `PATCH /chat/conversations/:id` acepta `linkPrimary: boolean`
  (requiere `channel.manage`).

## 13. SDK contract
`runly.chat.getLinkedChannel(module, entityId, token)`: misma firma, respuesta
ampliada (ver 12).

## 14. Validator contract
`chatUpdateConversationSchema.linkPrimary: z.boolean().optional()`.

## 15-17. Manifest / Navigation / Blueprint impact
Ninguno.

## 18. RBAC/permissions
Sin claves nuevas. `linkPrimary` usa `channel.manage` del canal.

## 19. Multi-company behavior
`listByLink` filtra por `company_id` activo y por visibilidad (público o
miembro activo). Cierra la fuga entre tenants del endpoint anterior.

## 20-22. Files / Export / Audit
Ninguno en 1A.

## 23. Edge cases
1. Sin compañía activa -> `{ data:null, channels:[], primaryId:null }`.
2. Canal principal privado del que no soy miembro -> el principal visible es el
   más antiguo de los visibles.
3. Desvincular un canal borra su `linkPrimary`.
4. Enlaces antiguos con clave `atlas.projects` se normalizan en la migración.

## 24. Risks
1. Clientes viejos que asumían un canal por proyecto: `data` sigue siendo un
   canal (el principal), compatible hacia atrás.

## 25. Acceptance criteria
1. Dado un proyecto con un canal, cuando creo otro canal privado vinculado,
   entonces se crea, soy owner y aparece en mi lista de conversaciones.
2. Dado un canal privado ajeno vinculado, cuando consulto `/channels/linked`,
   entonces no aparece.
3. Dado un slug repetido, cuando creo el canal, entonces recibo 409.

## 26. Verification plan
`node --test apps/api/src/routes/chat/__tests__/*.test.js`; `.e2e/chat-links-e2e.mjs`
contra la API local (compañía de pruebas); `pnpm lint`; `pnpm build:web`.
Verified: 2026-10-11 (1A: 383/383 tests de chat; E2E crea público+privado
vinculados, ambos listados, privado en mi lista, principal 200, slug 409).

## 27. Rollback plan
Revertir el código; la migración es compatible (recrear el índice único solo
si no existen duplicados).

## 28. Future enhancements
Pestaña "Canales" dentro del detalle del proyecto.
