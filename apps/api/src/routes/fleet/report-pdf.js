import { FleetServiceError } from "./fleet-service.js";
import {
  resolvePdfDocumentCtor,
  resolveCompanyBranding as resolveSharedCompanyBranding,
  toSafeText,
  compact,
  normalizeHexColor,
  lightenHex,
  formatDateEs,
} from "../../services/pdf-branding-service.js";

// Adapts the shared branding resolver to the field names this report layout uses.
async function resolveCompanyBranding({ prisma, companyId }) {
  const shared = await resolveSharedCompanyBranding({ prisma, companyId });
  const addressLines = Array.isArray(shared.addressLines) ? shared.addressLines : [];
  return {
    companyName: shared.companyName,
    legalName: shared.legalName ?? "",
    rfc: shared.rfc && shared.rfc !== "-" ? shared.rfc : "",
    contactEmail: shared.email && shared.email !== "-" ? shared.email : "",
    phone: shared.phone && shared.phone !== "-" ? shared.phone : "",
    website: shared.website && shared.website !== "-" ? shared.website : "",
    address1: addressLines[0] ?? "",
    address2: addressLines.slice(1).join(" | "),
    primaryColor: normalizeHexColor(shared.primaryColor ?? "#0F766E", "#0F766E"),
    logoBuffer: Buffer.isBuffer(shared.logoBuffer) ? shared.logoBuffer : null,
  };
}

function formatDateTimeEs(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatInteger(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

function reportSubtypeLabel(report) {
  const map = {
    preventive: "Preventivo",
    corrective: "Correctivo",
    inspection: "Inspeccion",
    alignment: "Alineacion",
    oil_change: "Cambio de aceite",
    tire_service: "Servicio de llantas",
    general: "General",
    diagnostic: "Diagnostico",
    cleaning: "Limpieza",
    electrical: "Electrico",
    low: "Baja",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
    mechanical: "Mecanica",
    body: "Carroceria",
    interior: "Interior",
    other: "Otro",
  };
  const key =
    report?.maintenance_subtype ??
    report?.service_subtype ??
    report?.repair_priority ??
    report?.repair_damage_type;
  return key ? (map[key] ?? key) : "-";
}

async function toPdfBuffer({ report, parts, branding }) {
  const PDFDocument = await resolvePdfDocumentCtor();
  if (typeof PDFDocument !== "function") {
    throw new FleetServiceError(
      "La generacion de PDF no esta disponible. Falta dependencia de pdf en API.",
      503,
    );
  }

  const brandColor = normalizeHexColor(
    branding.primaryColor ?? "#0F766E",
    "#0F766E",
  );
  const brandColorLight = lightenHex(brandColor, 0.88);
  const companyName = toSafeText(branding.companyName, "Runly ERP");
  const logoBuffer = Buffer.isBuffer(branding.logoBuffer)
    ? branding.logoBuffer
    : null;

  const REPORT_TYPE_LABELS = {
    maintenance: "Mantenimiento",
    service: "Servicio",
    repair: "Reparacion",
    other: "General",
  };
  const reportTypeKey = String(report.report_type ?? "").toLowerCase();
  const reportTitle = `Reporte de ${REPORT_TYPE_LABELS[reportTypeKey] ?? "Flota"}`;
  const statusText = report.status === "finalized" ? "Finalizado" : "Borrador";
  const statusColor = report.status === "finalized" ? "#15803D" : "#B45309";

  // Design tokens
  const C_LABEL_BG = "#F1F5F9";
  const C_BORDER = "#E2E8F0";
  const C_DARK = "#0F172A";
  const C_MID = "#334155";
  const C_MUTED = "#64748B";
  const C_ALT_ROW = "#F8FAFC";

  const doc = new PDFDocument({
    margin: 0,
    size: "LETTER",
    layout: "portrait",
    bufferPages: true,
  });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const MARGIN = 44;
  const left = MARGIN;
  const right = pageWidth - MARGIN;
  const contentWidth = right - left;

  doc.lineWidth(0.5);

  // ─── HEADER BAND ──────────────────────────────────────────────────────────────
  const HEADER_H = 86;
  const INFO_STRIP_H = 0;

  // White background
  doc.rect(0, 0, pageWidth, HEADER_H).fill("#FFFFFF");

  // Left brand accent strip
  doc.rect(0, 0, 6, HEADER_H).fill(brandColor);

  // Logo box
  const LOGO_SIZE = 54;
  const LOGO_X = left + 4;
  const LOGO_Y = Math.floor((HEADER_H - LOGO_SIZE) / 2);
  doc
    .lineWidth(0.75)
    .rect(LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE)
    .stroke(C_BORDER);
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, LOGO_X + 4, LOGO_Y + 4, {
        fit: [LOGO_SIZE - 8, LOGO_SIZE - 8],
        align: "center",
      });
    } catch {
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor(brandColor)
        .text(companyName.slice(0, 2).toUpperCase(), LOGO_X, LOGO_Y + 18, {
          width: LOGO_SIZE,
          align: "center",
          lineBreak: false,
        });
    }
  } else {
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor(brandColor)
      .text(companyName.slice(0, 2).toUpperCase(), LOGO_X, LOGO_Y + 18, {
        width: LOGO_SIZE,
        align: "center",
        lineBreak: false,
      });
  }

  // Block dimensions — computed here so compW can reference rBlockX
  const rBlockW = Math.max(Math.floor(contentWidth * 0.38), 210);
  const rBlockX = right - rBlockW;

  // Company identity — left block (width constrained by right block start)
  const compX = LOGO_X + LOGO_SIZE + 14;
  const compW = rBlockX - compX - 12;
  doc
    .font("Helvetica-Bold")
    .fontSize(13.5)
    .fillColor(brandColor)
    .text(companyName, compX, 11, {
      width: compW,
      lineBreak: false,
      ellipsis: true,
    });

  let infoY = 30;

  // RFC + Tel on one line
  const rfcTelLine = compact([
    branding.rfc ? `RFC: ${branding.rfc}` : "",
    branding.phone ? `Tel: ${branding.phone}` : "",
  ]).join("   \u00b7   ");
  if (rfcTelLine) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(C_MUTED)
      .text(rfcTelLine, compX, infoY, {
        width: compW,
        lineBreak: false,
        ellipsis: true,
      });
    infoY += 11;
  }

  // Email on its own line
  if (branding.contactEmail) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(C_MUTED)
      .text(branding.contactEmail, compX, infoY, {
        width: compW,
        lineBreak: false,
        ellipsis: true,
      });
    infoY += 11;
  }

  // Address
  const addrLine = compact([branding.address1, branding.address2]).join(
    "  \u00b7  ",
  );
  if (addrLine) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(C_MUTED)
      .text(addrLine, compX, infoY, {
        width: compW,
        lineBreak: false,
        ellipsis: true,
      });
    infoY += 11;
  }

  // Website inside the header (replaces the info strip below)
  if (branding.website) {
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(C_MUTED)
      .text(branding.website, compX, infoY, {
        width: compW,
        lineBreak: false,
        ellipsis: true,
      });
  }

  // Report identity — right block: just the report type title, vertically centered
  const titleFontSize = 13;
  const titleY = Math.floor((HEADER_H - titleFontSize * 1.3) / 2);
  doc
    .font("Helvetica-Bold")
    .fontSize(titleFontSize)
    .fillColor(C_DARK)
    .text(reportTitle, rBlockX, titleY, {
      width: rBlockW,
      align: "right",
      lineBreak: false,
    });

  // Header bottom accent line
  doc
    .lineWidth(2)
    .moveTo(0, HEADER_H)
    .lineTo(pageWidth, HEADER_H)
    .stroke(brandColor);

  // ─── SECTION HELPERS ──────────────────────────────────────────────────────────
  const SECTION_GAP = 22;
  const ROW_H = 22;

  function drawSectionTitle(text, atY) {
    doc.rect(left, atY, 3, 14).fill(brandColor);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(C_DARK)
      .text(text, left + 10, atY + 3, {
        lineBreak: false,
        characterSpacing: 0.2,
      });
    return atY + 20;
  }

  function drawGrid({ rows, x, gridY, width: gw, rowHeight = ROW_H }) {
    const keyW = Math.floor(gw * 0.37);
    let cy = gridY;
    for (const row of rows) {
      doc.lineWidth(0.5);
      doc.rect(x, cy, keyW, rowHeight).fillAndStroke(C_LABEL_BG, C_BORDER);
      doc
        .rect(x + keyW, cy, gw - keyW, rowHeight)
        .fillAndStroke("#FFFFFF", C_BORDER);
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(C_MUTED)
        .text(
          String(row.label ?? ""),
          x + 7,
          cy + Math.floor((rowHeight - 8) / 2) + 1,
          { width: keyW - 12, lineBreak: false },
        );
      const vColor = row.valueColor ?? C_DARK;
      const vFont = row.bold ? "Helvetica-Bold" : "Helvetica";
      doc
        .font(vFont)
        .fontSize(8.5)
        .fillColor(vColor)
        .text(
          String(row.value ?? "-"),
          x + keyW + 7,
          cy + Math.floor((rowHeight - 9) / 2) + 1,
          { width: gw - keyW - 12, lineBreak: false, ellipsis: true },
        );
      cy += rowHeight;
    }
    return cy;
  }

  // ─── CONTENT ──────────────────────────────────────────────────────────────────
  let y = HEADER_H + 2 + INFO_STRIP_H + 16;
  const maxY = pageHeight - 44;
  const HALF_GAP = 10;
  const halfWidth = Math.floor((contentWidth - HALF_GAP) / 2);

  // ── Resumen: titulo, estado y cifras clave ──
  const PILL_W = 74;
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(C_DARK)
    .text(toSafeText(report.title), left, y, {
      width: contentWidth - PILL_W - 12,
      lineBreak: false,
      ellipsis: true,
    });
  doc.roundedRect(right - PILL_W, y - 1, PILL_W, 18, 9).fill(statusColor);
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#FFFFFF")
    .text(statusText.toUpperCase(), right - PILL_W, y + 4.5, {
      width: PILL_W,
      align: "center",
      lineBreak: false,
    });
  y += 22;
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(C_MUTED)
    .text(
      compact([
        toSafeText(report.folio, ""),
        toSafeText(report.vehicle_plate, ""),
        toSafeText(report.report_type_label ?? REPORT_TYPE_LABELS[reportTypeKey] ?? "", ""),
        formatDateEs(report.report_date),
      ]).join("   ·   "),
      left,
      y,
      { width: contentWidth, lineBreak: false, ellipsis: true },
    );
  y += 18;

  const nextService = report.next_service_date
    ? formatDateEs(report.next_service_date)
    : null;
  const kpis = [
    { label: "TOTAL", value: formatCurrency(report.total_cost), strong: true },
    { label: "MANO DE OBRA", value: formatCurrency(report.labor_cost) },
    { label: "REFACCIONES", value: formatCurrency(report.parts_cost) },
    nextService
      ? { label: "PROXIMO SERVICIO", value: nextService }
      : { label: "KILOMETRAJE", value: `${formatInteger(report.odometer_km)} km` },
  ];
  const KPI_GAP = 8;
  const KPI_H = 46;
  const kpiW = Math.floor((contentWidth - KPI_GAP * (kpis.length - 1)) / kpis.length);
  kpis.forEach((kpi, i) => {
    const kx = left + i * (kpiW + KPI_GAP);
    doc
      .roundedRect(kx, y, kpiW, KPI_H, 6)
      .fillAndStroke(kpi.strong ? brandColor : brandColorLight, kpi.strong ? brandColor : C_BORDER);
    doc
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .fillColor(kpi.strong ? "#FFFFFF" : C_MUTED)
      .text(kpi.label, kx + 10, y + 9, { width: kpiW - 20, lineBreak: false, characterSpacing: 0.4 });
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(kpi.strong ? "#FFFFFF" : C_DARK)
      .text(kpi.value, kx + 10, y + 22, { width: kpiW - 20, lineBreak: false, ellipsis: true });
  });
  y += KPI_H + SECTION_GAP;

  // ── Datos del reporte ──
  y = drawSectionTitle("DATOS DEL REPORTE", y);

  const leftRows = [
    { label: "Folio", value: toSafeText(report.folio), bold: true },
    {
      label: "Tipo",
      value: toSafeText(report.report_type_label ?? report.report_type),
    },
    { label: "Titulo", value: toSafeText(report.title) },
    { label: "Subtipo", value: reportSubtypeLabel(report) },
    { label: "Fecha del reporte", value: formatDateEs(report.report_date) },
    { label: "Emitido", value: formatDateTimeEs(new Date()) },
  ];
  const rightRows = [
    { label: "Vehiculo", value: toSafeText(report.vehicle_plate), bold: true },
    { label: "Marca", value: toSafeText(report.vehicle_brand_name) },
    { label: "Modelo", value: toSafeText(report.vehicle_model_name) },
    { label: "Tipo vehiculo", value: toSafeText(report.vehicle_type_name) },
    { label: "Kilometraje", value: `${formatInteger(report.odometer_km)} km` },
    { label: "Estado", value: statusText, bold: true, valueColor: statusColor },
  ];

  drawGrid({ rows: leftRows, x: left, gridY: y, width: halfWidth });
  drawGrid({
    rows: rightRows,
    x: left + halfWidth + HALF_GAP,
    gridY: y,
    width: halfWidth,
  });
  y += leftRows.length * ROW_H + SECTION_GAP;

  // ── Taller y costos ──
  y = drawSectionTitle("TALLER Y COSTOS", y);

  const workshopRows = [
    {
      label: "Modalidad",
      value: report.is_inhouse_workshop ? "Taller propio" : "Taller externo",
      bold: true,
    },
    { label: "Taller", value: report.is_inhouse_workshop ? "-" : toSafeText(report.workshop_name) },
    { label: "Telefono", value: report.is_inhouse_workshop ? "-" : toSafeText(report.workshop_phone) },
    { label: "Direccion", value: report.is_inhouse_workshop ? "-" : toSafeText(report.workshop_address) },
    { label: "Factura / Ticket", value: report.is_inhouse_workshop ? "-" : toSafeText(report.invoice_number) },
  ];
  const costsRows = [
    { label: "Mano de obra", value: formatCurrency(report.labor_cost) },
    { label: "Refacciones", value: formatCurrency(report.parts_cost) },
    {
      label: "Total",
      value: formatCurrency(report.total_cost),
      bold: true,
      valueColor: brandColor,
    },
  ];

  drawGrid({ rows: workshopRows, x: left, gridY: y, width: halfWidth });
  drawGrid({
    rows: costsRows,
    x: left + halfWidth + HALF_GAP,
    gridY: y,
    width: halfWidth,
  });
  const workshopBlockH =
    Math.max(workshopRows.length, costsRows.length) * ROW_H;
  y += workshopBlockH + SECTION_GAP;

  // ── Refacciones / Partes ──
  y = drawSectionTitle("REFACCIONES / PARTES", y);

  const COL_IDX = 26;
  const COL_DESC = Math.floor(contentWidth * 0.46);
  const COL_QTY = 54;
  const COL_UNIT = 90;
  const COL_SUB = contentWidth - COL_IDX - COL_DESC - COL_QTY - COL_UNIT;
  const TH = 24;
  const TR = 22;

  function drawPartsHead(atY) {
    doc.rect(left, atY, contentWidth, TH).fillAndStroke(brandColor, brandColor);
    let cx = left;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#FFFFFF");
    doc.text("#", cx + 6, atY + 8, { width: COL_IDX - 10, lineBreak: false });
    cx += COL_IDX;
    doc.text("Descripcion", cx + 6, atY + 8, {
      width: COL_DESC - 10,
      lineBreak: false,
    });
    cx += COL_DESC;
    doc.text("Cant.", cx + 4, atY + 8, {
      width: COL_QTY - 6,
      align: "right",
      lineBreak: false,
    });
    cx += COL_QTY;
    doc.text("P.U.", cx + 4, atY + 8, {
      width: COL_UNIT - 8,
      align: "right",
      lineBreak: false,
    });
    cx += COL_UNIT;
    doc.text("Subtotal", cx + 4, atY + 8, {
      width: COL_SUB - 8,
      align: "right",
      lineBreak: false,
    });
    return atY + TH;
  }

  let rowY = drawPartsHead(y);
  const safeParts = Array.isArray(parts) ? parts : [];

  if (safeParts.length === 0) {
    doc.rect(left, rowY, contentWidth, TR).fillAndStroke("#FAFAFA", C_BORDER);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(C_MUTED)
      .text("Sin refacciones registradas.", left + 10, rowY + 7, {
        width: contentWidth - 20,
        lineBreak: false,
      });
    rowY += TR;
  } else {
    safeParts.forEach((part, index) => {
      if (rowY + TR + 2 > maxY) {
        doc.addPage({ size: "LETTER", layout: "portrait", margin: 0 });
        rowY = 44;
        doc.rect(0, 0, 6, 40).fill(brandColor);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(C_DARK)
          .text(
            `Refacciones (cont.) \u2014 Folio ${toSafeText(report.folio)}`,
            left + 8,
            14,
            { lineBreak: false },
          );
        doc.lineWidth(2).moveTo(0, 40).lineTo(pageWidth, 40).stroke(brandColor);
        doc.lineWidth(0.5);
        rowY = drawPartsHead(rowY);
      }
      const isAlt = index % 2 === 1;
      doc
        .rect(left, rowY, contentWidth, TR)
        .fillAndStroke(isAlt ? C_ALT_ROW : "#FFFFFF", C_BORDER);
      let cx = left;
      const subtotal = Number(
        part?.subtotal ??
          Number(part?.quantity ?? 0) * Number(part?.unit_cost ?? 0),
      );
      doc.font("Helvetica").fontSize(8.5).fillColor(C_MID);
      doc.text(String(index + 1), cx + 6, rowY + 7, {
        width: COL_IDX - 10,
        lineBreak: false,
      });
      cx += COL_IDX;
      doc.text(toSafeText(part?.name), cx + 6, rowY + 7, {
        width: COL_DESC - 10,
        lineBreak: false,
        ellipsis: true,
      });
      cx += COL_DESC;
      doc.text(formatInteger(part?.quantity ?? 0), cx + 4, rowY + 7, {
        width: COL_QTY - 6,
        align: "right",
        lineBreak: false,
      });
      cx += COL_QTY;
      doc.text(formatCurrency(part?.unit_cost ?? 0), cx + 4, rowY + 7, {
        width: COL_UNIT - 8,
        align: "right",
        lineBreak: false,
      });
      cx += COL_UNIT;
      doc
        .font("Helvetica-Bold")
        .fillColor(C_DARK)
        .text(formatCurrency(subtotal), cx + 4, rowY + 7, {
          width: COL_SUB - 8,
          align: "right",
          lineBreak: false,
        });
      rowY += TR;
    });

    // Total summary row
    doc
      .rect(left, rowY, contentWidth, TR)
      .fillAndStroke(brandColorLight, C_BORDER);
    let cx = left + COL_IDX + COL_DESC + COL_QTY;
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(C_DARK)
      .text("Total:", cx + 4, rowY + 7, {
        width: COL_UNIT - 8,
        align: "right",
        lineBreak: false,
      });
    cx += COL_UNIT;
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(brandColor)
      .text(formatCurrency(report.total_cost), cx + 4, rowY + 7, {
        width: COL_SUB - 8,
        align: "right",
        lineBreak: false,
      });
    rowY += TR;
  }

  y = rowY + SECTION_GAP;

  // New page if not enough space for observations
  if (y + 100 > maxY) {
    doc.addPage({ size: "LETTER", layout: "portrait", margin: 0 });
    doc.rect(0, 0, 6, 40).fill(brandColor);
    doc.lineWidth(2).moveTo(0, 40).lineTo(pageWidth, 40).stroke(brandColor);
    doc.lineWidth(0.5);
    y = 56;
  }

  // ── Observaciones ──
  y = drawSectionTitle("OBSERVACIONES", y);

  const notesText = toSafeText(report.notes, "Sin observaciones");
  doc.font("Helvetica").fontSize(9);
  let notesH = 68;
  try {
    const measured = doc.heightOfString(notesText, {
      width: contentWidth - 20,
    });
    notesH = Math.max(60, Math.min(measured + 28, 160));
  } catch {}

  doc.rect(left, y, contentWidth, notesH).fillAndStroke("#FAFAFA", C_BORDER);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(C_DARK)
    .text(notesText, left + 10, y + 12, {
      width: contentWidth - 20,
      height: notesH - 20,
    });

  // ─── FOOTER (all pages) ────────────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const footerY = pageHeight - 28;
    doc
      .lineWidth(1.5)
      .moveTo(0, footerY - 8)
      .lineTo(pageWidth, footerY - 8)
      .stroke(brandColor);
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(brandColor)
      .text(
        `Generado por ${companyName}  \u00b7  ${formatDateTimeEs(new Date())}`,
        left,
        footerY,
        { width: contentWidth / 3, lineBreak: false, ellipsis: true },
      );
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#CBD5E1")
      .text("Hecho con Runly ERP", left + contentWidth / 3, footerY, {
        width: contentWidth / 3,
        align: "center",
        lineBreak: false,
      });
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(C_MUTED)
      .text(
        `Pagina ${i + 1} de ${range.count}`,
        right - contentWidth / 3,
        footerY,
        { width: contentWidth / 3, align: "right", lineBreak: false },
      );
  }

  doc.end();
  return done;
}

export async function buildReportPdfBuffer({ prisma, companyId, report }) {
  const branding = await resolveCompanyBranding({ prisma, companyId });
  const parts = Array.isArray(report?.parts) ? report.parts : [];
  return toPdfBuffer({ report, parts, branding });
}
