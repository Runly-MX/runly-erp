// Folder helpers for the runly.files explorer: the tree comes flat from
// GET /files/folders ({ folders, modules }); these build paths and labels.

export const ROOT_FOLDER = "root";

const MODULE_LABELS = {
  files: "Archivos",
  company: "Empresa",
  contacts: "Contactos",
  hr: "Personal",
  projects: "Proyectos",
  inventory: "Inventario",
  purchases: "Compras",
  fleet: "Flota",
  growth: "Ventas",
  pos: "Punto de venta",
  canvas: "Canvas",
  calendar: "Calendario",
  chat: "Chat",
  ledger: "Libro contable",
  pfm: "Finanzas",
  documents: "Documentos",
  identity: "Usuarios",
  website: "Sitio web",
  notes: "Notas",
  storefront: "Tienda",
  catalog: "Catálogo",
  attendance: "Asistencia",
};

export function moduleLabel(moduleKey) {
  const short = String(moduleKey ?? "").replace(/^(runly|atlas|custom)\./, "");
  if (MODULE_LABELS[short]) return MODULE_LABELS[short];
  const text = short.replace(/[._-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Adjuntos";
}

export function childrenOf(folders, parentId = null) {
  return folders.filter((f) => (f.parentId ?? null) === parentId);
}

// Ancestors of a folder, root first, the folder itself last. [] if unknown.
export function folderPath(folders, folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = [];
  for (let cursor = byId.get(folderId); cursor && path.length < 12; cursor = cursor.parentId ? byId.get(cursor.parentId) : null) {
    path.unshift(cursor);
  }
  return path;
}

export function descendantIds(folders, folderId) {
  const out = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

// Public page path inside the SPA (honours VITE_BASE_PATH, e.g. /app/).
export function publicFolderPath(linkToken) {
  const base = String(import.meta.env?.BASE_URL || "/").replace(/\/?$/, "/");
  return `${base}p/folders/${linkToken}`;
}
