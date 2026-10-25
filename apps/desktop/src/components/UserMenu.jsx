import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isNativeMobile } from "@runly/core/native-runtime";
import { Moon as MoonIcon, SmilePlus, ChevronDown, User, Settings, LogOut, Monitor, Download, Smartphone, Share, Sun, Moon, Activity, MessageSquare, Building2, Bug, Server, ShieldCheck, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { native } from "../native/index.js";
import { useThemeStore } from "../stores/theme";
import { useChatFloatStore } from "../modules/runly.chat/store/chatFloatStore";
import { useChatUnreadCount } from "../modules/runly.chat/hooks/useChatConversations";
import { useActiveCompany } from "../company/ActiveCompanyProvider";
import { CompanySwitcherModal } from "./CompanySwitcherModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  requestBugReport,
} from "@runly/ui";
import { useAuth } from "../auth/AuthProvider";
import { RUNLY_DESKTOP_DOWNLOAD_URL, RUNLY_MOBILE_DOWNLOAD_URL } from "../lib/appConfig.js";
import { getMobilePwaInstallMode } from "../lib/pwaInstallUi.js";
import { StatusEditor } from "./StatusEditor";
import { useDnd, useMyStatus } from "../hooks/useStatusDnd";
import { DND_DURATIONS, durationFor, untilText } from "../lib/statusDnd";

function getDevicePlatform() {
  const platform = globalThis.window?.__RUNLY_NATIVE_HOST__?.platform;
  if (["windows", "android", "ios"].includes(platform)) return platform;
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPod/i.test(ua)) return "ios";
  if (/iPad/i.test(ua) || (/Mac/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  if (/Windows NT/i.test(ua)) return "windows";
  return "desktop";
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function getInitials(firstName, lastName) {
  const f = (firstName ?? "").charAt(0).toUpperCase();
  const l = (lastName ?? "").charAt(0).toUpperCase();
  const result = (f + l).trim();
  return result || (firstName ?? "").charAt(0).toUpperCase() || "U";
}

export function UserMenu({
  activeModuleKey = null,
  canInstall = false,
  manualInstallReady = false,
  onInstall,
  canReadActivity = false,
  onActivityOpen,
  canReadChat = false,
  onChatOpen,
}) {
  const { userProfile, logout } = useAuth();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { hidden: chatHubHidden, show: showChatHub } = useChatFloatStore();
  const chatUnreadCount = useChatUnreadCount();
  const { activeCompany } = useActiveCompany();
  const navigate = useNavigate();
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [openingNativeSettings, setOpeningNativeSettings] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const { status, save: saveStatus } = useMyStatus();
  const { dnd, save: saveDnd } = useDnd();
  const dndOn = dnd?.active === true;

  const platform = getDevicePlatform();
  const standalone = isStandaloneMode();
  const isWindows = platform === "windows";
  const nativeMobile = isNativeMobile();
  const mobileInstallMode = getMobilePwaInstallMode({
    platform,
    standalone,
    activeModuleKey,
    canInstall,
    manualInstallReady,
  });

  function handleDesktopDownload() {
    window.open(RUNLY_DESKTOP_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
  }

  async function handleNativeSettings(section) {
    if (openingNativeSettings) return;
    setOpeningNativeSettings(true);
    try {
      await native.instances.open(section);
    } catch {
      toast.error("No se pudo abrir el gestor. Actualiza la app o intenta de nuevo.");
    } finally {
      setOpeningNativeSettings(false);
    }
  }

  function handlePwaInstall() {
    if (native.isRemoteHost()) {
      const url = new URL(window.location.href);
      url.searchParams.set("pwa-install", "1");
      native.openExternal(url.href).catch(() => toast.error("No se pudo abrir el navegador para instalar la PWA."));
      return;
    }
    onInstall?.();
  }

  function handleReportBug() {
    requestBugReport({
      context: activeModuleKey
        ? `${activeModuleKey} · ${window.location.pathname}`
        : window.location.pathname,
    });
  }

  const initials = getInitials(userProfile?.firstName, userProfile?.lastName);
  const displayName =
    (userProfile?.displayName ??
      `${userProfile?.firstName ?? ""} ${userProfile?.lastName ?? ""}`.trim()) ||
    "Usuario";
  const email = userProfile?.email ?? "";
  const firstName = userProfile?.firstName ?? "Usuario";

  // Module PWA installation and the Android APK are independent actions.
  const showMobileInstall = mobileInstallMode !== null && !native.isRemoteHost();
  const showAndroidDownload = platform === "android" && !nativeMobile;
  const showWindowsApp = isWindows;
  // The install group above already covers the module install on mobile.
  const showModuleInstallItem = !standalone && !showMobileInstall;

  return (
    <Popover open={statusOpen} onOpenChange={setStatusOpen}>
    <DropdownMenu>
      <PopoverAnchor asChild>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-[hsl(var(--muted))] transition-colors duration-150 cursor-pointer outline-none">
          <span className="relative">
          <Avatar className="h-7 w-7">
            {userProfile?.avatarUrl && (
              <AvatarImage src={userProfile.avatarUrl} alt={displayName} />
            )}
            <AvatarFallback
              className="text-[11px] font-bold"
              style={{
                backgroundColor: "var(--brand-primary)",
                color: "var(--brand-primary-foreground)",
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          {dndOn && <span title="No molestar activo" className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[hsl(var(--background))] text-[var(--brand-primary)]"><MoonIcon size={10} aria-hidden /></span>}
          </span>
          <span className="text-sm font-medium text-[hsl(var(--foreground))] max-w-20 truncate hidden sm:block">
            {firstName}
          </span>
          <ChevronDown
            size={13}
            className="text-[hsl(var(--muted-foreground))]"
          />
        </button>
      </DropdownMenuTrigger>
      </PopoverAnchor>
      <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()} className="w-64 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto">
        {/* User info header */}
        <div className="px-2 py-2.5 border-b border-[hsl(var(--border))] mb-1">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
            {displayName}
          </p>
          {email && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
              {email}
            </p>
          )}
        </div>

        <DropdownMenuItem onSelect={() => setTimeout(() => setStatusOpen(true), 0)} className="gap-2 cursor-pointer">
          {status?.emoji ? <span aria-hidden className="w-3.5 text-center text-sm leading-none">{status.emoji}</span> : <SmilePlus size={14} />}
          <span className="min-w-0 flex-1 truncate">{status?.text || "Establecer estado"}</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
            <MoonIcon size={14} />
            <span className="min-w-0 flex-1 truncate">{dndOn ? `No molestar ${untilText(dnd?.until)}`.trim() : "No molestar"}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {DND_DURATIONS.map((item) => (
              <DropdownMenuItem key={item.value} onClick={() => saveDnd.mutate({ ...dnd, until: durationFor(item.value, DND_DURATIONS) })} className="cursor-pointer">{item.label}</DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => navigate("/app/m/runly.notifications/settings")} className="cursor-pointer">Horario silencioso...</DropdownMenuItem>
            {dndOn && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => saveDnd.mutate({ ...dnd, until: null })} className="cursor-pointer">Desactivar</DropdownMenuItem></>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate("/app/profile")}
          className="gap-2 cursor-pointer"
        >
          <User size={14} />
          Mi perfil
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("/app/mcp")}
          className="gap-2 cursor-pointer"
        >
          <PlugZap size={14} />
          Conexiones de asistentes
        </DropdownMenuItem>
        {(userProfile?.isAdmin ||
          userProfile?.permissions?.includes("platform.settings.manage")) && (
          <DropdownMenuItem
            onClick={() => navigate("/app/m/runly.core/settings")}
            className="gap-2 cursor-pointer"
          >
            <Settings size={14} />
            Configuración
          </DropdownMenuItem>
        )}

        {native.isRemoteHost() && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={openingNativeSettings}
              onClick={() => handleNativeSettings("manage")}
              className="gap-2 cursor-pointer"
            >
              <Server size={14} />
              Cambiar instancia
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={openingNativeSettings}
              onClick={() => handleNativeSettings("device")}
              className="gap-2 cursor-pointer"
            >
              <ShieldCheck size={14} />
              Permisos del dispositivo
            </DropdownMenuItem>
          </>
        )}

        {/* ── Install: one compact group (PWA + Android APK) ── */}
        {(showMobileInstall || showAndroidDownload) && (
          <>
            <DropdownMenuSeparator />
            {showMobileInstall && (
              mobileInstallMode === "prompt" || mobileInstallMode === "prepare" ? (
                <DropdownMenuItem onClick={onInstall} className="gap-2 cursor-pointer">
                  <Smartphone size={14} />
                  {mobileInstallMode === "prepare" ? "Preparar este módulo como app" : "Instalar como app"}
                </DropdownMenuItem>
              ) : (
                <div className="flex items-start gap-2 px-2 py-1.5">
                  <Smartphone size={14} className="mt-0.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  <p className="text-xs leading-snug text-[hsl(var(--muted-foreground))]">
                    <span className="block text-sm font-medium text-[hsl(var(--foreground))]">Instalar como app</span>
                    {platform === "ios" ? (
                      <>En Safari, toca <Share size={10} className="mx-0.5 inline-block align-middle" /> y luego «Añadir a pantalla de inicio».</>
                    ) : (
                      <>En Chrome, toca ⋮ y luego «Añadir a pantalla de inicio».</>
                    )}
                  </p>
                </div>
              )
            )}
            {showAndroidDownload && (
              <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                <a href={RUNLY_MOBILE_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                  <Download size={14} />
                  Descargar app Android (.apk)
                </a>
              </DropdownMenuItem>
            )}
          </>
        )}

        {/* ── Windows desktop app section ── */}
        {showWindowsApp && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Monitor size={12} className="text-[hsl(var(--muted-foreground))] shrink-0" />
                  <p className="text-xs font-medium text-[hsl(var(--foreground))]">App de escritorio</p>
                </div>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] leading-snug">
                Descarga la app nativa para Windows y conéctala a esta instancia.
              </p>
              <Button
                type="button"
                onClick={handleDesktopDownload}
                className="w-full justify-start text-xs"
              >
                <Download size={11} />
                Descargar para Windows
              </Button>
            </div>
          </>
        )}

        {/* Mobile-only: company switcher (hidden on md+ where CompanySwitcher
            lives inline in the topbar — see Topbar.jsx's `hidden md:contents`).
            Opens a modal (CompanySwitcherModal) rather than a nested dropdown,
            which is awkward on touch. Shown whenever there's at least one
            company to display or the user could create one. */}
        {(activeCompany || userProfile?.isAdmin) && (
          <div className="md:hidden">
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setCompanyModalOpen(true)}
              className="gap-2 cursor-pointer"
            >
              <Building2 size={14} />
              <span className="flex-1 truncate">
                {activeCompany?.name ?? "Cambiar empresa"}
              </span>
            </DropdownMenuItem>
          </div>
        )}

        {/* Chat + Activity + "instalar modulo": live here at every breakpoint
            (used to be always-on topbar icons; moved in to free up space in a
            crowded right-hand cluster that was colliding with the centered
            search bar around the lg breakpoint — see Topbar.jsx). */}
        {(canReadChat || canReadActivity || showModuleInstallItem) && (
          <>
            <DropdownMenuSeparator />
            {canReadChat && (
              <DropdownMenuItem
                onClick={onChatOpen}
                className="gap-2 cursor-pointer"
              >
                <MessageSquare size={14} />
                <span className="flex-1">Chat</span>
                {chatUnreadCount > 0 && (
                  <span className="rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                  </span>
                )}
              </DropdownMenuItem>
            )}
            {canReadActivity && (
              <DropdownMenuItem
                onClick={onActivityOpen}
                className="gap-2 cursor-pointer"
              >
                <Activity size={14} />
                Actividad
              </DropdownMenuItem>
            )}
            {showModuleInstallItem && (
              <>
              <DropdownMenuItem
                onClick={handlePwaInstall}
                disabled={!activeModuleKey}
                className="gap-2 cursor-pointer"
              >
                <Download size={14} />
                {!activeModuleKey ? "Instalar módulo como PWA" : native.isRemoteHost() ? "Instalar PWA en el navegador" : canInstall ? "Instalar módulo como PWA" : "Preparar módulo como PWA"}
              </DropdownMenuItem>
              {manualInstallReady && !canInstall && !native.isRemoteHost() && <p className="px-2 pb-2 text-xs text-muted-foreground leading-relaxed">Usa el menú de Chrome o Edge para instalar este módulo como aplicación.</p>}
              {!activeModuleKey && <p className="px-2 pb-2 text-xs text-muted-foreground leading-relaxed">Abre primero el módulo que quieres instalar.</p>}
              </>
            )}
          </>
        )}

        {/* Mobile-only: theme (hidden on sm+ where ThemeToggle lives in topbar) */}
        <div className="sm:hidden">
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={toggleTheme}
            className="gap-2 cursor-pointer"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
            {isDark ? "Modo claro" : "Modo oscuro"}
          </DropdownMenuItem>
        </div>

        {chatHubHidden && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={showChatHub} className="gap-2 cursor-pointer">
              <MessageSquare size={14} />
              Mostrar chat flotante
            </DropdownMenuItem>
          </>
        )}

        <div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleReportBug} className="gap-2 cursor-pointer">
            <Bug size={14} />
            Reportar un problema
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logout()}
          className="gap-2 cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
        >
          <LogOut size={14} />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
      {companyModalOpen && (
        <CompanySwitcherModal onClose={() => setCompanyModalOpen(false)} />
      )}
    </DropdownMenu>
      <PopoverContent align="end" sideOffset={8} className="w-auto p-0" onOpenAutoFocus={(event) => event.preventDefault()} onFocusOutside={(event) => event.preventDefault()}>
        <StatusEditor status={status} onSave={(next) => saveStatus.mutate(next)} onClear={() => saveStatus.mutate(null)} onClose={() => setStatusOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
