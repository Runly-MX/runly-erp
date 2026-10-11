# Runly Meet v2: completar y rediseñar videollamadas + chat

## Contexto

El chat y las videollamadas (LiveKit SFU + Supabase Realtime) funcionan, pero tienen huecos funcionales y una UI que ya no escala:

- **Bug de canal privado "invisible".** `POST /chat/channels` con `linkedEntityId` de un proyecto que ya tiene canal no crea nada. Devuelve el canal existente ("Bugs") con 201, por la idempotencia de `chat-conversations-write-service.js:77-82`. El canal privado nunca se inserta.
  - Además, `GET /chat/channels/linked` filtra metadata de canales privados entre tenants: no revisa membresía ni compañía.
  - Hay deriva de clave de módulo (`atlas.projects` vs `runly.projects`).
  - El índice único no excluye soft-deletes, lo que provoca 500.
- **El "código de acceso" no es una contraseña.** `CallLink.code` solo es una alternativa al token del enlace. Todo invitado cae en la sala de espera (`requireLobby` por defecto). No existe un PIN real.
- **No se puede iniciar una reunión sin que suene el timbre.** `createCall` pone en RINGING a todos los miembros. Iniciar solo exige un `CallLink` (workaround) y la sala se cierra sola a los 5 min si nadie entra. No hay modo para grabar una reunión presencial.
- **La barra de controles está saturada.** Tiene 12 botones solo-icono que hacen wrap en el móvil.
- **No hay roster de la llamada.** Solo existe `CallGuestSheet`, que lista a los invitados externos y solo lo ve el anfitrión.
- **No hay selector de micrófono, cámara ni salida de audio.** Solo existe el flip frontal/trasera.
- **Los layouts móviles son pobres.** El pill Video/Chat reemplaza el escenario. La vista de pantalla compartida y la grabación usan la plantilla `grid-dark` genérica de LiveKit. La UI de llamada usa violeta, que no es de la marca.
- **Los gestos del chat se sienten bruscos.** Son Pointer Events hechos a mano, con umbrales y sin física de resorte. `motion` está instalado pero no se usa en el chat.

**Decisiones tomadas con el usuario:**

1. Se permiten **varios canales por proyecto**, con uno marcado como "principal".
2. El acceso funciona así:
   - El código actual pasa a llamarse **"ID de reunión"**.
   - Hay 3 modos de acceso: **Sala de espera / Con PIN / Libre**.
   - En modo PIN, quien escribe el PIN correcto entra directo. Quien no lo escribe cae en la sala de espera.

**Resultado buscado:** una experiencia tipo Teams/Meet propia de Runly, que funcione igual de bien en escritorio, en el navegador móvil y en el APK de Android.

## Dirección de diseño ("Runly Meet")

Se basa en las referencias de Stitch, mejoradas y llevadas a la identidad de Runly. Lo validé contra `ui-ux-pro-max`: estilo *Soft UI Evolution* en modo oscuro inmersivo y Plus Jakarta Sans, que ya es la fuente de Runly.

- **Paleta:** el escenario usa `--runly-navy-dark` (#070d18) y las superficies Midnight/Navy en vidrio translúcido (`--glass-*`).
  - **Flame** (`--brand-primary` #fd6016): estados activos, CTA y la tile fijada. Sustituye al violeta actual.
  - **Rojo:** Salir y la grabación.
  - **Esmeralda:** quién habla, con barras de audio animadas.
  - **Ámbar:** mano levantada.
  - Nada de color fuera de tokens.
- **Tipografía:**
  - Números tabulares en el cronómetro.
  - Monoespaciada en el ID de reunión (`prd-x89-mkq`).
- **Controles:** siempre **icono + texto** (en móvil, el texto va bajo el icono).
  - Áreas táctiles de al menos 44 px y 8 px de separación.
  - Micrófono y Cámara son botones divididos con ▾ para elegir dispositivo.
  - Las acciones secundarias van en el menú "Más". Hay una sola acción primaria destructiva: Salir.
- **Movimiento:** resortes de `motion`, de 150 a 300 ms. Cada animación responde a un gesto, el gesto se puede interrumpir y se respeta `prefers-reduced-motion`.
- **Accesibilidad:**
  - `aria-label` y `aria-pressed` en los toggles.
  - Atajos de teclado (Ctrl+D micro, Ctrl+E cámara, Ctrl+Shift+H mano), visibles en los tooltips.
  - Anillos de foco visibles.
  - La grabación se anuncia con texto, no solo con color.

## Fases (cada una: spec + plan en `docs/superpowers/`, implementación, verificación y commit en `main`)

### Fase 1: Correcciones funcionales (backend + UI mínima)

**1A. N canales por proyecto + canal privado visible**

- **Migración nueva** (no se editan las existentes):
  - Eliminar `chat_conversations_linked_entity_unique`.
  - Crear un índice no único `(company_id, linked_module, linked_entity_id) WHERE deleted_at IS NULL`.
  - Hacer `UPDATE linked_module='runly.projects' WHERE linked_module='atlas.projects'`.
  - El canal principal se guarda en `metadata.linkPrimary=true`. Si ninguno lo tiene, el principal es el más antiguo.
- **`chat-conversations-write-service.js`:**
  - Quitar el bloque de dedupe (L77-82), para que el create siempre cree el canal con el creador como owner.
  - Un slug duplicado devuelve 409, no 500.
- **`chat-channel-links-service.js`:**
  - Reemplazar `findByLink` y `assertLinkAvailable` por `listByLink({companyId, profileId})`, que devuelve solo los canales públicos o aquellos de los que el usuario es miembro.
  - Agregar `setPrimary`.
- **`channel-routes.js`:**
  - `GET /channels/linked` devuelve `{ channels[], primaryId }` con el chequeo de compañía y membresía. Esto cierra la fuga entre tenants.
  - Agregar `POST /channels/:id/link-primary`.
- **SDK y UI:**
  - `packages/sdk/src/domains/chat.js` refleja el nuevo contrato.
  - `ProjectsScreen.jsx` muestra un botón según cuántos canales haya: con 0, "Crear canal"; con 1, "Ir al canal"; con N, un `DropdownMenu` con la lista y la opción "Nuevo canal".
  - `CreateChannelModal.jsx` navega al canal recién creado y elimina la rama muerta del 409.
  - `ChannelGeneralTab.jsx` permite marcar el canal como principal.
- **Tests:** actualizar `chat-service.test.js` (~L1693, el que asume la idempotencia) y `chat-channel-links-service.test.js`.

**1B. Acceso a reuniones: ID de reunión + PIN**

- **Migración en `CallLink`:**
  - Agregar `access_mode` (`LOBBY | PIN | OPEN`) y `pin` (6 dígitos, visible para el anfitrión, como el passcode de Zoom).
  - Backfill: `requireLobby=true` pasa a `LOBBY` y `false` pasa a `OPEN`.
  - `requireLobby` se mantiene derivado, por compatibilidad.
- **`call-guest-service.js` `joinAsGuest`:**
  - Acepta `pin`.
  - En modo PIN, un PIN correcto da ADMITTED (salvo que el invitado haya sido DENIED o KICKED antes). Sin PIN, va a LOBBY. Un PIN incorrecto devuelve `bad_pin` y cuenta para el rate limit existente (8 intentos / 10 min).
  - Corregir de paso `inviteToken`, que solo, sin token ni código, hoy falla con `bad_code`.
- **Endpoint público nuevo** `GET /calls/guest/link-info?token|code`: devuelve título, `accessMode`, si la llamada está en vivo y el branding. Lo usa la pantalla de entrada para mostrar el campo PIN solo cuando aplica.
- **UI:**
  - `CallShareDialog.jsx`, `CallInvitePanel.jsx` y `ChannelGeneralTab.jsx` usan un control segmentado de 3 modos.
  - El PIN se puede ver, copiar y regenerar.
  - El ID se formatea `xxx-xxxx-x`.
  - Los correos de invitación incluyen ID y PIN.
  - En `NewMeetingDialog.jsx` "Programar", se elige el modo de acceso.
  - `GuestCallScreen.jsx`: el gate pide el PIN según `link-info`.
- **Tests:** join con PIN correcto, incorrecto y ausente; backfill.

**1C. Reunión sin timbre + "Grabar reunión presencial"**

- **`createCall` (`call-service.js`)** recibe la opción `ring: false`:
  - La llamada nace ACTIVE con solo el iniciador.
  - Los miembros reciben una notificación normal "X inició una reunión · Unirse": sin ring, sin push crítico y sin 422 por estar solo.
- **`POST /calls/:id/ring { profileIds }`:** hace sonar el timbre a personas concretas desde el panel Personas, por 36 s cada una. Reutiliza la lógica de RINGING y expiración que ya existe.
- **Evento nuevo `chat.call.ring_cancelled`** por participante (contestada en otro dispositivo, cancelada por el anfitrión o la llamada terminó). Así el timbre se detiene al instante y no espera al poll de 20 s.
- **Banner "Reunión en curso · Unirse"** en `ChatWindow` cuando el canal tiene una llamada viva a la que no estoy unido.
- **`NewMeetingDialog`:**
  - Tercer modo: **"Presencial / Grabar"**. Inicia la reunión con `ring:false`, solo micrófono (cámara opcional), **arranca la grabación y la transcripción automáticamente** y desactiva el cierre de 5 min.
  - "Ahora" gana el interruptor "Llamar a los miembros (timbre)", apagado por defecto en canales con más de 2 personas.
- **`CallRoom.jsx`:** el cierre automático de 5 min de sala vacía no aplica si hay grabación activa o el modo es presencial.
- **Vista "Presencial":**
  - Cronómetro grande, forma de onda del micrófono, pill REC y botones Pausar/Terminar. Pausar equivale a detener y reanudar el egress, con varios segmentos en la misma grabación.
  - Mantiene la pantalla encendida (`useScreenWakeLock` + keep-alive nativo).
  - Al terminar, la grabación y la transcripción quedan en la conversación y, si existe, en el evento de calendario.

### Fase 2: Rediseño del escenario de escritorio + barra de controles

La lógica se queda en `CallRoom.jsx`. La presentación se divide en archivos nuevos para respetar el límite de 1000 líneas.

- `calls/layout/CallTopBar.jsx`:
  - Pill EN VIVO / REC con cronómetro y el título.
  - Chip del ID de reunión (copiar).
  - Indicador de calidad de red (`ConnectionQuality` de LiveKit).
  - Selector de diseño **Auto / Foco / Cuadrícula**.
  - Botón **Invitar**.
- `calls/lib/callLayout.js`, ampliado:
  - Algoritmo de cuadrícula "best-fit": columnas y filas según la relación de aspecto del contenedor y el número de tiles.
  - Paginación a partir de 16 tiles.
  - En Foco, el escenario es grande y la **tira de participantes va abajo** (como la referencia), plegable.
  - Se conservan `resolveSpotlightMain` y la lógica de pin y orador.
- `ParticipantTile.jsx`, rediseñado:
  - `rounded-2xl` con chip de nombre y badge "Anfitrión" / "Invitado".
  - Anillo y barras de quien habla.
  - Iconos de micrófono silenciado y de red débil, y badge de mano.
  - Menú ⋯ por tile: Fijar, Ver en grande y, para el anfitrión, Silenciar y Quitar.
  - Doble clic para fijar.
- `calls/controls/CallControlDock.jsx` reemplaza el footer de `CallRoomLayout.jsx` (L267-341). Dock agrupado con icono + texto:
  - `[Micrófono ▾] [Cámara ▾] | [Compartir] [Reaccionar] [Mano] | [Más ⋯] | [Salir]`
  - A la derecha, los toggles **Personas** (contador) y **Chat** (no leídos).
  - El menú "Más" (`DropdownMenu` de `@runly/ui`) contiene: Grabar, Transcripción, Diseño, Pantalla completa, Linterna, Configuración de dispositivos y Atajos.
  - Con un ancho estrecho, el dock pasa a etiquetas compactas bajo el icono.
- **Panel lateral unificado** `calls/panel/CallSidePanel.jsx` con pestañas **Mensajes | Personas**:
  - Reemplaza la columna de chat de 380 px y su riel.
  - Mensajes reutiliza `CallChatPanel` (el `ChatWindow embedded="call"`) y suma respuestas rápidas.

### Fase 3: Panel "Personas" (reemplaza `CallGuestSheet`)

- `calls/people/CallPeoplePanel.jsx`:
  - Búsqueda.
  - Secciones:
    - **Sala de espera:** Admitir, Rechazar y "Admitir a todos".
    - **En la llamada:** une los miembros internos (participantes LiveKit + perfil) y los invitados (`useCallGuests`), con orden por mano levantada y luego por orador.
    - **No unidos:** miembros de la conversación que no están en la llamada, con botón **Llamar** (el endpoint de ring de 1C) y "Copiar enlace".
  - Acciones de fila con `DropdownMenu`: Fijar, Silenciar y Quitar, con `ConfirmDialog` para Quitar.
  - "Agregar personas": usuarios + correos, reutilizando la lógica de `CallInvitePanel` y `sendInvites`.
- **Backend:** `POST /calls/:id/participants/:profileId/mute|remove`, solo para el anfitrión con `assertCanManageCall` y `RoomServiceClient` (`mutePublishedTrack` / `removeParticipant`). Hoy esto solo existe para invitados.
- **Presentación:**
  - Escritorio: pestaña del panel lateral.
  - Móvil: `Sheet` con dos alturas (media y completa), apoyado en el drag-to-dismiss que ya existe.
  - El badge de sala de espera vive en el toggle Personas.

### Fase 4: Pantalla compartida + grabación

- **Diseño "Presentación":**
  - La pantalla ocupa el escenario con `object-contain` y la tira se reduce.
  - La cámara de quien presenta va en PiP flotante, reutilizando `DraggablePip.jsx`.
  - Si hay varias pantallas compartidas, se elige con pestañas.
  - Quien presenta ve la barra "Estás presentando · Dejar de compartir" y una miniatura propia atenuada, para evitar el efecto espejo infinito.
- **Plantilla de grabación propia de Runly** (`customBaseUrl` de Room Composite Egress):
  - Ruta web `/egress/call` en `apps/desktop`, renderizada con `livekit-client`, con el mismo lenguaje visual.
  - Presentación: pantalla grande, cámara del presentador en una esquina y nombres.
  - Cuadrícula: best-fit con las tiles de Runly.
  - Al pie: marca de agua, nombre de la reunión y fecha.
  - **Fallback a `grid-dark`** si `LIVEKIT_EGRESS_TEMPLATE_URL` no está configurada. Se documenta en `.env.example` y en el instalador.
- **Indicador de grabación:**
  - Pill REC rojo con cronómetro y "Iniciada por X".
  - Aviso de consentimiento a quien entra con la grabación en curso, que reemplaza el `RecordingBanner` plano.
  - Al terminar: mensaje de sistema con un enlace al reproductor.

### Fase 5: Layouts móviles por tamaño y tipo de llamada

Se define una matriz de estados en `calls/lib/callViewMode.js`.

**Dimensiones:**
- Viewport: teléfono vertical, teléfono horizontal, tablet o escritorio.
- Tipo de llamada: 1:1 voz, 1:1 video, grupo de hasta 4, grupo de más de 4, presentación, presencial o minimizada.

**Teléfono vertical (según la referencia, mejorada):**
- **Header compacto:**
  - Chevron que minimiza a `MiniCallBubble`.
  - Título con cronómetro e ID.
  - Botones de cambiar cámara y de agregar persona.
- **Escenario:**
  - Carrusel de tiles con scroll-snap.
  - Chip con el último mensaje, que abre el chat en un bottom sheet sobre el escenario. Desaparece el pill `CallViewSwitcher.jsx`.
- **Barra inferior** de 5 elementos con texto: Micrófono, Cámara, Reaccionar, Más y Salir.
  - "Más" abre un sheet en cuadrícula con: Compartir, Mano, Personas, Chat, Grabar, Transcripción, Diseño, Salida de audio y Linterna.

**Otros casos:**
- **1:1 voz:** avatar grande con anillo de pulso al hablar. Sin cuadrícula.
- **Horizontal / inmersivo:**
  - Tocar el escenario oculta y muestra el chrome, que se oculta solo a los 4 s.
  - La tira va al lateral.
  - Se respetan las safe areas.
- **Gestos:**
  - Deslizar hacia abajo el header minimiza.
  - Doble toque en una tile la fija.
  - **Pinch-zoom y paneo** sobre la pantalla compartida (con `transform`), clave para leer pantallas en el teléfono.
- **Atrás de Android:**
  - Orden: cierra el sheet, luego minimiza la llamada y nunca cuelga.
  - Respeta los gestos del sistema y deja la zona de 20 px del borde libre.

### Fase 6: Dispositivos (navegador + APK)

- **Hook nuevo `calls/hooks/useMediaDevices.js`:**
  - `Room.getLocalDevices` para `audioinput`, `videoinput` y `audiooutput`.
  - Escucha `RoomEvent.MediaDevicesChanged`.
  - Cambia con `room.switchActiveDevice(kind, deviceId)`.
  - Guarda las preferencias en localStorage y las aplica al conectar (`audioCaptureDefaults` / `videoCaptureDefaults`).
  - Maneja las etiquetas vacías antes de tener permiso.
- **Salida de audio:** solo si existe `setSinkId` (Chromium de escritorio). Si no, se oculta con una explicación.
- **APK Android:**
  - `enumerateDevices` funciona en el WebView cuando ya hay permiso.
  - El enrutamiento de audio (altavoz / auricular / Bluetooth) **no está expuesto al WebView**, así que se crea el plugin Kotlin `AudioRoutePlugin.kt`:
    - API 31+: `AudioManager.setCommunicationDevice`.
    - Versiones anteriores: `setSpeakerphoneOn` / SCO.
  - Se expone como `native.audioRoute.list/set/onChange` en `apps/desktop/src/native/index.js`, con la capability `audio-route` en `src-tauri/src/mobile_host.rs`.
  - La UI muestra "Altavoz / Teléfono / Bluetooth" en lugar del selector de salida.
- **Menús ▾ de Micrófono y Cámara:** lista de dispositivos, medidor de nivel del micrófono, "Probar altavoz" y, en el teléfono, frontal/trasera + linterna.
- **Pre-join (`calls/PreJoinScreen.jsx`)**, para reuniones e invitados (no al contestar un 1:1, que debe ser inmediato):
  - Vista previa de cámara, medidor de micrófono y selectores.
  - Entrar con cámara o micrófono apagados.
  - El invitado externo (`GuestCallScreen`) usa el mismo componente.

### Fase 7: Gestos y fluidez táctil de todo el chat

- **Primitivas nuevas en `@runly/ui`** (`packages/ui/src/hooks/`), construidas sobre `motion` (ya es dependencia) y documentadas en `docs/ai-context/rme3-runtime-capabilities.md`:
  - `useEdgeSwipeBack`: el "atrás" interactivo sigue al dedo con un resorte y se decide por velocidad. Reemplaza el swipe de solo umbral de `ChatScreen.jsx` L87-106.
  - `useSpringDrag`.
  - Snap points en `Sheet` / `bottom-sheet-shared.jsx`.
- **Transición tipo stack** entre la bandeja y la conversación. Hoy se alterna con `hidden md:flex` sin animación.
- **Gestos existentes, con resorte:**
  - `useSwipeToReply` y `SwipeableRow`: retorno con resorte y háptica al cruzar el umbral (`native.haptics`).
  - `useLongPress`: feedback de escala de 0.97.
- **CSS:**
  - `touch-action: manipulation` en los controles.
  - `overscroll-behavior: contain` en la lista de mensajes.
- **Composer** consciente del teclado (`visualViewport`): se queda pegado al teclado en Android e iOS sin saltos.
- **Atrás de Android:** orden predecible: sheet, luego hilo, luego conversación, luego bandeja.

### Fase 8: Cierre de huecos

- Llamada entrante a pantalla completa en el móvil (estilo nativo, con deslizar para contestar). En escritorio sigue siendo un diálogo.
- UI de reconexión y de calidad de red.
- Resumen al terminar la reunión: duración, participantes, enlace a la grabación y a la transcripción.
- Botón "Unirse" en el evento de calendario, activo 10 min antes.
- Actualizar `docs/superpowers/specs/2026-08-30-atlas-chat-current-state.md` y el `docs/TASKS.md`.

## Archivos críticos

**Backend:**
- `apps/api/src/routes/chat/chat-conversations-write-service.js`, `chat-channel-links-service.js`, `channel-routes.js`.
- `apps/api/src/routes/calls/call-service.js` (949 líneas: lo nuevo va en un `call-ring-service.js` aparte), `call-guest-service.js`, `call-links-service.js`, `call-recording-service.js`, `guest-routes.js`, `index.js`.
- Dos migraciones nuevas en `prisma/migrations/` (vínculos de canal y acceso de `CallLink`).
- `packages/validators/src/{chat,calls}.js` y `packages/sdk/src/domains/{chat,calls}.js`.

**Frontend** (todo bajo `apps/desktop/src/modules/runly.chat/`):
- `calls/CallRoom.jsx`, `CallRoomLayout.jsx`, `ParticipantTile.jsx`, `SpotlightLayout.jsx`, `lib/callLayout.js`.
- Directorios nuevos `calls/{layout,controls,panel,people,devices}/`.
- `NewMeetingDialog.jsx`, `CallShareDialog.jsx`, `CallInvitePanel.jsx`, `guest/GuestCallScreen.jsx`.
- `components/CreateChannelModal.jsx`, `screens/ChatScreen.jsx`.
- `apps/desktop/src/modules/runly.projects/screens/ProjectsScreen.jsx`.

**`@runly/ui`:** `Sheet.jsx`, `bottom-sheet-shared.jsx`, hooks de gestos.

**Android:** `src-tauri/gen/android/.../AudioRoutePlugin.kt`, `native/index.js`, `mobile_host.rs`.

**Se reutiliza lo que ya existe:**
- `DraggablePip`, `MiniCallBubble`, `useCallGuests`, `useScreenWakeLock`, `useCallBackgroundKeepAlive`.
- `resolveSpotlightMain` / `useSpeakingOrder`, `ConfirmDialog`, `DropdownMenu`, `Sheet` con drag-to-dismiss.
- `useSwipeToReply`, `useLongPress`, `useCoarsePointer`.
- `sendInvites`, `assertCanManageCall`, el rate limit de `joinAsGuest` y `RoomServiceClient`.

## Verificación

- **Por fase:**
  - `node --test apps/api/src/routes/chat/__tests__/` y los tests de calls. Hay tests nuevos y enfocados para: create sin dedupe, `listByLink` aislado por tenant, join con PIN (correcto, incorrecto y ausente), `createCall ring:false` estando solo, y el endpoint de ring.
  - `pnpm lint` y `pnpm build:web`.
- **E2E** con los scripts `.e2e` existentes (Playwright, usuario y compañía de prueba) contra los servidores ya corriendo en 4010/5173 (no se inician ni se detienen):
  - Crear un 2.º canal privado vinculado a un proyecto: aparece en mi lista y el proyecto ofrece elegir entre los dos.
  - Reunión con PIN: un invitado con PIN entra directo y uno sin PIN cae en la sala de espera.
  - Reunión "Presencial": nadie recibe timbre y la grabación arranca sola.
  - Capturas a 375×812, 812×375, 768×1024 y 1440×900, en llamada 1:1, en grupo y presentando.
- **APK manual:** cambio de cámara, cambio altavoz/auricular/Bluetooth, pantalla compartida nativa y botón atrás.
- **Recorrido del checklist** `docs/ai-context/ui-screen-audit-checklist.md` para cada pantalla nueva.
- **Commit por bloque verificado** en `main`, sin tocar archivos de otras sesiones.
