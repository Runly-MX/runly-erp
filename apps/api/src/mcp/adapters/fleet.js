import { createFleetService } from '../../routes/fleet/fleet-service.js';
import { createDriverService } from '../../routes/fleet/driver-service.js';
import { createInsuranceService } from '../../routes/fleet/insurance-service.js';
import { createFleetMiraiQueries } from '../../routes/fleet/fleet-mirai-queries.js';
import { createFleetMiraiActions } from '../../routes/fleet/mirai-actions.js';
import { z } from 'zod';
import { pageInput } from '../contracts.js';
import { createReportsService } from '../../routes/fleet/reports-service.js';

export function createFleetAdapter({ prisma }) {
  const fleetService = createFleetService({ prisma }), driverService = createDriverService({ prisma }), insuranceService = createInsuranceService({ prisma });
  return { moduleKey: 'runly.fleet', label: 'Flota',
    queries: [...createFleetMiraiQueries({ prisma, fleetService, driverService, publicLookup: {} }).filter(q => !q.name.includes('public') && !q.name.includes('spec')),
      { name: 'fleet_vehicles_page', permission: 'fleet.vehicles.read', definition: { description: 'Vehículos con paginación y búsqueda.' }, inputSchema: z.object({ ...pageInput, search: z.string().max(200).optional(), status: z.enum(['active', 'maintenance', 'inactive', 'retired']).optional() }).strict(), run: (input, a) => fleetService.listVehicles({ companyId: a.companyId, ...input, pageSize: input.limit }) },
      { name: 'fleet_vehicle_documents', permission: 'fleet.vehicles.read', definition: { description: 'Metadatos de documentos de un vehículo de la empresa.' }, inputSchema: z.object({ vehicleId: z.uuid() }).strict(), run: async (input, a) => ({ documents: await fleetService.listVehicleDocuments({ companyId: a.companyId, vehicleId: input.vehicleId }) }) },
      { name: 'fleet_reports_page', permission: 'fleet.reports.read', definition: { description: 'Reportes operativos y de mantenimiento de Flota con paginación.' }, inputSchema: z.object({ ...pageInput, search: z.string().max(200).optional() }).strict(), run: (input, a) => createReportsService({ prisma }).listReportsAnyType({ companyId: a.companyId, ...input, pageSize: input.limit }) }],
    actions: createFleetMiraiActions({ fleetService, driverService, insuranceService }).filter(a => ['fleet.vehicle.create', 'fleet.vehicle.update', 'fleet.insurance.create', 'fleet.insurance.update'].includes(a.key)),
    revision: async (definition, prepared, a) => !prepared.targetId ? null : definition.key.includes('insurance') ? insuranceService.getPolicy({ companyId: a.companyId, id: prepared.targetId }) : fleetService.getVehicle({ companyId: a.companyId, id: prepared.targetId }),
    effects: ['Cambios internos de vehículo, conductor asignado o póliza; auditoría del ERP. Sin contratación externa.'],
  };
}
