import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdvancedFileViewer, AvatarCropDialog, Button, Card, PageHeader, Skeleton } from "@runly/ui";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";
import { ProfileSignatureCard } from "./ProfileSignatureCard.jsx";
import { ProfileDataCard } from "./profile/ProfileDataCard.jsx";
import { ProfileIdentityCard } from "./profile/ProfileIdentityCard.jsx";
import { ProfilePasswordDialog } from "./profile/ProfilePasswordDialog.jsx";
import { EMPTY_FORM, formFromProfile } from "./profile/profileForm.js";

function ProfileSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="h-136 w-full rounded-xl" />
    </div>
  );
}

export function ProfileScreen() {
  const { session, refreshProfile } = useAuth();
  const token = session?.access_token;
  const initialFormRef = useRef(EMPTY_FORM);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  const profileQuery = useQuery({
    queryKey: ["profile-me"],
    queryFn: () => runly.profile.me(token),
    enabled: Boolean(token),
  });
  const profile = profileQuery.data?.data;

  const resolveAvatarSignedUrl = useCallback(async () => {
    const res = await runly.profile.getAvatarSignedUrl(token, { variant: "full" });
    return res?.data?.signedUrl ?? null;
  }, [token]);

  useEffect(() => {
    if (!profile) return;
    const loaded = formFromProfile(profile);
    initialFormRef.current = loaded;
    setForm(loaded);
  }, [profile]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  const saveMutation = useMutation({
    mutationFn: () => runly.profile.updateMe(form, token),
    onSuccess: () => {
      profileQuery.refetch();
      refreshProfile(session);
      setEditing(false);
      toast.success("Perfil actualizado", { description: "Tu información personal se guardó correctamente." });
    },
    onError: (err) => {
      toast.error("No se pudo guardar", {
        description:
          err?.status === 400 || err?.status === 409
            ? err.message
            : "Ocurrió un error al actualizar tu perfil. Inténtalo de nuevo.",
      });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file) => runly.profile.uploadAvatar(file, token),
    onSuccess: () => {
      profileQuery.refetch();
      refreshProfile(session);
    },
  });

  async function handleCroppedAvatar(file) {
    try {
      await avatarMutation.mutateAsync(file);
      setPendingFile(null);
      toast.success("Foto de perfil actualizada.");
    } catch {
      toast.error("No se pudo subir la foto. Inténtalo de nuevo.");
    }
  }

  function handleCancelEdit() {
    setForm(initialFormRef.current);
    setEditing(false);
  }

  const avatarFallback =
    `${form.firstName?.[0] ?? ""}${form.lastName?.[0] ?? ""}`.trim().toUpperCase() || "U";

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-6">
        <PageHeader
          eyebrow="Cuenta"
          title="Mi perfil"
          description="Gestiona tu información personal y preferencias de cuenta."
        />

        {profileQuery.isLoading ? (
          <ProfileSkeleton />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-6 lg:sticky lg:top-4">
              <ProfileIdentityCard
                profile={profile}
                fallback={avatarFallback}
                uploading={avatarMutation.isPending}
                onView={() => profile?.avatarFileId && setImageViewerOpen(true)}
                onPickFile={(file) => file && setPendingFile(file)}
              />

              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Seguridad</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Usa una contraseña larga y única para proteger tu cuenta.
                    </p>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setPasswordOpen(true)}>
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" />Cambiar contraseña
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="min-w-0 space-y-6">
              <ProfileDataCard
                profile={profile}
                form={form}
                setForm={setForm}
                editing={editing}
                onEdit={() => setEditing(true)}
                onCancel={handleCancelEdit}
                onSave={() => saveMutation.mutate()}
                saving={saveMutation.isPending}
                isDirty={isDirty}
                canSave={Boolean(form.firstName && form.lastName)}
              />
              <ProfileSignatureCard />
            </div>
          </div>
        )}
      </div>

      <AvatarCropDialog
        open={Boolean(pendingFile)}
        onOpenChange={(next) => !next && setPendingFile(null)}
        file={pendingFile}
        busy={avatarMutation.isPending}
        onConfirm={handleCroppedAvatar}
      />

      <ProfilePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} token={token} />

      {profile?.avatarFileId && (
        <AdvancedFileViewer imageEditing={false}
          open={imageViewerOpen}
          onOpenChange={setImageViewerOpen}
          files={[
            {
              id: profile.avatarFileId,
              mimeType: "image/jpeg",
              originalName: profile.displayName ?? "Foto de perfil",
              sizeBytes: 0,
            },
          ]}
          activeIndex={0}
          onIndexChange={() => {}}
          onResolveSignedUrl={resolveAvatarSignedUrl}
        />
      )}
    </div>
  );
}
