import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { LoginScreen } from "../auth/LoginScreen";
import { ApiErrorScreen } from "../components/ApiErrorScreen";
import { instanceStatusQuery } from "../lib/instanceStatusQuery";
import { SetupWizard } from "../setup/SetupWizard";
import { useBootLoader } from "../stores/bootLoader";

function useInstanceStatus() {
  return useQuery({
    ...instanceStatusQuery,
    retry: 1,
    gcTime: 60_000,
  });
}

export function AppRouteGuard({ mode }) {
  const { session, loading: authLoading, profileLoading } = useAuth();
  const location = useLocation();
  const { data, isPending, isError, error, refetch } = useInstanceStatus();
  const verifying = isPending || authLoading;
  // Module screens derive permissions from userProfile; hold them until /me lands.
  const awaitingProfile = mode === "access" &&Boolean(session) && profileLoading;
  useBootLoader("instance", verifying, "Verificando instancia...");
  useBootLoader("profile", !verifying && awaitingProfile, "Cargando perfil...");

  if (verifying || awaitingProfile) {
    return null;
  }

  if (isError) {
    return (
      <ApiErrorScreen
        error={error}
        onRetry={() => refetch()}
        context="Verificacion de instancia"
      />
    );
  }

  if (mode === "setup") {
    if (!data?.initialized) return <SetupWizard />;
    const nextPath = session ? "/app" : "/app/login";
    return (
      <Navigate
        to={nextPath}
        replace
        state={nextPath === "/app/login" ? { branding: data.branding } : undefined}
      />
    );
  }

  if (!data?.initialized) {
    return <Navigate to="/app/setup" replace />;
  }

  if (mode === "login") {
    return session ? <Navigate to="/app" replace /> : <LoginScreen />;
  }

  if (!session) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <LoginScreen returnTo={returnTo} />;
  }

  return <Outlet />;
}
