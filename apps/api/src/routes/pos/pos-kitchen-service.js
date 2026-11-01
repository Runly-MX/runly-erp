import { PosServiceError, requireCompanyId, writeAudit } from "./service-helpers.js";
import {createPosScopeService} from './pos-scope-service.js';

function cleanData(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() || null : value,
      ]),
  );
}

async function getOrderInCompany(db, { companyId, orderId }) {
  const order = await db.posOrder.findFirst({ where: { id: orderId, companyId } });
  if (!order) throw new PosServiceError("Orden POS no encontrada.", 404);
  return order;
}

async function resolvePreparationConfig(db, { companyId, line }) {
  const config = await db.posProductConfig.findFirst({
    where: {
      companyId,
      productId: line.productId,
      ...(line.variantId ? { variantId: line.variantId } : { variantId: null }),
    },
  });
  if (!config) {
    return {
      requiresPreparation: true,
      stationId: line.preparationStationId ?? null,
    };
  }
  return {
    requiresPreparation: config.requiresPreparation !== false,
    stationId: config.stationId ?? line.preparationStationId ?? null,
  };
}

export function createPosKitchenService({ prisma }) {
  async function listStations({ companyId, outletId }) {
    const scopedCompanyId = requireCompanyId(companyId);
    return prisma.posKitchenStation.findMany({
      where: { companyId: scopedCompanyId, ...(outletId ? { outletId } : {}) },
      orderBy: { name: "asc" },
    });
  }

  async function createStation({ companyId, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    await createPosScopeService({prisma}).outlet(scopedCompanyId,data.outletId);
    const station = await prisma.posKitchenStation.create({
      data: {
        companyId: scopedCompanyId,
        ...cleanData(data),
      },
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosKitchenStation",
      entityId: station.id,
      action: "pos.station.create",
      after: station,
    });
    return station;
  }

  async function updateStation({ companyId, stationId, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const before = await prisma.posKitchenStation.findFirst({
      where: { id: stationId, companyId: scopedCompanyId },
    });
    if (!before) throw new PosServiceError("Estacion POS no encontrada.", 404);
    if(data.outletId&&data.outletId!==before.outletId)throw new PosServiceError('La estación conserva su sucursal; crea otra para una sucursal diferente.',409);
    const updated = await prisma.posKitchenStation.update({
      where: { id: stationId },
      data: cleanData(data),
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosKitchenStation",
      entityId: stationId,
      action: "pos.station.update",
      before,
      after: updated,
    });
    return updated;
  }

  async function sendOrderToKitchen({ companyId, orderId, actorId }) {
    const scopedCompanyId = requireCompanyId(companyId);
    return prisma.$transaction(async (tx) => {
      const order = await getOrderInCompany(tx, { companyId: scopedCompanyId, orderId });
      const lines = await tx.posOrderLine.findMany({ where: { orderId } });

      // If no stations are configured at all, skip routing — mark order SENT without tickets.
      // This supports simple restaurants that don't use a kitchen display system.
      const stationCount = await tx.posKitchenStation.count({ where: { companyId: scopedCompanyId } });
      if (stationCount === 0) {
        await tx.posOrder.update({ where: { id: orderId }, data: { status: "SENT" } });
        await writeAudit(tx, {
          actorId,
          entityType: "PosOrder",
          entityId: order.id,
          action: "pos.order.send_to_kitchen",
          after: { orderId, ticketsCount: 0, note: "no_stations_configured" },
        });
        return { orderId, tickets: [] };
      }

      // Stations exist — route lines to their assigned station
      const missingStationLineIds = [];
      const byStation = new Map();

      for (const line of lines) {
        const config = await resolvePreparationConfig(tx, { companyId: scopedCompanyId, line });
        if (!config.requiresPreparation) continue;
        if (!config.stationId) {
          missingStationLineIds.push(line.id);
          continue;
        }
        if (!byStation.has(config.stationId)) byStation.set(config.stationId, []);
        byStation.get(config.stationId).push(line);
      }

      if (missingStationLineIds.length > 0) {
        const outlet = await tx.posOutlet.findFirst({
          where: { id: order.outletId, companyId: scopedCompanyId },
        });
        if (outlet?.defaultStationId) {
          const fallbackStationId = outlet.defaultStationId;
          const fallbackLines = lines.filter((l) => missingStationLineIds.includes(l.id));
          if (!byStation.has(fallbackStationId)) byStation.set(fallbackStationId, []);
          byStation.get(fallbackStationId).push(...fallbackLines);
          missingStationLineIds.length = 0;
        }
      }

      if (missingStationLineIds.length > 0) {
        const missingNames = lines
          .filter((l) => missingStationLineIds.includes(l.id))
          .map((l) => l.productName ?? 'Producto desconocido')
        throw Object.assign(
          new PosServiceError(
            `Los siguientes productos no tienen estación de preparación asignada: ${missingNames.join(', ')}. Configúralos en POS → Configuración → Estaciones.`,
            400,
          ),
          { lineIds: missingStationLineIds },
        );
      }

      const tickets = [];
      for (const [stationId, stationLines] of byStation.entries()) {
        const ticket = await tx.posKitchenTicket.create({
          data: {
            companyId: scopedCompanyId,
            orderId,
            stationId,
            status: "PENDING",
          },
        });
        await tx.posKitchenTicketLine.createMany({
          data: stationLines.map((line) => ({
            ticketId: ticket.id,
            orderLineId: line.id,
            quantity: line.quantity,
            status: "PENDING",
            note: line.note ?? null,
          })),
        });
        tickets.push(ticket);
      }

      await tx.posOrder.update({ where: { id: orderId }, data: { status: "SENT" } });

      await writeAudit(tx, {
        actorId,
        entityType: "PosOrder",
        entityId: order.id,
        action: "pos.order.send_to_kitchen",
        after: { orderId, ticketsCount: tickets.length },
      });
      return { orderId, tickets };
    });
  }

  async function listTickets({ companyId, stationId, status }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const tickets = await prisma.posKitchenTicket.findMany({
      where: {
        companyId: scopedCompanyId,
        ...(stationId ? { stationId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { sentAt: "asc" },
      include: { lines: true },
    });

    const orderLineIds = tickets.flatMap((ticket) => (ticket.lines ?? []).map((line) => line.orderLineId));
    const modifierRows = orderLineIds.length
      ? await prisma.posOrderLineModifier.findMany({ where: { lineId: { in: orderLineIds } } })
      : [];
    const modifiersByLineId = new Map();
    for (const modifier of modifierRows) {
      if (!modifiersByLineId.has(modifier.lineId)) modifiersByLineId.set(modifier.lineId, []);
      modifiersByLineId.get(modifier.lineId).push({
        groupName: modifier.groupName,
        optionName: modifier.optionName,
      });
    }

    const orderLineRows = orderLineIds.length
      ? await prisma.posOrderLine.findMany({ where: { id: { in: orderLineIds } } })
      : [];
    const orderLineById = new Map(orderLineRows.map((row) => [row.id, row]));

    return tickets.map((ticket) => ({
      ...ticket,
      lines: (ticket.lines ?? []).map((line) => {
        const sourceLine = orderLineById.get(line.orderLineId);
        return {
          ...line,
          modifiers: modifiersByLineId.get(line.orderLineId) ?? [],
          orderLine: sourceLine
            ? { productName: sourceLine.productName, quantity: sourceLine.quantity }
            : null,
        };
      }),
    }));
  }

  async function getTicketInCompany({ companyId, ticketId }) {
    const ticket = await prisma.posKitchenTicket.findFirst({
      where: { id: ticketId, companyId },
    });
    if (!ticket) throw new PosServiceError("Ticket de cocina no encontrado.", 404);
    return ticket;
  }

  async function updateTicketStatus({ companyId, ticketId, actorId, status }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const before = await getTicketInCompany({ companyId: scopedCompanyId, ticketId });
    const timestampByStatus = {
      IN_PREPARATION: "startedAt",
      READY: "readyAt",
      DELIVERED: "deliveredAt",
    };
    const updated = await prisma.posKitchenTicket.update({
      where: { id: ticketId },
      data: {
        status,
        ...(timestampByStatus[status] ? { [timestampByStatus[status]]: new Date() } : {}),
      },
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosKitchenTicket",
      entityId: ticketId,
      action: "pos.kitchen_ticket.status.update",
      before,
      after: updated,
    });
    return updated;
  }

  async function updateTicketLineStatus({ companyId, ticketId, lineId, actorId, status }) {
    const scopedCompanyId = requireCompanyId(companyId);
    await getTicketInCompany({ companyId: scopedCompanyId, ticketId });
    const before = await prisma.posKitchenTicketLine.findFirst({
      where: { id: lineId, ticketId },
    });
    if (!before) throw new PosServiceError("Linea de ticket no encontrada.", 404);
    const updated = await prisma.posKitchenTicketLine.update({
      where: { id: lineId },
      data: { status },
    });
    await prisma.posOrderLine.update({
      where: { id: before.orderLineId },
      data: { kitchenStatus: status },
    });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosKitchenTicketLine",
      entityId: lineId,
      action: "pos.kitchen_ticket_line.status.update",
      before,
      after: updated,
    });
    return updated;
  }

  async function assertStationInCompany({ companyId, stationId }) {
    if (!stationId) return null;
    const station = await prisma.posKitchenStation.findFirst({
      where: { id: stationId, companyId },
    });
    if (!station) throw new PosServiceError("Estación de preparación no encontrada.", 404);
    return station;
  }

  async function listProductConfigs({ companyId }) {
    const scopedCompanyId = requireCompanyId(companyId);
    return prisma.posProductConfig.findMany({ where: { companyId: scopedCompanyId } });
  }

  async function updateProductConfig({ companyId, actorId, productId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const clean = cleanData(data);
    if (clean.stationId) {
      await assertStationInCompany({ companyId: scopedCompanyId, stationId: clean.stationId });
    }
    const before = await prisma.posProductConfig.findFirst({
      where: { companyId: scopedCompanyId, productId, variantId: null },
    });
    const updated = before
      ? await prisma.posProductConfig.update({ where: { id: before.id }, data: clean })
      : await prisma.posProductConfig.create({
          data: { companyId: scopedCompanyId, productId, variantId: null, ...clean },
        });
    await writeAudit(prisma, {
      actorId,
      entityType: "PosProductConfig",
      entityId: updated.id,
      action: "pos.productConfig.update",
      before,
      after: updated,
    });
    return updated;
  }

  return {
    listStations,
    createStation,
    updateStation,
    sendOrderToKitchen,
    listTickets,
    updateTicketStatus,
    updateTicketLineStatus,
    listProductConfigs,
    updateProductConfig,
  };
}
