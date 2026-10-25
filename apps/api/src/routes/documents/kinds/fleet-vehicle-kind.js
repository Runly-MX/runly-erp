// Document kind "fleet.vehicle" (ficha de un vehículo): datos, conductor
// asignado y pólizas de seguro.
import { DocumentProviderError } from "../document-errors.js";

export const FLEET_VEHICLE_KIND = "fleet.vehicle";

export const FLEET_VEHICLE_SCHEMA = [
  { tag: "plate", label: "Placas", type: "text" },
  { tag: "brand", label: "Marca", type: "text" },
  { tag: "modelName", label: "Modelo", type: "text" },
  { tag: "year", label: "Año", type: "text" },
  { tag: "color", label: "Color", type: "text" },
  { tag: "vehicleType", label: "Tipo de vehículo", type: "text" },
  { tag: "economicNumber", label: "Número económico", type: "text" },
  { tag: "status", label: "Estatus", type: "text" },
  { tag: "notes", label: "Notas", type: "text" },
  { tag: "isFinanced", label: "Financiado", type: "text" },
  { tag: "financingInstitution", label: "Institución de financiamiento", type: "text" },
  { tag: "financingEndDate", label: "Fin del financiamiento", type: "date" },
  { tag: "driverName", label: "Conductor", type: "text" },
  { tag: "driverPhone", label: "Teléfono del conductor", type: "text" },
  { tag: "driverLicense", label: "Licencia del conductor", type: "text" },
  { tag: "driverLicenseExpiry", label: "Vigencia de la licencia", type: "date" },
  {
    tag: "policies", label: "Pólizas de seguro", type: "list",
    fields: [
      { tag: "insurerName", label: "Aseguradora", type: "text" },
      { tag: "policyNumber", label: "Número de póliza", type: "text" },
      { tag: "coverageType", label: "Cobertura", type: "text" },
      { tag: "startDate", label: "Inicio de vigencia", type: "date" },
      { tag: "expiryDate", label: "Fin de vigencia", type: "date" },
    ],
  },
];

const LABELS = {
  placas: "plate", placa: "plate", matricula: "plate", marca: "brand", modelo: "modelName", ano: "year",
  color: "color", "tipo de vehiculo": "vehicleType", tipo: "vehicleType",
  "numero economico": "economicNumber", "no economico": "economicNumber", economico: "economicNumber",
  estatus: "status", estado: "status", notas: "notes", observaciones: "notes",
  financiado: "isFinanced", "institucion de financiamiento": "financingInstitution", "fin del financiamiento": "financingEndDate",
  conductor: "driverName", chofer: "driverName", operador: "driverName", "telefono del conductor": "driverPhone",
  licencia: "driverLicense", "licencia del conductor": "driverLicense", "vigencia de la licencia": "driverLicenseExpiry",
};

const SAMPLE = {
  plate: "ABC-123-D", brand: "Nissan", modelName: "NP300", year: "2023", color: "Blanco", vehicleType: "Pick up",
  economicNumber: "E-014", status: "active", notes: "", isFinanced: "No", financingInstitution: "", financingEndDate: "",
  driverName: "Juan Ramírez", driverPhone: "55 1234 5678", driverLicense: "LIC-998877", driverLicenseExpiry: "01/12/2027",
  policies: [{ insurerName: "Aseguradora Ejemplo", policyNumber: "POL-1001", coverageType: "Amplia", startDate: "01/01/2026", expiryDate: "01/01/2027" }],
};

export function createFleetVehicleDocumentKind({ prisma }) {
  return {
    key: FLEET_VEHICLE_KIND,
    label: "Vehículo",
    moduleKey: "runly.fleet",
    permissionKey: "fleet.vehicles.read",
    formats: ["docx", "xlsx", "pptx", "pdf"],
    schema: FLEET_VEHICLE_SCHEMA,
    labels: LABELS,
    sampleData: SAMPLE,
    async load({ companyId, sourceId }) {
      const v = await prisma.fleetVehicle.findFirst({ where: { id: sourceId, companyId, enabled: true } });
      if (!v) throw new DocumentProviderError("Vehículo no encontrado.", 404, "source_not_found");
      const [type, driver, policies] = await Promise.all([
        v.vehicleTypeId ? prisma.fleetVehicleType.findFirst({ where: { id: v.vehicleTypeId, companyId }, select: { name: true } }) : null,
        v.driverId
          ? prisma.fleetDriver.findFirst({ where: { id: v.driverId, companyId }, select: { firstName: true, lastName: true, phone: true, licenseNumber: true, licenseExpiryDate: true } })
          : null,
        prisma.fleetInsurancePolicy.findMany({ where: { companyId, vehicleId: v.id, enabled: true }, orderBy: { expiryDate: "desc" } }),
      ]);
      return {
        plate: v.plate, brand: v.brand ?? "", modelName: v.modelName ?? "", year: v.year ? String(v.year) : "", color: v.color ?? "",
        vehicleType: type?.name ?? "", economicNumber: [v.economicGroupNumber, v.economicIndividualNumber].filter(Boolean).join("-"),
        status: v.status, notes: v.notes ?? "", isFinanced: v.isFinanced ? "Sí" : "No",
        financingInstitution: v.financingInstitution ?? "", financingEndDate: v.financingEndDate,
        driverName: [driver?.firstName, driver?.lastName].filter(Boolean).join(" "), driverPhone: driver?.phone ?? "",
        driverLicense: driver?.licenseNumber ?? "", driverLicenseExpiry: driver?.licenseExpiryDate ?? null,
        policies: policies.map((p) => ({
          insurerName: p.insurerName, policyNumber: p.policyNumber, coverageType: p.coverageType ?? "",
          startDate: p.startDate, expiryDate: p.expiryDate,
        })),
      };
    },
  };
}
