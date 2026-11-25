# Matriz de proveedores y servicios globales (preflight de F3.2)

Fecha: 2026-11-24. Fuente: `apps/desktop/src/app/AppEntry.jsx`, `AuthenticatedShell.jsx` y los proveedores citados. Tamaños de chunk (gzip) del build limpio `ca2d41e21`+, sin `.env`.

## 1. Árbol actual

```
ErrorBoundary > App
  BootLoaderOverlay                       (estático, ligero)
  PersistQueryClientProvider              (estático; sin rehidratar datos autenticados)
    TooltipProvider
      BrowserRouter
        AuthProvider                      (estático, necesario antes del login)
          OfficeProvider                  (estático)
            ImageEditingProvider          (estático, importa AvatarCropDialog)
              ViewerSharingProvider       (estático, importa FileSharingDialog)
                BugReportHost             (estático, importa BugReportDialog)
                  ErrorBoundary > Routes
                    /app  -> AuthenticatedShell (lazy tras F3.2)
                               ActiveCompanyProvider > ActiveCompanyGate
                                 RealtimeProvider
                                   CallsProvider
                                     RunlyApp
```

## 2. Inventario

| Proveedor | Responsabilidad | Cuándo se inicializa | ¿Necesario antes del login? | Coste (gzip) | Efectos y suscripciones | Veredicto |
|---|---|---|---|---|---|---|
| `AuthProvider` | Sesión Supabase, perfil (`/user/me`), cierre forzado, cambio de identidad | Montaje de la app | **Sí** (decide login o shell) | 34.7 KB (+ `supabase-vendor` 49 KB) | `onAuthStateChange`, `getSession`, peticiones de perfil (deduplicadas en vuelo) | Mantener estático |
| `PersistQueryClientProvider` / `QueryClient` | Caché de servidor; persistencia sin datos autenticados | Montaje | Sí (login usa `/instance/status`) | en `state-vendor` 29 KB | Persistidor Dexie | Mantener |
| `TooltipProvider`, `BrowserRouter` | UI base y rutas | Montaje | Sí | `react-vendor` | ninguna | Mantener |
| `OfficeProvider` | Contexto de acciones del editor de Office (24 líneas) | Montaje | No | despreciable | ninguna | Candidato a diferir **solo con cuidado**: lo consumen pantallas de archivos y notas; su coste es mínimo, el beneficio de diferirlo es casi nulo |
| `ImageEditingProvider` | Abre el recorte de avatar desde cualquier pantalla | Montaje | No | `AvatarCropDialog` ~3 KB | estado local | Diferir el diálogo (carga bajo demanda al abrirlo); mantener el contexto |
| `ViewerSharingProvider` | Diálogo de compartir desde el visor | Montaje | No | ~1.6 KB + `FileSharingDialog` 3 KB | estado local | Igual: contexto estático, diálogo bajo demanda |
| `BugReportHost` | Atiende solicitudes de «Reportar bug» incluso si la pantalla se rompe | Montaje | No, pero **debe sobrevivir a errores de render** | ~2 KB | listener global | Mantener el host estático; el diálogo puede cargar bajo demanda |
| `ActiveCompanyProvider` / `Gate` | Empresa activa, membresías, cambio de empresa | Tras el login (lazy) | No | 2.5 KB | consultas de membresía | Ya diferido |
| `RealtimeProvider` | Canal de eventos, presencia, invalidación de consultas | Tras el login (lazy) | No | 3.9 KB | WebSocket, latidos, invalidaciones | Ya diferido; es global y necesario tras el login |
| `CallsProvider` | **Recepción de llamadas entrantes**, tono, estado de llamada | Tras el login (lazy) | No | 13.3 KB (LiveKit se carga aparte, bajo demanda) | suscripción a eventos de llamada, sonidos | Ya diferido; **no se debe retrasar más**: sin él no suena una llamada entrante |

## 3. Qué se puede diferir sin perder capacidades globales

Quedan en la ruta del login ~10 KB gzip entre `ImageEditingProvider`, `ViewerSharingProvider`, `BugReportHost` y sus diálogos: el beneficio de diferirlos es del orden de 5-10 KB y toca el código de error global. **No se justifica** como intervención propia ahora. Los contribuyentes reales de la ruta crítica de 606 KB son otros (§4).

## 4. Contribuyentes restantes del JavaScript crítico del login (606 KB, 126 archivos)

| Contribuyente | KB gzip | Necesario para el login | Posible siguiente paso |
|---|---|---|---|
| `react-vendor` (React DOM, React Router, scheduler) | 127 | Sí | Poco margen; el router completo podría partirse en rutas públicas y autenticadas |
| `ui-vendor` (Radix, Sonner, etc.) | 92 | En parte | Revisar qué primitivos usa el login |
| `supabase-vendor` | 49 | Solo `auth` | Importar `@supabase/auth-js` en lugar del cliente completo (postgrest, realtime, storage) |
| `src` (barrel de `@runly/ui`) | 41 + 27 | En parte | Subpath `@runly/ui/auth-light` con los campos del login |
| `proxy` (framer-motion) | 39 | No (atmósfera animada del login) | Cargar la animación bajo demanda o usar CSS |
| `AppEntry` | 38 | Sí | Ya recortado |
| `AuthProvider` | 34 | Sí | — |
| `state-vendor` (React Query, Zustand) | 29 | Sí | — |
| ~100 archivos pequeños | ~130 | Mixto | Revisar cadenas de imports |

Sumando los puntos «posible siguiente paso» (supabase parcial, framer-motion diferido, barrel ligero) el orden de magnitud recuperable es 100-130 KB, lo que dejaría el JS crítico alrededor de 480-510 KB: **llegar al presupuesto de 500 KB es plausible pero no está demostrado**.
