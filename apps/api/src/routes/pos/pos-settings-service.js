import { PosServiceError, requireCompanyId, writeAudit } from "./service-helpers.js";

function trimString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanData(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, trimString(value)]),
  );
}

const DEFAULT_PAYMENT_METHODS = [
  { name: "Efectivo", code: "CASH", kind: "CASH", requiresReference: false },
  { name: "Tarjeta", code: "CARD", kind: "CARD", requiresReference: false },
  { name: "Transferencia", code: "TRANSFER", kind: "TRANSFER", requiresReference: false },
];

export function createPosSettingsService({ prisma }) {
  async function getSettings({ companyId }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const existing = await prisma.posSettings.findUnique({
      where: { companyId: scopedCompanyId },
    });
    if (existing) return existing;

    return prisma.posSettings.create({
      data: {
        companyId: scopedCompanyId,
        mode: "RESTAURANT",
        currency: "MXN",
        defaultTaxRate: 16,
      },
    });
  }

  async function updateSettings({ companyId, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const before = await getSettings({ companyId: scopedCompanyId });
    const clean = cleanData(data);
    const modeChanged = Boolean(clean.mode);
    // A retail-only outlet can no longer charge table accounts: close them first.
    if (clean.mode === "RETAIL" && before.mode !== "RETAIL") {
      const openTables = await prisma.posOrder.count({
        where: {
          companyId: scopedCompanyId,
          experience: "RESTAURANT",
          status: { in: ["DRAFT", "OPEN", "SENT", "PARTIALLY_SERVED", "SERVED"] },
        },
      });
      if (openTables) {
        throw new PosServiceError(
          `Hay ${openTables} cuenta(s) de mesa abiertas. Cóbralas o cancélalas antes de cambiar a Tienda.`,
          409,
        );
      }
    }
    // The business mode is the only mode the admin edits: every outlet follows it.
    const [updated] = await prisma.$transaction([
      prisma.posSettings.update({ where: { companyId: scopedCompanyId }, data: clean }),
      ...(modeChanged
        ? [prisma.posOutlet.updateMany({ where: { companyId: scopedCompanyId }, data: { mode: clean.mode } })]
        : []),
    ]);
    await writeAudit(prisma, {
      actorId,
      entityType: "PosSettings",
      entityId: updated.id,
      action: "pos.settings.update",
      before,
      after: updated,
    });
    return updated;
  }

  async function listOutlets({ companyId }) {
    const scopedCompanyId = requireCompanyId(companyId);
    return prisma.posOutlet.findMany({
      where: { companyId: scopedCompanyId },
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
    });
  }

  async function createOutlet({ companyId, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const { mode } = await getSettings({ companyId: scopedCompanyId });
    const outlet = await prisma.posOutlet.create({
      data: {
        companyId: scopedCompanyId,
        mode,
        ...cleanData(data),
      },
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosOutlet",
      entityId: outlet.id,
      action: "pos.outlet.create",
      after: outlet,
    });
    return outlet;
  }

  async function updateOutlet({ companyId, id, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const before = await prisma.posOutlet.findFirst({
      where: { id, companyId: scopedCompanyId },
    });
    if (!before) throw new PosServiceError("Sucursal POS no encontrada.", 404);

    const updated = await prisma.posOutlet.update({
      where: { id },
      data: cleanData(data),
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosOutlet",
      entityId: updated.id,
      action: "pos.outlet.update",
      before,
      after: updated,
    });
    return updated;
  }

  async function listTerminals({ companyId }) {
    const scopedCompanyId = requireCompanyId(companyId);
    return prisma.posTerminal.findMany({
      where: { companyId: scopedCompanyId },
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
    });
  }

  async function assertOutletInCompany({ companyId, outletId }) {
    const outlet = await prisma.posOutlet.findFirst({
      where: { id: outletId, companyId },
    });
    if (!outlet) throw new PosServiceError("Sucursal POS no encontrada.", 404);
    return outlet;
  }

  async function createTerminal({ companyId, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const clean = cleanData(data);
    await assertOutletInCompany({ companyId: scopedCompanyId, outletId: clean.outletId });
    const terminal = await prisma.posTerminal.create({
      data: {
        companyId: scopedCompanyId,
        ...clean,
      },
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosTerminal",
      entityId: terminal.id,
      action: "pos.terminal.create",
      after: terminal,
    });
    return terminal;
  }

  async function updateTerminal({ companyId, id, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const before = await prisma.posTerminal.findFirst({
      where: { id, companyId: scopedCompanyId },
    });
    if (!before) throw new PosServiceError("Terminal POS no encontrada.", 404);

    const clean = cleanData(data);
    if (clean.outletId) {
      await assertOutletInCompany({ companyId: scopedCompanyId, outletId: clean.outletId });
    }

    const updated = await prisma.posTerminal.update({
      where: { id },
      data: clean,
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosTerminal",
      entityId: updated.id,
      action: "pos.terminal.update",
      before,
      after: updated,
    });
    return updated;
  }

  async function listPaymentMethods({ companyId }) {
    const scopedCompanyId = requireCompanyId(companyId);
    return prisma.posPaymentMethod.findMany({
      where: { companyId: scopedCompanyId },
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
    });
  }

  async function createPaymentMethod({ companyId, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const method = await prisma.posPaymentMethod.create({
      data: { companyId: scopedCompanyId, ...cleanData(data) },
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosPaymentMethod",
      entityId: method.id,
      action: "pos.payment_method.create",
      after: method,
    });
    return method;
  }

  async function updatePaymentMethod({ companyId, id, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const before = await prisma.posPaymentMethod.findFirst({
      where: { id, companyId: scopedCompanyId },
    });
    if (!before) throw new PosServiceError("Método de pago no encontrado.", 404);
    const updated = await prisma.posPaymentMethod.update({
      where: { id },
      data: cleanData(data),
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosPaymentMethod",
      entityId: updated.id,
      action: "pos.payment_method.update",
      before,
      after: updated,
    });
    return updated;
  }

  // First run from the register: business mode, one outlet, one register and the
  // usual payment methods in one step. Only while the company has no outlets.
  async function setup({ companyId, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    await getSettings({ companyId: scopedCompanyId });
    if (await prisma.posOutlet.count({ where: { companyId: scopedCompanyId } })) {
      throw new PosServiceError("El punto de venta ya está configurado. Recarga la pantalla.", 409);
    }
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.posSettings.update({ where: { companyId: scopedCompanyId }, data: { mode: data.mode } });
      const outlet = await tx.posOutlet.create({ data: { companyId: scopedCompanyId, name: data.outletName.trim(), mode: data.mode } });
      const terminal = await tx.posTerminal.create({ data: { companyId: scopedCompanyId, outletId: outlet.id, name: data.terminalName.trim() } });
      const existing = new Set((await tx.posPaymentMethod.findMany({ where: { companyId: scopedCompanyId } })).map((m) => m.code));
      const methods = DEFAULT_PAYMENT_METHODS.filter((m) => !existing.has(m.code));
      if (methods.length) await tx.posPaymentMethod.createMany({ data: methods.map((m) => ({ ...m, companyId: scopedCompanyId })) });
      return { settings, outlet, terminal };
    });
    await writeAudit(prisma, { actorId, entityType: "PosSettings", entityId: result.settings.id, action: "pos.setup.create", after: result });
    return result;
  }

  return {
    setup,
    getSettings,
    updateSettings,
    listOutlets,
    createOutlet,
    updateOutlet,
    listTerminals,
    createTerminal,
    updateTerminal,
    listPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
  };
}
