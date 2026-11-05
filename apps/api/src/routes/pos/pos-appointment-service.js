import { PosServiceError, requireCompanyId, writeAudit } from "./service-helpers.js";

const OPEN = ["SCHEDULED", "ARRIVED"];

// Appointments for service businesses. Service names and prices are read from
// the catalog (never trusted from the client); the price shown is a reference,
// Caja charges the current catalog price.
export function createPosAppointmentService({ prisma }) {
  async function find(companyId, id) {
    const row = await prisma.posAppointment.findFirst({ where: { id, companyId } });
    if (!row) throw new PosServiceError("Cita no encontrada.", 404);
    return row;
  }

  async function outlet(companyId, outletId) {
    const row = await prisma.posOutlet.findFirst({ where: { id: outletId, companyId, enabled: true } });
    if (!row) throw new PosServiceError("Sucursal no encontrada.", 404);
    return row;
  }

  async function resolveItems(companyId, items = []) {
    const out = [];
    for (const item of items) {
      const product = await prisma.catalogProduct.findFirst({ where: { id: item.productId, companyId, enabled: true } });
      if (!product) throw new PosServiceError("Uno de los servicios ya no está en el catálogo.", 400);
      const variant = item.variantId
        ? await prisma.catalogProductVariant.findFirst({ where: { id: item.variantId, productId: product.id, companyId, enabled: true } })
        : null;
      if (item.variantId && !variant) throw new PosServiceError("La opción elegida ya no existe.", 400);
      out.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        name: variant ? `${product.name} (${Object.values(variant.optionValues ?? {}).join(" / ")})` : product.name,
        price: Number(variant?.price ?? product.price).toFixed(2),
      });
    }
    return out;
  }

  async function assertContact(companyId, contactId) {
    if (!contactId) return;
    const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId } });
    if (!contact) throw new PosServiceError("Contacto no encontrado.", 404);
  }

  async function list({ companyId, from, to, outletId }) {
    const scoped = requireCompanyId(companyId);
    return prisma.posAppointment.findMany({
      where: { companyId: scoped, startsAt: { gte: new Date(from), lt: new Date(to) }, ...(outletId ? { outletId } : {}) },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    });
  }

  async function get({ companyId, id }) {
    return find(requireCompanyId(companyId), id);
  }

  async function create({ companyId, actorId, data }) {
    const scoped = requireCompanyId(companyId);
    await outlet(scoped, data.outletId);
    await assertContact(scoped, data.contactId);
    const items = await resolveItems(scoped, data.items);
    const row = await prisma.posAppointment.create({
      data: {
        companyId: scoped, outletId: data.outletId, contactId: data.contactId ?? null,
        customerName: data.customerName.trim(), customerPhone: data.customerPhone?.trim() || null,
        startsAt: new Date(data.startsAt), durationMinutes: data.durationMinutes ?? 60,
        items, notes: data.notes?.trim() || null, createdById: actorId,
      },
    });
    await writeAudit(prisma, { actorId, entityType: "PosAppointment", entityId: row.id, action: "pos.appointment.create", after: row });
    return row;
  }

  async function update({ companyId, actorId, id, data }) {
    const scoped = requireCompanyId(companyId);
    const before = await find(scoped, id);
    if (!OPEN.includes(before.status)) throw new PosServiceError("Solo se editan citas pendientes.", 409);
    if (data.outletId) await outlet(scoped, data.outletId);
    if (data.contactId) await assertContact(scoped, data.contactId);
    const row = await prisma.posAppointment.update({
      where: { id },
      data: {
        ...(data.outletId ? { outletId: data.outletId } : {}),
        ...(data.contactId !== undefined ? { contactId: data.contactId } : {}),
        ...(data.customerName ? { customerName: data.customerName.trim() } : {}),
        ...(data.customerPhone !== undefined ? { customerPhone: data.customerPhone?.trim() || null } : {}),
        ...(data.startsAt ? { startsAt: new Date(data.startsAt) } : {}),
        ...(data.durationMinutes ? { durationMinutes: data.durationMinutes } : {}),
        ...(data.items ? { items: await resolveItems(scoped, data.items) } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      },
    });
    await writeAudit(prisma, { actorId, entityType: "PosAppointment", entityId: id, action: "pos.appointment.update", before, after: row });
    return row;
  }

  // COMPLETED needs the paid POS order that charged it.
  async function setStatus({ companyId, actorId, id, status, orderId }) {
    const scoped = requireCompanyId(companyId);
    const before = await find(scoped, id);
    if (before.status === status) return before;
    if (!OPEN.includes(before.status)) throw new PosServiceError("La cita ya fue cerrada.", 409);
    if (status === "COMPLETED") {
      const order = orderId ? await prisma.posOrder.findFirst({ where: { id: orderId, companyId: scoped } }) : null;
      if (!order || order.status !== "PAID") throw new PosServiceError("La cita se completa al cobrarla en Caja.", 409);
    }
    const row = await prisma.posAppointment.update({
      where: { id },
      data: { status, ...(status === "COMPLETED" ? { orderId } : {}) },
    });
    await writeAudit(prisma, { actorId, entityType: "PosAppointment", entityId: id, action: "pos.appointment.status", before, after: row });
    return row;
  }

  return { list, get, create, update, setStatus };
}
