import { MIRAI_NAME } from "./mirai.js";
export function formatMessageTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) {
    return d.toLocaleDateString("es-MX", { weekday: "short" });
  }
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });
}

// "[7/9/26, 19:33]" prefix for the copy-selected transcript. Browser-local
// zone via Intl (never toISOString, which is UTC — see @runly/core/time).
export function transcriptStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "numeric", year: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date}, ${time}`;
}

// WhatsApp-style plain-text transcript of the given messages, one line each:
// "[stamp] Sender: body". Skips deleted / body-less messages; sorts ascending
// by created_at. Returns "" when nothing is copyable.
export function buildMessagesTranscript(messages) {
  return (messages ?? [])
    .filter((m) => m && m.body && !m.deleted_at)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => `[${transcriptStamp(m.created_at)}] ${m.sender?.displayName ?? "Usuario"}: ${m.body}`)
    .join("\n");
}

export function formatDateSeparator(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

export function groupMessagesByDate(messages) {
  const groups = [];
  let currentDate = null;

  for (const msg of messages) {
    const msgDate = msg.created_at ? new Date(msg.created_at).toDateString() : null;
    if (msgDate !== currentDate) {
      groups.push({ type: "date_separator", date: msg.created_at });
      currentDate = msgDate;
    }
    groups.push({ type: "message", ...msg });
  }
  return groups;
}

// MirAI's conversation can carry a stored title (its first prompt); it is
// always shown as MirAI, never as that text.
export function getConversationDisplayName(conversation, currentUserId) {
  if (conversation?.type === "mirai") return MIRAI_NAME;
  if (conversation?.title) return conversation.title;
  if (conversation?.type === "direct") {
    const other = (conversation.members ?? []).find(
      (m) => m.userId !== currentUserId,
    );
    return other?.displayName ?? "Conversacion directa";
  }
  return "Grupo";
}

// Same name, but Discord/Slack-style "#" prefixed for channels — for the
// visible title text only (header, list row label). Never use this for an
// avatar's initials fallback or for search matching: prefixing the raw name
// used there would show "#" as the initial letter instead of the channel's
// actual first letter.
export function getConversationTitleLabel(conversation, currentUserId) {
  const name = getConversationDisplayName(conversation, currentUserId);
  return conversation?.type === "channel" ? `#${name}` : name;
}

export function isImageMime(mimeType) {
  return String(mimeType ?? "").startsWith("image/");
}

export function isVideoMime(mimeType) {
  return String(mimeType ?? "").startsWith("video/");
}

// "Media" = anything the Fotos y videos grid shows as a visual tile (images
// and videos). Everything else (PDFs, docs, audio, archives...) goes in the
// plain Archivos list below it.
export function isAudioAttachment(att) {
  const mime = String(att?.mimeType ?? "").toLowerCase();
  const name = String(att?.fileName ?? att?.originalName ?? "");
  return mime.startsWith("audio/") || /^nota_de_voz/i.test(name)
    || (/\.(m4a|mp3|mpeg|ogg|oga|opus|wav|aac|weba|flac)$/i.test(name) && !mime.startsWith("video/"));
}

export function isMediaMime(mimeType) {
  return isImageMime(mimeType) || isVideoMime(mimeType);
}

// Every file ever shared in a conversation, oldest first — real attachments
// and file-type entity references combined into one normalized list
// ({id, mimeType, fileName, sizeBytes, isEntityRef}). This is the "whole
// chat" ordering behind the conversation-wide media carousel (opening any
// file inline pages through every file in the chat, not just siblings in
// that one message — see ChatAttachmentViewer.jsx) and behind the
// Archivos/Media gallery view (ChatFilesGallery.jsx uses the same shape).
export function buildAllAttachments(messages) {
  if (!messages?.length) return [];
  const result = [];
  for (const msg of [...messages].reverse()) {
    for (const att of (msg.attachments ?? [])) {
      result.push({ ...att, createdAt: msg.created_at, isEntityRef: false });
    }
    for (const ref of (msg.metadata?.entityRefs ?? [])) {
      if (ref.entityType !== "file") continue;
      result.push({
        id: ref.recordId,
        mimeType: ref.mimeType,
        fileName: ref.title,
        sizeBytes: ref.sizeBytes,
        createdAt: msg.created_at,
        url: null,
        isEntityRef: true,
      });
    }
  }
  return result;
}

export function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Plain `<a download href={signedUrl}>` silently ignores the `download`
// attribute for cross-origin URLs (every Supabase Storage signed URL is
// cross-origin from the app's own origin) — the browser just navigates
// there instead, which for a PDF means it opens in a new tab/window rather
// than saving to disk. Fetching the bytes first and downloading via a
// same-origin blob: URL is what actually forces a save prompt.
export async function downloadViaBlob(url, filename) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download fetch failed: ${res.status}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename ?? "archivo";
    a.click();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
