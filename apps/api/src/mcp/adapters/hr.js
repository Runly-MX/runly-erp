import { z } from 'zod';
import { hrEmployeeCreateSchema, hrEmployeeUpdateSchema } from '@runly/validators';
import { createHrService } from '../../services/hr-service.js';
import { createHrMiraiQueries } from '../../routes/hr/hr-mirai-queries.js';
import { insist } from '../config.js';
import { pageInput } from '../contracts.js';

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
      const relationships = await service.validateEmployeeProposal({ ...ctx(a), payload: data, id: employeeId });
      const previous = employeeId ? await service.getEmployee({ ...ctx(a), id: employeeId }) : null;
      if (!employeeId) {
        const existing = await service.findEmployeeDuplicates({ ...ctx(a), firstName: data.firstName, lastName: data.lastName });
        insist(existing.length === 0, 'duplicate_resource', 'Ya existe un empleado con ese nombre. Consulta y selecciona el registro antes de continuar.', 409);
      }
      let linkedUser = null;
      if (data.userProfileId) {
        linkedUser = (await service.listUserOptions({ ...ctx(a), id: data.userProfileId }))[0];
        insist(linkedUser, 'invalid_relation', 'Selecciona una cuenta elegible por su userProfileId.');
      }
      const labels = { employeeCode: 'Código', workEmail: 'Correo laboral', personalEmail: 'Correo personal', phone: 'Teléfono', departmentId: 'Departamento', jobTitleId: 'Puesto', supervisorEmployeeId: 'Supervisor', employmentType: 'Tipo de empleo', status: 'Estado', hireDate: 'Fecha de ingreso', terminationDate: 'Fecha de baja', workLocation: 'Lugar de trabajo', notesMarkdown: 'Notas' };
      const relationNames = { departmentId: 'department', jobTitleId: 'jobTitle', supervisorEmployeeId: 'managerName' };
      const text = value => value === null || value === undefined || value === '' ? 'Sin valor' : typeof value === 'object' ? JSON.stringify(value).slice(0, 1000) : String(value).slice(0, 1000);
      return { input: { employeeId, data }, targetId: employeeId ?? null, preview: { title: this.label, fields: [
        { label: 'Empleado', value: `${data.firstName ?? previous?.firstName ?? ''} ${data.lastName ?? previous?.lastName ?? ''}`.trim() },
        ...Object.entries(data).filter(([key]) => !['firstName', 'lastName', 'userProfileId'].includes(key)).map(([key, value]) => ({ label: labels[key] ?? key, value: text(relationNames[key] ? relationships[relationNames[key]] : value), ...(previous ? { before: text(previous[relationNames[key] ?? key]) } : {}) })),
        ...(data.userProfileId !== undefined ? [{ label: 'Cuenta vinculada (identificador explícito)', value: linkedUser ? `${linkedUser.id}: ${linkedUser.label} (${linkedUser.email})` : 'Desvincular cuenta', ...(previous ? { before: String(previous.userProfileId ?? 'Sin cuenta vinculada') } : {}) }] : []),
      ] } };
    },
    async execute(input, a) {
      const row = operation === 'create' ? await service.createEmployee({ ...ctx(a), payload: input.data }) : await service.updateEmployee({ ...ctx(a), id: input.employeeId, payload: input.data });
      return { id: row.id, link: `/app/m/runly.hr/hr/employees/${row.id}` };
    },
  }));
  return { moduleKey: 'runly.hr', label: 'Recursos Humanos', actions,
    queries: [...createHrMiraiQueries({ prisma, hrService: service }), { name: 'hr_users_eligible', permission: 'hr.employee.read', definition: { description: 'Buscar cuentas elegibles de la empresa; excluye vínculos ya ocupados. Para editar una cuenta existente indica employeeId. Nunca vincular por coincidencia de nombre ambigua.' }, inputSchema: z.object({ search: z.string().max(200).optional(), employeeId: z.uuid().optional() }).strict(), run: async (input, a) => ({ items: await service.listUserOptions({ ...ctx(a), ...input, limit: 100, eligibleOnly: true }) }) }, lookup('hr_departments', 'Departamentos de la empresa.', 'listDepartments'), lookup('hr_positions', 'Puestos de la empresa.', 'listJobTitles'),
      { name: 'hr_employees_page', permission: 'hr.employee.read', definition: { description: 'Empleados de la empresa con paginación y búsqueda.' }, inputSchema: z.object({ ...pageInput, search: z.string().max(200).optional() }).strict(), run: (input, a) => service.listEmployees({ ...ctx(a), ...input, pageSize: input.limit }) }],
    revision: async (_definition, prepared, a) => prepared.targetId ? service.getEmployee({ ...ctx(a), id: prepared.targetId }) : null,
    // Linking an employee to a user account changes identity relationships.
    sensitive: (_definition, input) => Object.hasOwn(input?.data ?? {}, 'userProfileId'),
    effects: ['Alta/edición de empleado; cambios explícitos de departamento, supervisor y cuenta; auditoría del ERP.'],
  };
}
