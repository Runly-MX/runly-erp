// Spanish names of the arguments the automation blocks ask for (shared by the editor and error messages).
export const ARG_LABELS = {
  title: "Título", description: "Descripción", startAt: "Inicio", endAt: "Fin", allDay: "Todo el día", location: "Lugar",
  calendarId: "Calendario (id)", attendeeIds: "Invitados", reminderMinutes: "Recordatorios (minutos antes)",
  userIds: "Destinatarios", body: "Mensaje", link: "Enlace", priority: "Prioridad", name: "Nombre", type: "Tipo",
  email: "Correo", phone: "Teléfono", id: "Registro a cambiar (id)", status: "Estado", notes: "Notas", locationId: "Ubicación (id)",
  projectId: "Proyecto (id)", assigneeId: "Responsable (id)", dueDate: "Fecha límite", statusId: "Estado (id)",
  mimeType: "Tipo de archivo", contentBase64: "Contenido (base64)", shareWithCompany: "Compartir con la empresa",
  plate: "Matrícula", vehicleId: "Vehículo (id)", driver: "Chofer", color: "Color", brand: "Marca", model: "Modelo", year: "Año",
  insurer: "Aseguradora", policyNumber: "Número de póliza", coverageType: "Cobertura", startDate: "Inicio de vigencia",
  expiryDate: "Vencimiento", premium: "Prima", currency: "Moneda", policyId: "Póliza (id)",
  accountId: "Cuenta (id)", accountName: "Cuenta (nombre)", fecha: "Fecha", nombre: "Nombre", referencia: "Referencia",
  concepto: "Concepto", numero: "Número", deposito: "Depósito", retiro: "Retiro", categoryId: "Categoría (id)", transactionId: "Movimiento (id)",
  wallet: "Cartera (nombre o id)", direction: "Tipo de movimiento", amount: "Monto", occurredOn: "Fecha", category: "Categoría",
  merchant: "Comercio", note: "Nota", movementId: "Movimiento (id)",
  subject: "Asunto", to: "Correo externo", fileId: "Archivo adjunto (id)", source: "Qué incluye el reporte", format: "Formato", search: "Filtrar por texto",
  kind: "Tipo de documento", templateId: "Plantilla (id)", sourceId: "Registro de origen (id)", values: "Valores (JSON)", output: "Salida (native o pdf)",
};

export const argLabel = (name) => ARG_LABELS[name] ?? name;
