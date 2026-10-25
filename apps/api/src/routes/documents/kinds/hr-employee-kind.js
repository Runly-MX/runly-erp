// Document kind "hr.employee" (documento de un colaborador): contract letters,
// constancias, credentials. HR fills it through hub.engine.generate({ kind, sourceId: employeeId }).
import { DocumentProviderError } from "../document-errors.js";

export const HR_EMPLOYEE_KIND = "hr.employee";

export const HR_EMPLOYEE_SCHEMA = [
  { tag: "employeeName", label: "Nombre completo", type: "text" },
  { tag: "firstName", label: "Nombres", type: "text" },
  { tag: "lastName", label: "Apellidos", type: "text" },
  { tag: "employeeCode", label: "Número de empleado", type: "text" },
  { tag: "workEmail", label: "Correo de trabajo", type: "text" },
  { tag: "personalEmail", label: "Correo personal", type: "text" },
  { tag: "phone", label: "Teléfono", type: "text" },
  { tag: "jobTitle", label: "Puesto", type: "text" },
  { tag: "department", label: "Departamento", type: "text" },
  { tag: "supervisorName", label: "Supervisor", type: "text" },
  { tag: "employmentType", label: "Tipo de contratación", type: "text" },
  { tag: "workLocation", label: "Lugar de trabajo", type: "text" },
  { tag: "hireDate", label: "Fecha de ingreso", type: "date" },
  { tag: "terminationDate", label: "Fecha de baja", type: "date" },
  { tag: "status", label: "Estatus", type: "text" },
  { tag: "emergencyContactName", label: "Contacto de emergencia", type: "text" },
  { tag: "emergencyContactPhone", label: "Teléfono de emergencia", type: "text" },
];

// Normalized label (see normalizeLabel) -> tag, used to auto-tag company forms.
const LABELS = {
  nombre: "employeeName", "nombre completo": "employeeName", colaborador: "employeeName", empleado: "employeeName",
  "nombre del empleado": "employeeName", "nombre del colaborador": "employeeName",
  nombres: "firstName", apellidos: "lastName",
  "numero de empleado": "employeeCode", "no de empleado": "employeeCode", "codigo de empleado": "employeeCode", "clave de empleado": "employeeCode",
  "correo de trabajo": "workEmail", "correo institucional": "workEmail", "correo electronico": "workEmail", correo: "workEmail", email: "workEmail",
  "correo personal": "personalEmail", telefono: "phone", celular: "phone",
  puesto: "jobTitle", cargo: "jobTitle", departamento: "department", area: "department",
  supervisor: "supervisorName", "jefe directo": "supervisorName", jefe: "supervisorName",
  "tipo de contratacion": "employmentType", contratacion: "employmentType",
  "lugar de trabajo": "workLocation", ubicacion: "workLocation", sucursal: "workLocation",
  "fecha de ingreso": "hireDate", ingreso: "hireDate", "fecha de contratacion": "hireDate",
  "fecha de baja": "terminationDate", estatus: "status", estado: "status",
  "contacto de emergencia": "emergencyContactName", "telefono de emergencia": "emergencyContactPhone",
};

const SAMPLE = {
  employeeName: "Ana Pérez López", firstName: "Ana", lastName: "Pérez López", employeeCode: "E-0042",
  workEmail: "ana@example.com", personalEmail: "ana.personal@example.com", phone: "55 1234 5678",
  jobTitle: "Analista", department: "Operaciones", supervisorName: "Luis Gómez", employmentType: "Tiempo completo",
  workLocation: "Oficina central", hireDate: "15/01/2024", terminationDate: "", status: "active",
  emergencyContactName: "Marta López", emergencyContactPhone: "55 8765 4321",
};

const fullName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(" ");

export function createHrEmployeeDocumentKind({ prisma }) {
  return {
    key: HR_EMPLOYEE_KIND,
    label: "Colaborador",
    moduleKey: "runly.hr",
    permissionKey: "hr.employee.read",
    formats: ["docx", "xlsx", "pptx", "pdf"],
    schema: HR_EMPLOYEE_SCHEMA,
    labels: LABELS,
    sampleData: SAMPLE,
    async load({ companyId, sourceId }) {
      const e = await prisma.hrEmployee.findFirst({
        where: { id: sourceId, companyId, enabled: true },
        select: {
          firstName: true, lastName: true, employeeCode: true, workEmail: true, personalEmail: true, phone: true,
          jobTitle: true, department: true, managerName: true, employmentType: true, workLocation: true,
          hireDate: true, terminationDate: true, status: true, emergencyContactName: true, emergencyContactPhone: true,
          departmentRef: { select: { name: true } }, jobTitleRef: { select: { name: true } },
          supervisor: { select: { firstName: true, lastName: true } },
        },
      });
      if (!e) throw new DocumentProviderError("Colaborador no encontrado.", 404, "source_not_found");
      return {
        employeeName: fullName(e), firstName: e.firstName, lastName: e.lastName, employeeCode: e.employeeCode ?? "",
        workEmail: e.workEmail ?? "", personalEmail: e.personalEmail ?? "", phone: e.phone ?? "",
        jobTitle: e.jobTitleRef?.name ?? e.jobTitle ?? "", department: e.departmentRef?.name ?? e.department ?? "",
        supervisorName: fullName(e.supervisor) || e.managerName || "",
        employmentType: e.employmentType ?? "", workLocation: e.workLocation ?? "",
        hireDate: e.hireDate, terminationDate: e.terminationDate, status: e.status ?? "",
        emergencyContactName: e.emergencyContactName ?? "", emergencyContactPhone: e.emergencyContactPhone ?? "",
      };
    },
  };
}
