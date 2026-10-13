import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@runly/ui";
import { Download, ExternalLink, Eye, Link2, MessageSquare, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";
import { downloadViaBlob, formatFileSize } from "../../lib/chatUtils";
import { FileTypeIcon } from "../ChatFilesGallery";
import { AudioCard } from "../MessageAttachments";
import { formatShortDate, groupByMonth } from "./mediaUtils";

function MonthSections({ items, getDate, children }) {
  return (
    <div className="space-y-5">
      {groupByMonth(items, getDate).map((group) => (
        <section key={group.key}>
          <h3 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group.label}</h3>
          <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 divide-y divide-[hsl(var(--border))]">
            {group.items.map(children)}
          </div>
        </section>
      ))}
    </div>
  );
}

function MetaLine({ parts }) {
  return (
    <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
      {parts.filter(Boolean).join(" · ")}
    </p>
  );
}

function RowMenu({ items }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Más acciones"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] md:h-8 md:w-8"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map(({ label, icon: Icon, onSelect }) => (
          <DropdownMenuItem key={label} onSelect={onSelect}>
            <Icon className="mr-2 h-4 w-4" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DocumentList({ items, nameOf, onOpen, onOpenConversation }) {
  const { session } = useAuth();
  const [downloadingId, setDownloadingId] = useState(null);

  async function download(item) {
    setDownloadingId(item.id);
    try {
      const res = await runly.chat.getAttachmentSignedUrl(item.id, session?.access_token);
      if (!res?.data?.url) throw new Error("Sin URL");
      await downloadViaBlob(res.data.url, item.fileName);
    } catch {
      toast.error("No se pudo descargar el archivo.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <MonthSections items={items} getDate={(i) => i.createdAt}>
      {(item) => (
        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[hsl(var(--muted))]/50">
          <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--muted))]">
              <FileTypeIcon mimeType={item.mimeType} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.fileName}</span>
              <MetaLine parts={[nameOf(item.conversationId), item.senderName, formatShortDate(item.createdAt), formatFileSize(item.sizeBytes)]} />
            </span>
          </button>
          <RowMenu items={[
            { label: "Ver", icon: Eye, onSelect: () => onOpen(item) },
            { label: downloadingId === item.id ? "Descargando..." : "Descargar", icon: Download, onSelect: () => download(item) },
            ...(onOpenConversation ? [{ label: "Abrir chat", icon: MessageSquare, onSelect: () => onOpenConversation(item.conversationId) }] : []),
          ]} />
        </div>
      )}
    </MonthSections>
  );
}

export function AudioList({ items, nameOf, onOpenConversation }) {
  return (
    <MonthSections items={items} getDate={(i) => i.createdAt}>
      {(item) => (
        <div key={item.id} className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1">
            <MetaLine parts={[nameOf(item.conversationId), item.senderName, formatShortDate(item.createdAt)]} />
            <AudioCard att={item} isOwn={false} />
          </div>
          {onOpenConversation && (
            <RowMenu items={[{ label: "Abrir chat", icon: MessageSquare, onSelect: () => onOpenConversation(item.conversationId) }]} />
          )}
        </div>
      )}
    </MonthSections>
  );
}

export function LinkList({ items, nameOf, onOpenConversation }) {
  return (
    <MonthSections items={items} getDate={(l) => l.message.createdAt}>
      {(link) => (
        <div key={link.key} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[hsl(var(--muted))]/50">
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--brand-primary)/10 text-(--brand-primary)">
              <Link2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{link.host}</span>
              <span className="block truncate text-xs text-(--brand-primary)">{link.url}</span>
              <MetaLine parts={[nameOf(link.message.conversationId), link.message.senderName, formatShortDate(link.message.createdAt)]} />
            </span>
          </a>
          <RowMenu items={[
            { label: "Abrir enlace", icon: ExternalLink, onSelect: () => window.open(link.url, "_blank", "noopener,noreferrer") },
            ...(onOpenConversation ? [{ label: "Abrir chat", icon: MessageSquare, onSelect: () => onOpenConversation(link.message.conversationId) }] : []),
          ]} />
        </div>
      )}
    </MonthSections>
  );
}
