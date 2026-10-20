// Tiny in-memory Prisma double for the supplier-portal tests: tables with generic where/include/upsert
// support and the relations the guest code uses. Not a general Prisma emulator.
let seq = 0;
export const uid = () => `01900000-0000-7000-8000-${String(++seq).padStart(12, '0')}`;

const RELATIONS = {
  guest: ['invGuest', 'guestId'],
  invite: ['invGuestInvite', 'inviteId'],
  area: ['invArea', 'areaId'],
  category: ['invCategory', 'categoryId'],
  brand: ['invBrand', 'brandId'],
  location: ['invLocation', 'locationId'],
  condition: ['invCondition', 'conditionId'],
  fileAsset: ['fileAsset', 'fileAssetId'],
};

export function createFakeDb(seed = {}) {
  const db = {};
  const names = ['invGuest', 'invGuestInvite', 'invGuestSession', 'invAreaMember', 'invArea', 'invItem', 'invItemFile', 'contact', 'company', 'fileAsset', 'auditLog', 'invCategory', 'invBrand', 'invLocation', 'invCondition', 'invCustomField', 'invItemAdminEvent'];
  const rowsOf = (name) => (db[name] ??= { rows: [] }).rows;
  for (const name of names) db[name] = { rows: [...(seed[name] ?? [])] };

  const related = (row, key) => {
    const [tbl, fk] = RELATIONS[key] ?? [];
    return tbl ? rowsOf(tbl).find((r) => r.id === row[fk]) ?? null : undefined;
  };
  const matches = (row, where = {}) => Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'AND') return cond.every((w) => matches(row, w));
    if (key === 'OR') return cond.some((w) => matches(row, w));
    if (RELATIONS[key]) { const rel = related(row, key); return rel ? matches(rel, cond) : false; }
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(row[key]);
      if ('not' in cond) return row[key] !== cond.not && !(cond.not === null && row[key] == null);
      if ('contains' in cond) return String(row[key] ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
      if ('equals' in cond) return String(row[key] ?? '').toLowerCase() === String(cond.equals).toLowerCase();
      if ('gt' in cond) return row[key] > cond.gt;
      return true;
    }
    return (row[key] ?? null) === cond;
  });
  const flat = (where = {}) => Object.fromEntries(Object.entries(where).flatMap(([k, v]) => (/_/.test(k) && v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !('in' in v) && !('not' in v) ? Object.entries(v) : [[k, v]])));
  const withInclude = (row, include) => {
    if (!row || !include) return row;
    const out = { ...row };
    for (const key of Object.keys(include)) if (RELATIONS[key]) out[key] = related(row, key);
    return out;
  };

  for (const name of names) {
    const t = db[name];
    const rows = t.rows;
    Object.assign(t, {
      findFirst: async ({ where, include, orderBy } = {}) => withInclude(sorted(rows.filter((r) => matches(r, flat(where))), orderBy)[0] ?? null, include),
      findUnique: async ({ where, include }) => withInclude(rows.find((r) => matches(r, flat(where))) ?? null, include),
      findMany: async ({ where, include, orderBy, take, skip } = {}) => sorted(rows.filter((r) => matches(r, flat(where))), orderBy).slice(skip ?? 0, (skip ?? 0) + (take ?? 1e9)).map((r) => withInclude(r, include)),
      count: async ({ where } = {}) => rows.filter((r) => matches(r, flat(where))).length,
      create: async ({ data, include }) => {
        const row = { id: uid(), enabled: true, createdAt: new Date(), revokedAt: null, usedAt: null, sentAt: null, lastSeenAt: null, ...data };
        rows.push(row);
        return withInclude(row, include);
      },
      update: async ({ where, data, include }) => {
        const row = rows.find((r) => matches(r, flat(where)));
        if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
        Object.assign(row, data);
        return withInclude(row, include);
      },
      delete: async ({ where }) => { const i = rows.findIndex((r) => matches(r, flat(where))); if (i < 0) throw new Error('not found'); return rows.splice(i, 1)[0]; },
      updateMany: async ({ where, data }) => { const hit = rows.filter((r) => matches(r, flat(where))); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
      deleteMany: async ({ where }) => { let count = 0; for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], flat(where))) { rows.splice(i, 1); count += 1; } return { count }; },
      upsert: async ({ where, create, update }) => {
        const row = rows.find((r) => matches(r, flat(where)));
        if (row) return Object.assign(row, update);
        const made = { id: uid(), createdAt: new Date(), ...create };
        rows.push(made);
        return made;
      },
    });
  }
  function sorted(list, orderBy) {
    if (!orderBy) return list;
    const [[key, dir]] = Object.entries(Array.isArray(orderBy) ? orderBy[0] : orderBy);
    return [...list].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  let folioCounter = 0;
  db.$queryRaw = async () => [{ last_value: ++folioCounter }];
  db.$transaction = async (fn) => (typeof fn === 'function' ? fn(db) : Promise.all(fn));
  return db;
}
