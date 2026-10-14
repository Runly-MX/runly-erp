import { useRef, useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  MiraiAvatar, Popover, PopoverAnchor, PopoverContent, ThemedEmojiPicker, cn,
} from "@runly/ui";
import { Eye, ImagePlus, Loader2, Pencil, Smile, Trash2 } from "lucide-react";
import { useConversationAvatarEditor } from "../../hooks/useConversationAvatarEditor";

const SIZES = {
  hero: { box: "h-24 w-24", text: "text-3xl", emoji: "text-5xl", px: 96 },
  compact: { box: "h-9 w-9", text: "text-sm", emoji: "text-lg", px: 36 },
};

// The avatar shape alone (photo, emoji, initial or MirAI's mark).
export function AvatarFace({ size = "hero", url, emoji, name, mirai = false, onImageError }) {
  const s = SIZES[size];
  if (mirai) return <MiraiAvatar size={s.px} animated={size === "hero"} />;
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--muted))]", s.box)}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" onError={onImageError} />
      ) : emoji ? (
        <span className={cn("leading-none", s.emoji)}>{emoji}</span>
      ) : (
        <span className={cn("font-semibold text-[hsl(var(--muted-foreground))]", s.text)}>{(name ?? "?")[0]?.toUpperCase()}</span>
      )}
    </span>
  );
}

// Hero avatar. Tapping it opens what makes sense for the viewer: managers of
// a group/channel get Ver imagen / Subir imagen / Elegir emoji / Quitar;
// everyone else just opens the photo (when there is one).
export function ProfileAvatar({ conversationId, canEdit, url, emoji, name, mirai = false, onView, onImageError }) {
  const fileRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const editor = useConversationAvatarEditor(conversationId);
  const face = <AvatarFace url={url} emoji={emoji} name={name} mirai={mirai} onImageError={onImageError} />;

  if (mirai) return face;
  if (!canEdit) {
    return url ? (
      <button type="button" onClick={onView} aria-label="Ver foto de perfil" title="Ver foto de perfil" className="rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)">
        {face}
      </button>
    ) : face;
  }

  return (
    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
      <PopoverAnchor asChild>
        <span className="relative inline-flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Cambiar imagen de perfil"
                title="Cambiar imagen de perfil"
                disabled={editor.busy}
                className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary) focus-visible:ring-offset-2"
              >
                {face}
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/30">
                  {editor.busy && <Loader2 className="h-6 w-6 animate-spin text-white" />}
                </span>
                <span className="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-(--brand-primary) text-(--brand-primary-foreground) shadow-md ring-2 ring-[hsl(var(--background))]">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52">
              {url && (
                <DropdownMenuItem onSelect={onView}>
                  <Eye className="mr-2 h-4 w-4" /> Ver imagen
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                <ImagePlus className="mr-2 h-4 w-4" /> Subir imagen
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTimeout(() => setEmojiOpen(true), 0)}>
                <Smile className="mr-2 h-4 w-4" /> Usar emoji
              </DropdownMenuItem>
              {(url || emoji) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-500 focus:text-red-500" onSelect={editor.clear}>
                    <Trash2 className="mr-2 h-4 w-4" /> Quitar imagen
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </PopoverAnchor>
      <PopoverContent side="bottom" align="center" className="w-auto overflow-hidden p-0">
        <ThemedEmojiPicker
          onEmojiClick={(data) => { editor.setEmoji(data.emoji); setEmojiOpen(false); }}
          width="min(300px, calc(100vw - 1.5rem))"
          height={340}
        />
      </PopoverContent>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) editor.uploadImage(file);
          e.target.value = "";
        }}
      />
    </Popover>
  );
}
