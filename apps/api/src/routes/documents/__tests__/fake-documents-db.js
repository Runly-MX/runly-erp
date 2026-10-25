// In-memory prisma + file store doubles for the documents engine tests.
let counter = 0;
const nextId = () => `00000000-0000-7000-8000-${String(++counter).padStart(12, "0")}`;

function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "NOT") return !matches(row, expected);
    if (key === "OR") return expected.some((clause) => matches(row, clause));
    if (expected && typeof expected === "object" && !(expected instanceof Date) && Array.isArray(expected.in)) return expected.in.includes(row[key]);
    if (expected && typeof expected === "object" && !(expected instanceof Date) && "not" in expected) return row[key] !== expected.not;
    return row[key] === expected;
  });
}

export function table(defaults = {}) {
  const rows = [];
  return {
    rows,
    async create({ data }) {
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...defaults, ...data };
      rows.push(row);
      return { ...row };
    },
    async findFirst({ where } = {}) {
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    async findMany({ where, orderBy, take } = {}) {
      let found = rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
      const order = Array.isArray(orderBy) ? orderBy[orderBy.length - 1] : orderBy;
      if (order?.versionNumber === "desc") found.sort((a, b) => b.versionNumber - a.versionNumber);
      if (take) found = found.slice(0, take);
      return found;
    },
    async count({ where } = {}) {
      return rows.filter((r) => matches(r, where)).length;
    },
    async update({ where, data }) {
      const row = rows.find((r) => matches(r, where));
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    async updateMany({ where, data }) {
      const found = rows.filter((r) => matches(r, where));
      found.forEach((r) => Object.assign(r, data));
      return { count: found.length };
    },
  };
}

export function createFakePrisma() {
  const prisma = {
    documentTemplate: table({ enabled: true, isDefault: false, scopeKey: null, publishedVersionId: null }),
    documentTemplateVersion: table({ blocks: [], placeholders: [], mapping: {}, layout: null, fileAssetId: null }),
    generatedDocument: table({ metadata: null }),
    fileAsset: table({ enabled: true, metadata: {} }),
    auditLog: table(),
  };
  prisma.$transaction = async (fn) => fn(prisma);
  return prisma;
}

export function createFakeFiles(prisma) {
  const blobs = new Map();
  return {
    blobs,
    async store({ companyId, uploadedById, buffer, fileName, mimeType, entityType }) {
      const asset = await prisma.fileAsset.create({
        data: { entityId: companyId, moduleKey: "runly.documents", originalName: fileName, mimeType, entityType, uploadedById, sizeBytes: buffer.length },
      });
      blobs.set(asset.id, buffer);
      return asset;
    },
    async findAsset(companyId, id) {
      return id ? prisma.fileAsset.findFirst({ where: { id, entityId: companyId } }) : null;
    },
    async read(asset) {
      return blobs.get(asset.id);
    },
    async signedUrl(asset) {
      return { url: `https://files.example/${asset.id}`, expiresIn: 3600 };
    },
  };
}

export function fileOf(buffer, name) {
  return new File([buffer], name);
}
