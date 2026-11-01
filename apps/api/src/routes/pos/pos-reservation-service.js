import {
  PosServiceError,
  requireCompanyId,
  writeAudit,
} from "./service-helpers.js";
import { createPosScopeService } from './pos-scope-service.js';
import {createPosCommandService} from './pos-command-service.js';

export function createPosReservationService({ prisma }) {
  const commands=createPosCommandService({prisma});
  async function listReservations({ companyId, outletId, date, status }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const where = { companyId: scopedCompanyId };
    if (outletId) where.outletId = outletId;
    if (status) where.status = status;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: start, lte: end };
    }
    return prisma.posReservation.findMany({
      where,
      include: { table: true },
      orderBy: { scheduledAt: "asc" },
    });
  }

  async function getReservation({ companyId, id }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const reservation = await prisma.posReservation.findFirst({
      where: { id, companyId: scopedCompanyId },
      include: { table: true },
    });
    if (!reservation) throw new PosServiceError("Reservación no encontrada.", 404);
    return reservation;
  }

  async function createReservation({ companyId, actorId, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const scope = createPosScopeService({ prisma });
    await scope.outlet(scopedCompanyId, data.outletId);

    if (data.tableId) {
      const table = await scope.table(scopedCompanyId, data.outletId, data.tableId);
      if (table.status === "OCCUPIED" || table.status === "RESERVED")
        throw new PosServiceError("La mesa ya está ocupada o reservada.", 409);
    }

    const reservation = await prisma.$transaction(async (tx) => {
      if(data.tableId){
        await tx.$queryRaw`SELECT id FROM pos_table WHERE id=${data.tableId}::uuid AND company_id=${scopedCompanyId}::uuid FOR UPDATE`;
        const table=await createPosScopeService({prisma:tx}).table(scopedCompanyId,data.outletId,data.tableId);
        if(table.status!=='AVAILABLE')throw new PosServiceError('La mesa ya no está disponible para reservar.',409);
      }
      const reservation = await tx.posReservation.create({
        data: {
          companyId: scopedCompanyId,
          outletId: data.outletId,
          tableId: data.tableId ?? null,
          guestName: data.guestName,
          guestPhone: data.guestPhone ?? null,
          partySize: data.partySize ?? 2,
          scheduledAt: new Date(data.scheduledAt),
          durationMinutes: data.durationMinutes ?? 90,
          notes: data.notes ?? null,
          status: "CONFIRMED",
          createdById: actorId,
        },
        include: { table: true },
      });

      if (data.tableId) {
        await tx.posTable.update({
          where: { id: data.tableId },
          data: { status: "RESERVED",version:{increment:1} },
        });
      }

      await commands.audit(tx,{companyId:scopedCompanyId,actorId,entityType:'PosReservation',entityId:reservation.id,action:'pos.reservation.create',after:reservation});
      return reservation;
    });

    return reservation;
  }

  async function updateReservation({ companyId, actorId, id, data }) {
    const scopedCompanyId = requireCompanyId(companyId);
    if(data.status==='SEATED')throw new PosServiceError('Atiende la reserva mediante el comando C6 para crear una cuenta consistente.',409);
    const existing = await prisma.posReservation.findFirst({
      where: { id, companyId: scopedCompanyId },
    });
    if (!existing) throw new PosServiceError("Reservación no encontrada.", 404);
    if (["SEATED", "CANCELLED"].includes(existing.status))
      throw new PosServiceError("La reservación ya no se puede editar.", 409);

    const updateData = {};
    if (data.guestName !== undefined) updateData.guestName = data.guestName;
    if (data.guestPhone !== undefined) updateData.guestPhone = data.guestPhone ?? null;
    if (data.partySize !== undefined) updateData.partySize = data.partySize;
    if (data.scheduledAt !== undefined) updateData.scheduledAt = new Date(data.scheduledAt);
    if (data.durationMinutes !== undefined) updateData.durationMinutes = data.durationMinutes;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;
    if (data.status !== undefined) updateData.status = data.status;

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    const reservation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pos_reservation WHERE id=${id}::uuid AND company_id=${scopedCompanyId}::uuid FOR UPDATE`;
      const fresh=await tx.posReservation.findFirst({where:{id,companyId:scopedCompanyId}});
      if(!fresh||['SEATED','CANCELLED'].includes(fresh.status))throw new PosServiceError('La reserva cambió y ya no se puede editar.',409);
      const updated = await tx.posReservation.update({
        where: { id },
        data: updateData,
        include: { table: true },
      });

      if (
        (data.status === "CANCELLED" || data.status === "NO_SHOW") &&
        existing.tableId &&
        existing.status !== "CANCELLED" &&
        existing.status !== "NO_SHOW"
      ) {
        const activeOrders = await tx.posOrder.count({
          where: {
            tableId: existing.tableId,
            status: { notIn: ["PAID", "CANCELLED", "REFUNDED"] },
          },
        });
        if (activeOrders === 0) {
          await tx.posTable.update({
            where: { id: existing.tableId },
            data: { status: "AVAILABLE",version:{increment:1} },
          });
        }
      }

      await commands.audit(tx,{companyId:scopedCompanyId,actorId,entityType:'PosReservation',entityId:id,action:'pos.reservation.update',before:fresh,after:updated});
      return updated;
    });

    return reservation;
  }

  async function seatReservation({ companyId, actorId, id, sessionId }) {
    const scopedCompanyId = requireCompanyId(companyId);
    const reservation = await prisma.posReservation.findFirst({
      where: { id, companyId: scopedCompanyId },
    });
    if (!reservation) throw new PosServiceError("Reservación no encontrada.", 404);
    if (reservation.status !== "CONFIRMED")
      throw new PosServiceError("Solo se pueden sentar reservaciones confirmadas.", 409);

    let order;
    let attempt = 0;
    while (attempt < 3) {
      try {
        order = await prisma.$transaction(async (tx) => {
          await createPosScopeService({ prisma: tx }).order(scopedCompanyId, { ...reservation, sessionId });
          const last = await tx.posOrder.findFirst({
            where: { companyId: scopedCompanyId },
            orderBy: { orderNumber: "desc" },
            select: { orderNumber: true },
          });
          const orderNumber = Number(last?.orderNumber ?? 0) + 1;

          const newOrder = await tx.posOrder.create({
            data: {
              companyId: scopedCompanyId,
              outletId: reservation.outletId,
              tableId: reservation.tableId,
              sessionId: sessionId ?? null,
              orderNumber,
              status: "OPEN",
              fulfillmentType: "DINE_IN",
              salesChannel: "IN_STORE",
              customerName: reservation.guestName,
              customerPhone: reservation.guestPhone,
              guestCount: reservation.partySize,
              notes: reservation.notes,
              createdById: actorId,
            },
          });

          await tx.posReservation.update({
            where: { id },
            data: { status: "SEATED", orderId: newOrder.id },
          });

          if (reservation.tableId) {
            await tx.posTable.update({
              where: { id: reservation.tableId },
              data: { status: "OCCUPIED" },
            });
          }

          return newOrder;
        });
        break;
      } catch (err) {
        if (err?.code === "P2002" && attempt < 2) {
          attempt++;
          continue;
        }
        throw err;
      }
    }

    await writeAudit(prisma, {
      actorId,
      entityType: "PosReservation",
      entityId: id,
      action: "pos.reservation.seat",
      after: order,
    });

    return order;
  }

  return { listReservations, getReservation, createReservation, updateReservation, seatReservation };
}
