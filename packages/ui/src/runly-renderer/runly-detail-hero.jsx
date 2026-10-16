// Hero glue for RunlyDetail's opt-in presentation layer: resolves the hero image
// signed URL client-side and composes DetailHero + StatStrip. Kept out of
// RunlyDetail.jsx to keep that file under the repo file-size budget.
import { useCallback, useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { useCopyValue } from "../hooks/useCopyValue.js";
import { Badge } from "../components/Badge.jsx";
import { Card } from "../components/Card.jsx";
import { DetailHero } from "../components/DetailHero.jsx";
import { CopyOnDoubleClick } from "../components/CopyOnDoubleClick.jsx";
import { StatStrip } from "../components/StatStrip.jsx";
import { AdvancedFileViewer } from "../components/AdvancedFileViewer.jsx";
import { replacePathTokens } from "./detail-presentation.js";
import { buildApiHeaders } from "../lib/apiHeaders.js";

// KPI value for identifiers (serial / asset number): optional monospace
// `prominent` text, a `copyable` button and a muted `emptyLabel` placeholder.
function KpiIdentifierValue({ item }) {
  const copy = useCopyValue();
  const raw = item.rawValue;
  const empty = raw === null || raw === undefined || String(raw).trim() === "";
  if (empty) {
    return item.emptyLabel ? (
      <span className="text-xs font-normal italic text-[hsl(var(--muted-foreground))]">{item.emptyLabel}</span>
    ) : (
      "—"
    );
  }
  const value = String(raw);
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <CopyOnDoubleClick text={value} className={item.prominent ? "truncate font-mono text-base font-semibold" : "truncate"}>
        {value}
      </CopyOnDoubleClick>
      {item.copyable ? (
        <button
          type="button"
          onClick={() => void copy(value)}
          className="shrink-0 rounded p-0.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label={`Copiar ${item.label}`}
          title="Copiar"
        >
          <Copy className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

function joinUrl(baseUrl, apiPath) {
  const base = String(baseUrl ?? "")
    .trim()
    .replace(/\/+$/, "");
  const path = String(apiPath ?? "").trim();
  if (!path) return base;
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === "object") {
    return extractArrayPayload(payload.data);
  }
  return [];
}

// `pathTemplate` lets RME3 modules resolve through their own module-scoped
// route (`/<slug>/<entities>/files/:id/signed-url`) instead of /files.
// `variant` ("thumb" | "card" | "preview" | ...): resized copy served by the
// storage image proxy; omitted, the original file.
export async function fetchSignedUrl(apiBaseUrl, token, fileAssetId, companyId = null, pathTemplate = "/files/:id/signed-url", variant = null) {
  if (!fileAssetId) return null;
  const base = String(pathTemplate ?? "/files/:id/signed-url").replace(":id", encodeURIComponent(fileAssetId));
  const path = variant ? `${base}${base.includes("?") ? "&" : "?"}variant=${encodeURIComponent(variant)}` : base;
  try {
    const res = await fetch(
      joinUrl(apiBaseUrl, path),
      { headers: buildApiHeaders(token, companyId) },
    );
    if (!res.ok) return null;
    const payload = parseJsonSafe(await res.text());
    return payload?.data?.signedUrl ?? payload?.data?.url ?? null;
  } catch {
    return null;
  }
}

// A user account's avatar is not a company-scoped file entity (see
// files-service.js's ALLOWED_FILE_ENTITY_TYPES), so it can't be resolved
// through fetchSignedUrl even when you know its FileAsset id — it needs
// this dedicated, permission-gated-by-user-id route instead.
// `variant` ("thumb" | "card" | "full"); omitted, the API serves "full".
export async function fetchUserAvatarSignedUrl(apiBaseUrl, token, userId, companyId = null, variant = null) {
  if (!userId) return null;
  const query = variant ? `?variant=${encodeURIComponent(variant)}` : "";
  try {
    const res = await fetch(
      joinUrl(apiBaseUrl, `/identity/users/${encodeURIComponent(userId)}/avatar/signed-url${query}`),
      { headers: buildApiHeaders(token, companyId) },
    );
    if (!res.ok) return null;
    const payload = parseJsonSafe(await res.text());
    return payload?.data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

// Every image attached to a record, in list order, shaped for AdvancedFileViewer.
export async function fetchImageFiles(apiBaseUrl, token, docsPath, recordId, companyId = null) {
  if (!docsPath || !recordId) return [];
  try {
    const path = replacePathTokens(docsPath, { id: recordId });
    const res = await fetch(joinUrl(apiBaseUrl, path), { headers: buildApiHeaders(token, companyId) });
    if (!res.ok) return [];
    return extractArrayPayload(parseJsonSafe(await res.text()))
      .map((item) => ({
        id: item.id ?? item.fileAssetId ?? item.file_asset_id,
        fileAssetId: item.fileAssetId ?? item.file_asset_id,
        originalName: item?.fileAsset?.originalName ?? item?.file_asset?.originalName ?? item?.label ?? "Imagen",
        mimeType: item?.fileAsset?.mimeType ?? item?.file_asset?.mimeType ?? item?.mimeType ?? "",
        sizeBytes: item?.fileAsset?.sizeBytes ?? item?.file_asset?.sizeBytes ?? null,
      }))
      .filter((file) => file.fileAssetId && String(file.mimeType).toLowerCase().startsWith("image/"));
  } catch {
    return [];
  }
}

export async function fetchFirstImageAssetId(apiBaseUrl, token, docsPath, recordId, companyId = null) {
  if (!docsPath || !recordId) return null;
  try {
    const path = replacePathTokens(docsPath, { id: recordId });
    const res = await fetch(joinUrl(apiBaseUrl, path), {
      headers: buildApiHeaders(token, companyId),
    });
    if (!res.ok) return null;
    const rows = extractArrayPayload(parseJsonSafe(await res.text()));
    const images = rows.filter((row) =>
      String(row?.fileAsset?.mimeType ?? row?.file_asset?.mimeType ?? row?.mimeType ?? "")
        .toLowerCase()
        .startsWith("image/"),
    );
    // Prefer the attachment explicitly marked as cover (AttachmentsPanel's
    // star action); fall back to the first image if none is marked yet.
    const image = images.find((row) => row?.isCover === true || row?.is_cover === true) ?? images[0];
    return image?.fileAssetId ?? image?.file_asset_id ?? null;
  } catch {
    return null;
  }
}

export function initialsFromName(name) {
  const full = String(name ?? "").trim();
  if (!full) return "--";
  const words = full.split(/\s+/).filter(Boolean);
  const a = words[0]?.charAt(0) ?? "";
  const b = words.length > 1 ? (words[1]?.charAt(0) ?? "") : "";
  return `${a}${b}`.toUpperCase() || "--";
}

function HeroStatus({ heroModel, data, renderValue }) {
  const { statusValue, statusMap, statusOptions } = heroModel;
  if (statusValue === null || statusValue === undefined || statusValue === "") {
    return null;
  }
  if (statusOptions) {
    return renderValue({ type: "select", options: statusOptions }, statusValue, data);
  }
  if (statusMap) {
    const key = String(statusValue);
    const label = statusMap[key] ?? key;
    const positive = key === "true" || key === "active";
    return <Badge variant={positive ? "success" : "destructive"}>{label}</Badge>;
  }
  return renderValue({ type: "text" }, statusValue, data);
}

// `renderValue` is injected by RunlyDetail so the two files share one formatter.
export function HeroContainer({
  heroModel,
  kpiItems,
  data,
  apiBaseUrl,
  token,
  companyId = null,
  actions,
  renderValue,
  copyOnDoubleClick = false,
}) {
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(
    Boolean(heroModel.imageAssetId || heroModel.imageDocsPath),
  );
  // Set for an "own" resolvable FileAsset (imageField/imageDocsPath).
  const [ownAssetId, setOwnAssetId] = useState(null);
  // Set when the hero shows a user avatar fallback — opened in the viewer
  // through the dedicated avatar signed-url route (full variant).
  const [avatarUserId, setAvatarUserId] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // All the record's photos, loaded when the cover is clicked.
  const [viewerFiles, setViewerFiles] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const viewerAssetId = ownAssetId ?? (avatarUserId ? `user-avatar-${avatarUserId}` : null);
  const resolveViewerUrl = useCallback(
    () =>
      ownAssetId
        ? fetchSignedUrl(apiBaseUrl, token, ownAssetId, companyId, heroModel.signedUrlPath ?? undefined)
        : fetchUserAvatarSignedUrl(apiBaseUrl, token, avatarUserId, companyId, "full"),
    [ownAssetId, avatarUserId, apiBaseUrl, token, companyId, heroModel.signedUrlPath],
  );

  const resolveFileUrl = useCallback(
    (file) => fetchSignedUrl(apiBaseUrl, token, file?.fileAssetId, companyId, heroModel.signedUrlPath ?? undefined),
    [apiBaseUrl, token, companyId, heroModel.signedUrlPath],
  );

  // Opens the viewer on the cover; when the record has more photos they are
  // loaded first so the viewer can move through all of them.
  const openViewer = useCallback(async () => {
    setViewerFiles(null);
    if (ownAssetId && heroModel.imageDocsPath && data?.id) {
      const files = await fetchImageFiles(apiBaseUrl, token, heroModel.imageDocsPath, data.id, companyId);
      if (files.length > 1) {
        setViewerFiles(files);
        setViewerIndex(Math.max(0, files.findIndex((file) => file.fileAssetId === ownAssetId)));
      }
    }
    setViewerOpen(true);
  }, [ownAssetId, heroModel.imageDocsPath, data?.id, apiBaseUrl, token, companyId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let assetId = heroModel.imageAssetId;
      if (!assetId && heroModel.imageDocsPath) {
        assetId = await fetchFirstImageAssetId(
          apiBaseUrl,
          token,
          heroModel.imageDocsPath,
          data?.id,
          companyId,
        );
      }
      if (!assetId) {
        if (heroModel.avatarUserId) {
          // Progressive: paint the small "card" variant first, then swap in
          // the full-resolution photo once the browser has fully loaded it.
          const userId = heroModel.avatarUserId;
          const cardUrl = await fetchUserAvatarSignedUrl(apiBaseUrl, token, userId, companyId, "card");
          if (cancelled) return;
          setImageUrl(cardUrl);
          setOwnAssetId(null);
          setAvatarUserId(cardUrl ? userId : null);
          setImageLoading(false);
          if (!cardUrl) return;
          const fullUrl = await fetchUserAvatarSignedUrl(apiBaseUrl, token, userId, companyId, "full");
          if (cancelled || !fullUrl) return;
          const img = new Image();
          img.onload = () => {
            if (!cancelled) setImageUrl(fullUrl);
          };
          img.src = fullUrl;
          return;
        }
        setAvatarUserId(null);
        if (!cancelled) {
          setImageUrl(null);
          setOwnAssetId(null);
          setImageLoading(false);
        }
        return;
      }
      // Progressive: paint the tiny "card" variant first, then swap in the
      // "preview" size once fully loaded; the original only loads in the viewer.
      const pathTemplate = heroModel.signedUrlPath ?? undefined;
      const cardUrl = await fetchSignedUrl(apiBaseUrl, token, assetId, companyId, pathTemplate, "card");
      if (cancelled) return;
      setImageUrl(cardUrl);
      setOwnAssetId(assetId);
      setAvatarUserId(null);
      setImageLoading(false);
      const previewUrl = await fetchSignedUrl(apiBaseUrl, token, assetId, companyId, pathTemplate, "preview");
      if (cancelled || !previewUrl) return;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setImageUrl(previewUrl);
      };
      img.src = previewUrl;
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    apiBaseUrl,
    token,
    companyId,
    heroModel.imageAssetId,
    heroModel.imageDocsPath,
    heroModel.avatarUserId,
    data?.id,
  ]);

  const kpiRenderItems = kpiItems.map((item) => ({
    key: item.key,
    label: item.label,
    icon: item.icon,
    href: item.href,
    value:
      item.prominent || item.copyable || item.emptyLabel ? (
        <KpiIdentifierValue item={item} />
      ) : copyOnDoubleClick ? (
        <CopyOnDoubleClick>{renderValue({ type: item.type, options: item.options, emphasis: item.emphasis }, item.rawValue, data)}</CopyOnDoubleClick>
      ) : (
        renderValue({ type: item.type, options: item.options, emphasis: item.emphasis }, item.rawValue, data)
      ),
  }));

  return (
    <Card
      variant="shell-flat"
      className="overflow-hidden"
      style={
        heroModel.accentHex
          ? {
              backgroundImage: `radial-gradient(circle at 15% 20%, color-mix(in srgb, ${heroModel.accentHex} 12%, transparent), transparent 60%)`,
            }
          : undefined
      }
    >
      <DetailHero
        bare
        title={heroModel.title}
        subtitle={heroModel.subtitle}
        statusNode={
          <HeroStatus heroModel={heroModel} data={data} renderValue={renderValue} />
        }
        imageUrl={imageUrl}
        imageLoading={imageLoading}
        fallbackIcon={heroModel.fallbackIcon}
        accentHex={heroModel.accentHex}
        chips={heroModel.chips}
        actions={actions}
        copyOnDoubleClick={copyOnDoubleClick}
        onImageClick={viewerAssetId ? openViewer : null}
      />
      {kpiRenderItems.length > 0 ? <StatStrip bare items={kpiRenderItems} /> : null}
      {viewerAssetId ? (
        <AdvancedFileViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          files={viewerFiles ?? [{ id: viewerAssetId, fileAssetId: ownAssetId, originalName: heroModel.title || "Imagen", mimeType: "image/*" }]}
          activeIndex={viewerFiles ? viewerIndex : 0}
          onIndexChange={viewerFiles ? setViewerIndex : () => {}}
          onResolveSignedUrl={viewerFiles ? resolveFileUrl : resolveViewerUrl}
        />
      ) : null}
    </Card>
  );
}
