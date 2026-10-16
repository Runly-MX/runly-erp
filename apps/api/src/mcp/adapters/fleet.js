import { createFleetService } from '../../routes/fleet/fleet-service.js';
import { createDriverService } from '../../routes/fleet/driver-service.js';
import { createInsuranceService } from '../../routes/fleet/insurance-service.js';
import { createFleetMiraiQueries } from '../../routes/fleet/fleet-mirai-queries.js';
import { createFleetMiraiActions } from '../../routes/fleet/mirai-actions.js';

export function createFleetAdapter({ prisma }) {
  const fleetService = createFleetService({ prisma }), driverService = createDriverService({ prisma }), insuranceService = createInsuranceService({ prisma });
  return { moduleKey: 'runly.fleet', label: 'Flota',
    queries: createFleetMiraiQueries({ prisma, fleetService, driverService, publicLookup: {} }).filter(q => !q.name.includes('public') && !q.name.includes('spec')),
    actions: createFleetMiraiActions({ fleetService, driverService, insuranceService }).filter(a => ['fleet.vehicle.create', 'fleet.vehicle.update', 'fleet.insurance.create', 'fleet.insurance.update'].includes(a.key)),
    revision: async (definition, prepared, a) => !prepared.targetId ? null : definition.key.includes('insurance') ? insuranceService.getPolicy({ companyId: a.companyId, id: prepared.targetId }) : fleetService.getVehicle({ companyId: a.companyId, id: prepared.targetId }),
    effects: ['Cambios internos de vehículo, conductor asignado o póliza; auditoría del ERP. Sin contratación externa.'],
  };
}
