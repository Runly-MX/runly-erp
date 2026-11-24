import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RunlyOfflineDatabase, createDexiePersister } from "@runly/offline";
import { Toaster, TooltipProvider } from "@runly/ui";
import { AuthProvider } from "../auth/AuthProvider";
import { OfficeProvider } from "../providers/OfficeProvider";
import { ImageEditingProvider } from "../providers/ImageEditingProvider";
import { ViewerSharingProvider } from "../providers/ViewerSharingProvider";
const AcceptInvitationScreen = lazy(() => import("../company/AcceptInvitationScreen.jsx").then((m) => ({ default: m.AcceptInvitationScreen })));
const SharedResourceScreen = lazy(() => import("../company/SharedResourceScreen.jsx").then((m) => ({ default: m.SharedResourceScreen })));
const McpConnectionScreen = lazy(() => import("./McpConnectionScreen.jsx").then((m) => ({ default: m.McpConnectionScreen })));
const HomeScreen = lazy(() => import("./HomeScreen").then((m) => ({ default: m.HomeScreen })));
const HelpCenterScreen = lazy(() => import("./HelpCenterScreen").then((m) => ({ default: m.HelpCenterScreen })));
const ProfileScreen = lazy(() => import("./ProfileScreen").then((m) => ({ default: m.ProfileScreen })));
const ModuleOutlet = lazy(() => import("./ModuleOutlet").then((m) => ({ default: m.ModuleOutlet })));
const GoogleCalendarCallbackScreen = lazy(() => import("./GoogleCalendarCallbackScreen").then((m) => ({ default: m.GoogleCalendarCallbackScreen })));
const NativeHostDiagnostics = lazy(() => import("../native/NativeHostDiagnostics.jsx").then((m) => ({ default: m.NativeHostDiagnostics })));
const PublicShell = lazy(() => import("../shell/PublicShell.jsx").then((m) => ({ default: m.PublicShell })));
const PublicModuleOutlet = lazy(() => import("../shell/PublicModuleOutlet.jsx").then((m) => ({ default: m.PublicModuleOutlet })));
const PublicWebsiteEntry = lazy(() => import("../shell/PublicWebsiteEntry.jsx").then((m) => ({ default: m.PublicWebsiteEntry })));
const PublicClientLogin = lazy(() => import("../shell/PublicClientLogin.jsx").then((m) => ({ default: m.PublicClientLogin })));
const ResetPasswordScreen = lazy(() => import("../auth/ResetPasswordScreen.jsx").then((m) => ({ default: m.ResetPasswordScreen })));
const WorkScreen = lazy(() => import("./WorkScreen"));
const PublicNoteScreen = lazy(() => import("../modules/runly.notes/PublicNoteScreen.jsx"));
const AuthenticatedShell = lazy(() => import("./AuthenticatedShell.jsx"));
const CompanyScope = lazy(() => import("./AuthenticatedShell.jsx").then((m) => ({ default: m.CompanyScope })));
const MarketplaceScreen = lazy(() => import('./MarketplaceScreen.jsx'));
import { LegacyPublicRedirect } from "./LegacyPublicRedirect.jsx";
import { runly } from "../lib/runly";
import { instanceStatusQuery } from "../lib/instanceStatusQuery";
import { applyBrandTheme } from "../lib/brandTheme";
import { registerServiceWorker } from "../lib/webPush";
import { AppLoader } from "../components/AppLoader";
import { BootLoaderOverlay } from "../components/BootLoaderOverlay";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { BugReportHost } from "../components/BugReportHost";
import { useBootLoader } from "../stores/bootLoader";
import { useBrandingStore } from "../stores/branding";
import { useThemeStore } from "../stores/theme";
import { ServerSetup } from "./ServerSetup.jsx";
import { native } from '../native/index.js';
import { AppRouteGuard } from "./AppRouteGuard.jsx";

const StandaloneSiteEditor = lazy(() => import("../modules/runly.website/screens/sites/StandaloneSiteEditor.jsx"));
const GuestCallScreen = lazy(() => import("../modules/runly.chat/calls/guest/GuestCallScreen.jsx"));
// LiveKit Egress recorder page (no session; joins with the egress token).
const EgressCallScreen = lazy(() => import("../modules/runly.chat/calls/egress/EgressCallScreen.jsx"));
const PublicBoardScreen = lazy(() => import("../modules/runly.canvas/screens/PublicBoardScreen.jsx"));
const PublicFileScreen = lazy(() => import("../modules/runly.files/screens/PublicFileScreen.jsx"));
const PublicFolderScreen = lazy(() => import("../modules/runly.files/screens/PublicFolderScreen.jsx"));
const AttendanceKioskScreen = lazy(() => import("../modules/runly.attendance/kiosk/KioskScreen.jsx"));
const PosDeviceScreen = lazy(() => import("../modules/runly.pos/device/PosDeviceScreen.jsx"));
const AttendancePhoneKeyScreen = lazy(() => import("../modules/runly.attendance/phone/PhoneKeyScreen.jsx"));
// Public custody (resguardo) signing page: token link, no login, no shell.
const PublicCustodySignScreen = lazy(() => import("../modules/runly.inventory/screens/PublicCustodySignScreen.jsx"));
const PublicInventoryPortalScreen = lazy(() => import("../modules/runly.inventory/screens/PublicInventoryPortalScreen.jsx"));
const PublicInventoryItemScreen = lazy(() => import("../modules/runly.inventory/screens/PublicInventoryItemScreen.jsx"));
const GrowthStatusPageScreen = lazy(() => import("../modules/runly.growth/public/StatusPageScreen.jsx"));
const LmsCertificateVerifyScreen = lazy(() => import("../modules/runly.lms/public/CertificateVerifyScreen.jsx"));
const LmsSharedCourseScreen = lazy(() => import("../modules/runly.lms/public/SharedCourseScreen.jsx"));
const LmsEvaluationPublicScreen = lazy(() => import("../modules/runly.lms/public/EvaluationPublicScreen.jsx"));
const BookingPortalScreen = lazy(() => import("../modules/runly.bookings/public/PublicBookingScreen.jsx"));
const BookingManageScreen = lazy(() => import("../modules/runly.bookings/public/ManageBookingScreen.jsx"));
const TicketPortalScreen = lazy(() => import("../modules/runly.ticketing/public/TicketPortalScreen.jsx"));
const MyTicketsScreen = lazy(() => import("../modules/runly.ticketing/public/MyTicketsScreen.jsx"));
import { useCallSoundUnlock } from "../modules/runly.chat/calls/useCallSoundUnlock.js";
import "../styles.css";

useThemeStore.getState().init();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const _offlineDb = new RunlyOfflineDatabase()
const _persister = createDexiePersister(_offlineDb)

function isAtlasInternalPath(pathname) {
  return pathname.startsWith("/app");
}

function App({ initialServerUrl = null, requiresServerSetup = false, bootstrapError = '' }) {
  const [brandReady, setBrandReady] = useState(false);
  const setBranding = useBrandingStore((s) => s.setBranding);
  // The booking portal (and its embeds) renders at once, without the ERP loader.
  const skipBrandWait = typeof window === 'undefined'
    ? false
    : !isAtlasInternalPath(window.location.pathname) || window.location.pathname.startsWith('/app/p/reservar/') || window.location.pathname.startsWith('/app/p/boletos/');

  useCallSoundUnlock();
  useBootLoader('brand', !requiresServerSetup && !brandReady && !skipBrandWait);

  useEffect(() => {
    if (!requiresServerSetup && (brandReady || skipBrandWait)) native.ready().catch(() => {});
  }, [requiresServerSetup, brandReady, skipBrandWait]);

  useEffect(() => {
    if (requiresServerSetup) return undefined

    let mounted = true;
    queryClient
      .fetchQuery(instanceStatusQuery)
      .then((data) => {
        applyBrandTheme(data?.branding?.primaryColor);
        if (mounted) setBranding(data?.branding ?? null);
      })
      .catch(() => applyBrandTheme())
      .finally(() => {
        if (mounted) setBrandReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [requiresServerSetup, setBranding]);

  useEffect(() => {
    if (requiresServerSetup) return undefined
    registerServiceWorker().catch(() => {});
    return undefined
  }, [requiresServerSetup]);

  if (requiresServerSetup) {
    return (
      <TooltipProvider>
        <ServerSetup defaultUrl={initialServerUrl ?? ''} initialError={bootstrapError} />
        <Toaster />
      </TooltipProvider>
    )
  }

  const ready = brandReady || skipBrandWait;

  return (
    <>
      <BootLoaderOverlay />
      {ready && (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: _persister,
            maxAge: 24 * 60 * 60 * 1000,
            buster: `isolated-v1-${import.meta.env.VITE_APP_VERSION ?? '1'}`,
            // Authenticated data cannot be restored before identity and membership
            // have been checked. Offline business data needs a separate scoped store.
            dehydrateOptions: { shouldDehydrateQuery: () => false, shouldDehydrateMutation: () => false },
          }}
        >
          <TooltipProvider>
            <BrowserRouter>
              <AuthProvider>
                <OfficeProvider>
                <ImageEditingProvider>
                <ViewerSharingProvider>
                <BugReportHost />
                {/* Inner boundary: a render crash anywhere in the routed tree
                    (e.g. a screen crash below) must not unmount BugReportHost
                    too — it sits above this boundary as a sibling. Without
                    this, the outer ErrorBoundary in renderApp() below catches
                    every crash by tearing down the ENTIRE app including
                    BugReportHost, so "Reportar bug" on the resulting
                    ApiErrorScreen calls requestBugReport() with no listener
                    left registered and silently does nothing. */}
                <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Suspense fallback={null}><PublicWebsiteEntry /></Suspense>} />
                  <Route path="/app/setup" element={<AppRouteGuard mode="setup" />} />
                  <Route path="/app/login" element={<AppRouteGuard mode="login" />} />
                  <Route path="/app/reset-password" element={<Suspense fallback={null}><ResetPasswordScreen /></Suspense>} />
                  <Route path="/app/acceso" element={<Suspense fallback={null}><PublicClientLogin /></Suspense>} />
                  <Route
                    path="/app/google/calendar/callback"
                    element={<Suspense fallback={null}><GoogleCalendarCallbackScreen /></Suspense>}
                  />
                  {/* Legacy public URLs outside /app/p: redirect, keeping query/hash (shared links, QR codes, installed mini apps) */}
                  <Route path="/app/kiosk/:link" element={<LegacyPublicRedirect to={({ link }) => `/app/p/kiosk/${link}`} />} />
                  <Route path="/app/attendance/phone" element={<LegacyPublicRedirect to={() => '/app/p/attendance/phone'} />} />
                  <Route path="/sign/custody/:token" element={<LegacyPublicRedirect to={({ token }) => `/app/p/custody/${token}`} />} />
                  <Route path="/app/sign/custody/:token" element={<LegacyPublicRedirect to={({ token }) => `/app/p/custody/${token}`} />} />
                  <Route path="/app/egress/call" element={<Suspense fallback={null}><EgressCallScreen /></Suspense>} />
                  {/* Public notes under /app/p/ — accessible without auth, served by same SPA */}
                  <Route path="/app/p" element={<Suspense fallback={null}><PublicShell /></Suspense>}>
                    <Route path="notes/:slug" element={<Suspense fallback={null}><PublicNoteScreen /></Suspense>} />
                    <Route path="call/:token" element={<Suspense fallback={null}><GuestCallScreen /></Suspense>} />
                    <Route path="call" element={<Suspense fallback={null}><GuestCallScreen /></Suspense>} />
                    <Route path="canvas/:token" element={<Suspense fallback={null}><PublicBoardScreen /></Suspense>} />
                    <Route path="files/:token" element={<Suspense fallback={null}><PublicFileScreen /></Suspense>} />
                    <Route path="folders/:token" element={<Suspense fallback={null}><PublicFolderScreen /></Suspense>} />
                    {/* Attendance: offline kiosk + phone key (no login, no shell) */}
                    <Route path="kiosk/:link" element={<Suspense fallback={null}><AttendanceKioskScreen /></Suspense>} />
                    {/* runly.pos: register opened by link (device pairing + cashier PIN, no login) */}
                    <Route path="pos/:link" element={<Suspense fallback={null}><PosDeviceScreen /></Suspense>} />
                    <Route path="attendance/phone" element={<Suspense fallback={null}><AttendancePhoneKeyScreen /></Suspense>} />
                    <Route path="custody/:token" element={<Suspense fallback={null}><PublicCustodySignScreen /></Suspense>} />
                    <Route path="inv/:token" element={<Suspense fallback={null}><PublicInventoryItemScreen /></Suspense>} />
                    {/* runly.inventory: supplier (guest) portal from the invitation email */}
                    <Route path="inventory/:token" element={<Suspense fallback={null}><PublicInventoryPortalScreen /></Suspense>} />
                    {/* runly.growth: public status page of a site */}
                    <Route path="status/:slug" element={<Suspense fallback={null}><GrowthStatusPageScreen /></Suspense>} />
                    {/* runly.lms: certificate verification from the PDF QR code */}
                    <Route path="lms/cert/:token" element={<Suspense fallback={null}><LmsCertificateVerifyScreen /></Suspense>} />
                    {/* runly.lms: public course share link for external guests */}
                    <Route path="lms/curso/:token" element={<Suspense fallback={null}><LmsSharedCourseScreen /></Suspense>} />
                    <Route path="lms/evaluacion/:token" element={<Suspense fallback={null}><LmsEvaluationPublicScreen /></Suspense>} />
                    {/* runly.bookings: public Booking Portal and the customer manage link (token in the #fragment) */}
                    <Route path="reservar/gestion" element={<Suspense fallback={null}><BookingManageScreen /></Suspense>} />
                    <Route path="reservar/:slug" element={<Suspense fallback={null}><BookingPortalScreen /></Suspense>} />
                    <Route path="boletos/:slug" element={<Suspense fallback={null}><TicketPortalScreen /></Suspense>} />
                    <Route path="mis-boletos" element={<Suspense fallback={null}><MyTicketsScreen /></Suspense>} />
                  </Route>
                  <Route element={<AppRouteGuard mode="access" />}>
                    <Route path="/app/mcp" element={<Suspense fallback={null}><McpConnectionScreen /></Suspense>} />
                    <Route path="/app/accept-invitation" element={<Suspense fallback={null}><AcceptInvitationScreen /></Suspense>} />
                    <Route path="/app/shared/:resourceType/:id" element={<Suspense fallback={null}><SharedResourceScreen /></Suspense>} />
                    <Route path="/app/editor/sites/:siteId/pages/:pageId" element={
                      <Suspense fallback={null}><CompanyScope><StandaloneSiteEditor /></CompanyScope></Suspense>
                    } />
                    <Route
                      path="/app"
                      element={<Suspense fallback={<AppLoader />}><AuthenticatedShell /></Suspense>}
                    >
                      <Route index element={<Navigate to="home" replace />} />
                      <Route path="home" element={<Suspense fallback={null}><HomeScreen /></Suspense>} />
                      <Route path="marketplace" element={<Suspense fallback={null}><MarketplaceScreen /></Suspense>} />
                      <Route path="m/:moduleKey/*" element={<Suspense fallback={null}><ModuleOutlet /></Suspense>} />
                      <Route path="profile" element={<Suspense fallback={null}><ProfileScreen /></Suspense>} />
                      <Route path="help" element={<Suspense fallback={null}><HelpCenterScreen /></Suspense>} />
                      <Route path="work" element={<Suspense fallback={null}><WorkScreen /></Suspense>} />
                      <Route path="native-host" element={<Suspense fallback={null}><NativeHostDiagnostics /></Suspense>} />
                    </Route>
                  </Route>
                  <Route path="/p" element={<Suspense fallback={null}><PublicShell /></Suspense>}>
                    <Route path="notes/:slug" element={<Suspense fallback={null}><PublicNoteScreen /></Suspense>} />
                    <Route path="call/:token" element={<Suspense fallback={null}><GuestCallScreen /></Suspense>} />
                    <Route path="call" element={<Suspense fallback={null}><GuestCallScreen /></Suspense>} />
                    <Route path="files/:token" element={<Suspense fallback={null}><PublicFileScreen /></Suspense>} />
                    <Route path="folders/:token" element={<Suspense fallback={null}><PublicFolderScreen /></Suspense>} />
                    <Route path="*" element={<Suspense fallback={null}><PublicModuleOutlet /></Suspense>} />
                  </Route>
                  <Route path="*" element={<Suspense fallback={null}><PublicWebsiteEntry /></Suspense>} />
                </Routes>
                </ErrorBoundary>
                </ViewerSharingProvider>
                </ImageEditingProvider>
                </OfficeProvider>
              </AuthProvider>
              <Toaster />
            </BrowserRouter>
          </TooltipProvider>
        </PersistQueryClientProvider>
      )}
    </>
  );
}

export function renderApp(props = {}) {
  createRoot(document.getElementById("root")).render(
    <ErrorBoundary>
      <App {...props} />
    </ErrorBoundary>,
  );
}
