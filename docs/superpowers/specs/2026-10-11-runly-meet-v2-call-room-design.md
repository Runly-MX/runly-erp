# Runly Meet v2 — Sala de llamada (Fases 2–6) — Design

Date: 2026-10-11
Status: In Progress
Module: `runly.chat` (calls)
Program plan: `docs/superpowers/plans/2026-10-11-runly-meet-v2-program.md`

## 1. Feature title
Rediseño de la sala de llamada: escenario adaptable, dock con texto, panel
Personas, moderación de miembros y selección de dispositivos.

## 2. Status
In Progress (sala nueva, Personas, moderación, dispositivos, ruta de audio
Android y pre-join implementados; pendientes: plantilla de grabación propia).

## 3. Context
La sala tenía 12 botones solo-icono, un pill Video/Chat en móvil que tapaba el
escenario, ninguna lista de personas (solo invitados para el anfitrión), ningún
selector de micrófono/cámara/altavoz y colores fuera de marca (violeta fijo).

## 4. Problem
La sala no escalaba a reuniones (Teams/Meet) ni a teléfonos, y el anfitrión no
podía moderar a los miembros internos.

## 5. Goals
1. Vista resuelta por dispositivo y tipo de llamada (`lib/callViewMode.js`):
   presencial, presentación, 1:1 con PiP, audio, foco y cuadrícula best-fit.
2. Controles con icono + texto (dock en escritorio, barra de 5 en teléfono +
   hoja "Más").
3. Panel lateral Mensajes | Personas (hoja inferior en tablet/teléfono).
4. Personas: sala de espera (Admitir a todos), en la llamada, aún no se unen
   (Llamar), silenciar/quitar/fijar.
5. Micrófono/cámara/altavoz elegibles y recordados.
6. Tema propio (Midnight + acento de marca de la compañía).

## 6. Non-goals
1. Fondos virtuales/desenfoque.
2. Subtítulos en vivo.

## 7. User stories
- Como anfitrión quiero ver quién falta y llamarle sin colgar.
- Como participante en el teléfono quiero silenciarme y salir sin buscar iconos.
- Como presentador no quiero ver mi pantalla en espejo infinito.

## 8. UX requirements
- Escritorio: barra superior (EN VIVO/REC + cronómetro, título, ID de reunión
  copiable, calidad de red, Auto/Foco/Cuadrícula, Invitar, minimizar); dock
  flotante agrupado; panel de 380 px.
- Teléfono vertical: barra superior compacta (minimizar, título, cronómetro e
  ID, girar cámara, invitar/personas), escenario, chip del último mensaje,
  barra de 5 (Silenciar, Cámara, Reaccionar, Más, Salir). Deslizar hacia abajo
  la barra superior minimiza. Horizontal: los controles se ocultan solos.
- Tiles: avatar con color estable, chip de nombre con barras "hablando",
  micrófono apagado, Anfitrión/Invitado, mano, señal débil, menú ⋯ (oculto en
  tiles pequeñas táctiles), doble clic/toque para fijar.
- Presentación: zoom con pellizco/rueda+Ctrl/doble toque, pestañas si hay varias
  pantallas, cámara del presentador flotante, "Estás presentando" atenuado.
- "Salir" deja la reunión en curso; "Finalizar para todos" (anfitrión) con
  confirmación. Atajos Ctrl/⌘ D, E, Shift H/C/P.

## 9. Routes/screens
Overlay de llamada (`CallRoom` / `CallRoomLayout`) sobre `/app/*`.

## 10. Data model
`CallParticipantStatus` suma `REMOVED`.

## 11. Prisma impact
`20261017030000_call_participant_removed` (`ALTER TYPE ... ADD VALUE 'REMOVED'`).

## 12. API contract
- `POST /calls/:callId/participants/:profileId/mute` — anfitrión (o
  `channel.manage`); silencia el micrófono en LiveKit (no puede reactivarlo).
- `POST /calls/:callId/participants/:profileId/remove` — marca `REMOVED`, corta
  cámara y `screen:` en LiveKit; no aplica al iniciador; `joinCall` responde 403.
- `POST /calls/:id/leave`: una llamada directa termina al colgar cualquiera; un
  grupo/reunión sigue mientras quede alguien (antes terminaba al salir el
  anfitrión). `end` sigue siendo "Finalizar para todos".
- `GET /calls/:callId/guests` incluye `livekitIdentity`.
- Miembros de conversación incluyen `isBot` (MirAI no se lista como persona).

## 13. SDK contract
`runly.calls.muteParticipant(callId, profileId, token)`,
`runly.calls.removeParticipant(callId, profileId, token)`.

## 13b. Native bridge (Android)
- Capability `audio-route`; comandos Tauri `host_audio_routes` y
  `host_audio_route_set` (`earpiece|speaker|wired|bluetooth`) sobre
  `ScreenSharePlugin.audioRoutes/setAudioRoute` + `AudioRoute.kt`
  (API 31+ `setCommunicationDevice`; anteriores speakerphone/SCO).
- JS: `native.audioRoute.list()/set(id)`; `useAudioRoute` refresca cada 5 s.
- Pre-join: `PreJoinPreview` (vista previa, medidor, toggles, selección de
  dispositivos) en el banner "Unirse" (miembros) y en la entrada del invitado.

## 14–18. Validator / Manifest / Navigation / Blueprint / RBAC
Sin cambios; moderación usa el gate existente `assertCanManageCall`.

## 19. Multi-company behavior
Sin cambios: todo se resuelve dentro de la conversación de la llamada.

## 20–22. Files / Export / Audit
Ninguno.

## 23. Edge cases
1. Pantalla compartida nativa Android (`screen:<id>`) propia se trata como
   local (no se muestra en espejo).
2. Grabación iniciada por otro: aviso único de consentimiento.
3. La esquina de menú rápido táctil se oculta durante la llamada a pantalla
   completa (tapaba "Salir").

## 24. Risks
1. Más trabajo de render por segundo (cronómetro): mitigado con memo de roster y
   callbacks estables.

## 25. Acceptance criteria
1. Dado 1:1 con video, la vista es PiP; con 4 personas, cuadrícula 2×2.
2. Dado un invitado presentando, el anfitrión ve la pantalla con zoom y tira.
3. Dado un miembro quitado, no puede volver a entrar a esa llamada.

## 26. Verification plan
`node --test` (calls, chat, `calls/lib`), `pnpm lint`, `pnpm build:web`,
`.e2e/ui-callroom.mjs desktop|mobile|tablet|landscape N` (anfitrión + N invitados
con medios simulados, capturas en `.e2e/shots/call-*`).
Verified: 2026-10-11 (648/648 tests; escritorio: 1:1 PiP, cuadrícula 2×2,
Personas, Foco, menú de micrófono/altavoz, presentación; móvil: cuadrícula que
llena, hoja Más, presentación con tira; tablet: dock + barra superior).

## 27. Rollback plan
Revertir el commit; la migración solo agrega un valor de enum (inocuo).

## 28. Future enhancements
Plantilla de grabación Runly. Verificación manual pendiente en el APK de la ruta
de audio (no hay emulador en este entorno; `cargo check` de escritorio pasa).
