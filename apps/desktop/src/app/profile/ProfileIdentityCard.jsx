import { Avatar, AvatarFallback, AvatarImage, Badge, Card, DistDropZone } from "@runly/ui";
import { AtSign, Mail, ZoomIn } from "lucide-react";

export function ProfileIdentityCard({ profile, fallback, uploading, onView, onPickFile }) {
  const name = profile?.displayName || "Mi perfil";
  return (
    <Card className="overflow-hidden p-0">
      <div className="h-20 bg-gradient-to-br from-[hsl(var(--primary))]/25 via-[hsl(var(--primary))]/10 to-transparent" />
      <div className="-mt-12 flex flex-col items-center px-4 pb-5 text-center">
        <button
          type="button"
          aria-label="Ver foto de perfil"
          disabled={!profile?.avatarFileId || uploading}
          onClick={onView}
          className="group relative block rounded-full ring-4 ring-[hsl(var(--card))] focus-visible:outline-none focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none"
        >
          <Avatar className="h-24 w-24">
            <AvatarImage src={profile?.avatarUrl ?? ""} alt="Foto de perfil" />
            <AvatarFallback className="text-2xl font-semibold">{fallback}</AvatarFallback>
          </Avatar>
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-medium text-white">
              Subiendo
            </span>
          ) : profile?.avatarUrl ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors duration-150 group-hover:bg-black/30">
              <ZoomIn className="h-5 w-5 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
            </span>
          ) : null}
        </button>

        <p className="mt-3 max-w-full truncate text-base font-semibold">{name}</p>
        <div className="mt-1 flex max-w-full flex-col items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          {profile?.email ? (
            <span className="flex max-w-full items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{profile.email}</span>
            </span>
          ) : null}
          {profile?.username ? (
            <Badge variant="secondary" className="gap-1">
              <AtSign className="h-3 w-3" />{profile.username}
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 w-full">
          <DistDropZone
            variant="compact"
            accept="image/*"
            maxSizeMB={10}
            fullScreenOverlay
            overlayLabel="Suelta tu foto aqui"
            overlayHint="JPG, PNG o WebP · maximo 10 MB"
            onFile={onPickFile}
            isUploading={uploading}
            emptyLabel="Arrastra o haz clic para cambiar foto"
            emptyHint="JPG, PNG o WebP · maximo 10 MB"
          />
        </div>
      </div>
    </Card>
  );
}
