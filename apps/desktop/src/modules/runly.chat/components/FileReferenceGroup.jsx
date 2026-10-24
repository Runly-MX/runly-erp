// apps/desktop/src/modules/runly.chat/components/FileReferenceGroup.jsx
// Renders every "file" entity reference in a message (links to existing
// runly.files records, attached via the composer's entity-ref picker) as a
// single group — instead of the generic EntityReferenceCard link chip.
// Mirrors AttachmentsBlock/ImageGrid's layout for real attachments: images
// lay out in a grid (1 / 2 side-by-side / 1+2 / 2x2+overflow). Clicks bubble
// up via `onOpen` (same (files, activeIndex) contract AttachmentsBlock uses)
// instead of opening a viewer scoped to this group — ChatWindow/MiniChatWindow
// resolve that click against the WHOLE conversation's attachments list, so
// paging through the resulting carousel walks every file ever shared in the
// chat, not just this one message's references.
//
// Only usable when a reference carries `mimeType` (added when the backend
// resolves the ref at send time — refs sent before that change won't have
// it, and the caller falls back to EntityReferenceCard for those). Kept in
// its own file rather than added to ChatMessageBubble.jsx, which is already
// over this project's 1000-line soft limit.
import { useState } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  useOfficeActions,
} from "@runly/ui";
import { Loader2, Download } from "lucide-react";
import { formatFileSize, isImageMime, downloadViaBlob } from "../lib/chatUtils";
import { FileTypeIcon } from "./ChatFilesGallery";
import { useFileRefSignedUrl } from "../hooks/useFileRefSignedUrl";
import { buildFileAssetOfficeActions } from "../lib/officeFileActions";

// Right-click / long-press menu shared by both the image tiles and the file
// rows of a file-reference group. Entity references are real runly.files
// records, so "Abrir en editor de Office" reuses the existing office.open()
// route; "Abrir en pestaña nueva" / "Descargar" resolve a `full` signed URL
// lazily (never on mount — see useFileRefSignedUrl's enabled:false).
function FileRefContextMenu({ fileRef, children }) {
  const office = useOfficeActions();
  const { refetch } = useFileRefSignedUrl(fileRef.recordId, "full", false);
  const items = buildFileAssetOfficeActions({
    office,
    fileAssetId: fileRef.recordId,
    file: { title: fileRef.title, mimeType: fileRef.mimeType },
    signedUrl: null,
    onResolveUrl: async () => (await refetch())?.data ?? null,
  });
  async function download() {
    const url = (await refetch())?.data ?? null;
    if (url) {
      await downloadViaBlob(url, fileRef.title).catch(() =>
        window.open(url, "_blank", "noopener,noreferrer"),
      );
    }
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {items.map((a) => (
          <ContextMenuItem key={a.key} disabled={a.disabled} onSelect={() => a.onSelect()}>
            {a.icon && <a.icon className="h-4 w-4 mr-2" />}
            {a.label}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={download}>
          <Download className="h-4 w-4 mr-2" />
          Descargar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Shape ChatAttachmentViewer.jsx (the conversation-wide media viewer) reads
// off each entry — `isEntityRef: true` routes it through the generic files
// signed-url endpoint instead of the chat-attachment one.
function toViewerFile(ref) {
  return { id: ref.recordId, mimeType: ref.mimeType, fileName: ref.title, sizeBytes: ref.sizeBytes ?? null, isEntityRef: true };
}

function GridImageTile({ fileRef, onOpen, overflowCount = 0 }) {
  const { data: url, isLoading } = useFileRefSignedUrl(fileRef.recordId, "card", true);
  return (
    <FileRefContextMenu fileRef={fileRef}>
      <button type="button" onClick={onOpen} className="relative w-full h-full overflow-hidden bg-[hsl(var(--muted))]">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin opacity-40" />
          </div>
        ) : url ? (
          <img src={url} alt={fileRef.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileTypeIcon mimeType={fileRef.mimeType} />
          </div>
        )}
        {overflowCount > 0 && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-sm font-semibold">+{overflowCount}</span>
          </div>
        )}
      </button>
    </FileRefContextMenu>
  );
}

// Same 1 / 2 / 3 / 4+ layouts as ChatMessageBubble.jsx's ImageGrid for real
// attachments, but reading a lazy per-tile "card" thumbnail instead of an
// embedded url — entity refs never carry one (see useFileRefSignedUrl.js).
function ImageGrid({ images, onOpenAt }) {
  const shown = images.slice(0, 4);
  const overflowCount = Math.max(0, images.length - 4);
  const count = shown.length;

  if (count === 1) {
    return (
      <div className="mt-1.5 rounded-xl overflow-hidden" style={{ width: 352, maxWidth: "100%", aspectRatio: "4 / 3" }}>
        <GridImageTile fileRef={shown[0]} onOpen={() => onOpenAt(0)} />
      </div>
    );
  }
  if (count === 2) {
    return (
      <div className="mt-1.5 flex gap-0.5 rounded-xl overflow-hidden" style={{ width: 352, maxWidth: "100%" }}>
        {shown.map((fileRef, i) => (
          <div key={fileRef.recordId} className="relative min-w-0 flex-1" style={{ aspectRatio: count === 2 ? "4 / 5" : "1" }}>
            <GridImageTile fileRef={fileRef} onOpen={() => onOpenAt(i)} />
          </div>
        ))}
      </div>
    );
  }
  if (count === 3) {
    return (
      <div className="mt-1.5 rounded-xl overflow-hidden" style={{ width: 352, maxWidth: "100%" }}>
        <div className="relative" style={{ aspectRatio: "3 / 2" }}>
          <GridImageTile fileRef={shown[0]} onOpen={() => onOpenAt(0)} />
        </div>
        <div className="flex gap-0.5 mt-0.5">
          {shown.slice(1).map((fileRef, i) => (
            <div key={fileRef.recordId} className="relative min-w-0 flex-1" style={{ aspectRatio: "1" }}>
              <GridImageTile fileRef={fileRef} onOpen={() => onOpenAt(i + 1)} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1.5 rounded-xl overflow-hidden" style={{ width: 352, maxWidth: "100%" }}>
      <div className="flex gap-0.5">
        {shown.slice(0, 2).map((fileRef, i) => (
          <div key={fileRef.recordId} className="relative min-w-0 flex-1" style={{ aspectRatio: count === 2 ? "4 / 5" : "1" }}>
            <GridImageTile fileRef={fileRef} onOpen={() => onOpenAt(i)} />
          </div>
        ))}
      </div>
      <div className="flex gap-0.5 mt-0.5">
        {shown.slice(2, 4).map((fileRef, i) => (
          <div key={fileRef.recordId} className="relative min-w-0 flex-1" style={{ aspectRatio: count === 2 ? "4 / 5" : "1" }}>
            <GridImageTile fileRef={fileRef} onOpen={() => onOpenAt(i + 2)} overflowCount={i === 1 ? overflowCount : 0} />
          </div>
        ))}
      </div>
    </div>
  );
}

// A dedicated download button alongside the open-viewer click — without it,
// downloading a referenced PDF/document meant opening the full viewer first
// and finding its download button, when a one-tap download is what most
// clicks on a file bubble are actually for.
//
// Fetches imperatively via refetch() on click rather than toggling an
// `enabled` flag and reacting to `data` in a useEffect: react-query caches
// by queryKey (fileId + "full") across every caller, so once this file's
// signed URL has EVER resolved anywhere else (the same file downloaded
// earlier from the Archivos list, say), a boolean-gated hook would hand
// back that cached `data` on mount regardless of `enabled` — misfiring an
// auto-download with no click at all the next time this bubble renders.
function FileRow({ fileRef, isOwn, onOpen }) {
  const [downloading, setDownloading] = useState(false);
  const { refetch } = useFileRefSignedUrl(fileRef.recordId, "full", false);

  async function handleDownloadClick() {
    setDownloading(true);
    try {
      const { data: url } = await refetch();
      if (url) {
        await downloadViaBlob(url, fileRef.title).catch(() => {
          window.open(url, "_blank", "noopener,noreferrer");
        });
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <FileRefContextMenu fileRef={fileRef}>
      <div
        className={[
          "flex items-center gap-1 mt-1.5 rounded-xl max-w-55",
          isOwn ? "bg-white/15" : "bg-[hsl(var(--border))]",
        ].join(" ")}
      >
        <button type="button" onClick={onOpen} className="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2 text-left">
          <FileTypeIcon mimeType={fileRef.mimeType} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{fileRef.title}</p>
            <p className="text-xs opacity-50">{fileRef.sizeBytes ? formatFileSize(fileRef.sizeBytes) : ""}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={handleDownloadClick}
          disabled={downloading}
          title="Descargar"
          className="shrink-0 h-8 w-8 mr-1 rounded-full flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
    </FileRefContextMenu>
  );
}

// `onOpen(files, activeIndex)` — same contract AttachmentsBlock's onOpen
// uses for real attachments. The caller (ultimately ChatWindow/MiniChatWindow's
// handleAttachmentClick) only reads `files[activeIndex].id` and looks it up
// in the conversation-wide attachments list, so which files/index this group
// passes barely matters beyond carrying the clicked item's id — this group
// deliberately does NOT own its own viewer instance, so opening any file
// from here pages through the WHOLE chat's media, not just this message's.
export function FileReferenceGroup({ references, isOwn, onOpen }) {
  const imageRefs = references.filter((r) => isImageMime(r.mimeType));
  const otherRefs = references.filter((r) => !isImageMime(r.mimeType));
  const viewerFiles = [...imageRefs, ...otherRefs].map(toViewerFile);

  return (
    <>
      {imageRefs.length > 0 && (
        <ImageGrid images={imageRefs} onOpenAt={(i) => onOpen?.(viewerFiles, i)} />
      )}
      {otherRefs.map((fileRef, i) => (
        <FileRow
          key={fileRef.recordId}
          fileRef={fileRef}
          isOwn={isOwn}
          onOpen={() => onOpen?.(viewerFiles, imageRefs.length + i)}
        />
      ))}
    </>
  );
}
