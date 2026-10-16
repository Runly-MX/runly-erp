import { z } from 'zod';
import { hrEmployeeCreateSchema, hrEmployeeUpdateSchema } from '@runly/validators';
import { createHrService } from '../../services/hr-service.js';
import { createHrMiraiQueries } from '../../routes/hr/hr-mirai-queries.js';
import { insist } from '../config.js';

export function createHrAdapter({ prisma }) {
  const service = createHrService({ prisma });
  const ctx = a => ({ authUserId: a.actorAuthUserId, companyId: a.companyId });
  const lookup = (name, description, method, permission = 'hr.employee.read') => ({ name, permission, definition: { description, parameters: { type: 'object', properties: { search: { type: 'string' } } } }, run: async (args, a) => ({ items: await service[method]({ ...ctx(a), ...args, limit: 100 }) }) });
  const actions = ['create', 'update'].map(operation => ({
    key: `hr.employee.${operation}`, operation, permission: `hr.employee.${operation}`,
    inputSchema: z.object({ ...(operation === 'update' ? { employeeId: z.uuid() } : {}), data: (operation === 'create' ? hrEmployeeCreateSchema : hrEmployeeUpdateSchema).strict() }).strict(),
    label: operation === 'create' ? 'Registrar empleado y cuenta vinculada' : 'Editar empleado y relaciones',
    async prepare(input, a) {
      const { employeeId, data } = input;
      await service.validateEmployeeProposal({ ...ctx(a), payload: data, id: employeeId });
      const previous = employeeId ? await service.getEmployee({ ...ctx(a), id: employeeId }) : null;
      if (!employeeId) {
        const existing = await service.listEmployees({ ...ctx(a), search: `${data.firstName} ${data.lastName}`, page: 1, pageSize: 100 });
        insist(!existing.rows.some(row => row.full_name?.toLocaleLowerCase() === `${data.firstName} ${data.lastName}`.toLocaleLowerCase()), 'duplicate_resource', 'Ya existe un empleado con ese nombre. Consulta y selecciona el registro antes de continuar.', 409);
      }
      let linkedUser = null;
      if (data.userProfileId) {
        linkedUser = (await service.listUserOptions({ ...ctx(a), id: data.userProfileId }))[0];
        insist(linkedUser, 'invalid_relation', 'Selecciona una cuenta elegible por su userProfileId.');
      }
      return { input: { employeeId, data }, targetId: employeeId ?? null, preview: { title: this.label, fields: [
        { label: 'Empleado', value: `${data.firstName ?? previous?.firstName ?? ''} ${data.lastName ?? previous?.lastName ?? ''}`.trim() },
        { label: 'Cambios', value: JSON.stringify(data), ...(previous ? { before: JSON.stringify(previous) } : {}) },
        ...(data.userProfileId !== undefined ? [{ label: 'Cuenta vinculada (identificador explícito)', value: linkedUser ? `${linkedUser.id}: ${linkedUser.label} (${linkedUser.email})` : 'Desvincular cuenta' }] : []),
      ] } };
    },
    async execute(input, a) {
      const row = operation === 'create' ? await service.createEmployee({ ...ctx(a), payload: input.data }) : await service.updateEmployee({ ...ctx(a), id: input.employeeId, payload: input.data });
      return { id: row.id, link: `/app/m/runly.hr/hr/employees/${row.id}` };
    },
  }));
  return { moduleKey: 'runly.hr', label: 'Recursos Humanos', actions,
    queries: [...createHrMiraiQueries({ prisma, hrService: service }), lookup('hr_users_eligible', 'Buscar cuentas elegibles; usar el ID exacto, nunca vincular por nombre ambiguo.', 'listUserOptions'), lookup('hr_departments', 'Departamentos de la empresa.', 'listDepartments'), lookup('hr_positions', 'Puestos de la empresa.', 'listJobTitles')],
    revision: async (_definition, prepared, a) => prepared.targetId ? service.getEmployee({ ...ctx(a), id: prepared.targetId }) : null,
    effects: ['Alta/edición de empleado; cambios explícitos de departamento, supervisor y cuenta; auditoría del ERP.'],
  };
}
