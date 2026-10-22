import { FleetServiceError } from "./fleet-service.js";
import {
  resolvePdfDocumentCtor,
  resolveCompanyBranding,
  drawPdfFooter,
  toSafeText,
  compact,
  normalizeHexColor,
  lightenHex,
  formatDateEs,
} from "../../services/pdf-branding-service.js";

const VEHICLE_STATUS_LABELS = {
  active: "Activo",
  maintenance: "En mantenimiento",
  inactive: "Inactivo",
  retired: "Retirado",
};

const STATUS_COLORS = {
  active: "#059669",
  maintenance: "#D97706",
  inactive: "#64748B",
  retired: "#DC2626",
};

const COVERAGE_LABELS = {
  basic: "Basica",
  comprehensive: "Integral",
  third_party: "Terceros",
  other: "Otra",
};

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount)
    : "-";
};

const C_DARK = "#0F172A";
const C_MID = "#334155";
const C_MUTED = "#64748B";
const C_BORDER = "#E2E8F0";
const C_SOFT = "#F8FAFC";

async function toPdfBuffer({ vehicle, branding }) {
  const PDFDocument = await resolvePdfDocumentCtor();
  if (typeof PDFDocument !== "function") {
    throw new FleetServiceError(
      "La generacion de PDF no esta disponible. Falta dependencia de pdf en API.",
      503,
    );
  }

  const brandColor = normalizeHexColor(branding.primaryColor ?? "#0F766E", "#0F766E");
  const brandTint = lightenHex(brandColor, 0.9);
  const companyName = toSafeText(branding.companyName, "Runly ERP");
  const logoBuffer = Buffer.isBuffer(branding.logoBuffer) ? branding.logoBuffer : null;
  const statusKey = String(vehicle.status ?? "").toLowerCase();
  const statusText = VEHICLE_STATUS_LABELS[statusKey] ?? toSafeText(vehicle.status, "-");
  const statusColor = STATUS_COLORS[statusKey] ?? C_MUTED;

  const doc = new PDFDocument({ margin: 0, size: "LETTER", layout: "portrait", bufferPages: true });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width;
  const MARGIN = 44;
  const left = MARGIN;
  const right = pageWidth - MARGIN;
  const contentWidth = right - left;

  // ─── HEADER BAND (brand colour) ───────────────────────────────────────────────
  const HEADER_H = 172;
  doc.rect(0, 0, pageWidth, HEADER_H).fill(brandColor);
  // Soft decorative circles keep the band from looking flat.
  doc.save();
  doc.fillOpacity(0.1).circle(pageWidth - 40, 20, 110).fill("#FFFFFF");
  doc.fillOpacity(0.07).circle(pageWidth - 170, HEADER_H + 10, 80).fill("#FFFFFF");
  doc.restore();

  const LOGO = 38;
  doc.roundedRect(left, 26, LOGO, LOGO, 8).fill("#FFFFFF");
  let logoDrawn = false;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, left + 4, 30, { fit: [LOGO - 8, LOGO - 8], align: "center", valign: "center" });
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) {
    doc
      .font("Helvetica-Bold").fontSize(14).fillColor(brandColor)
      .text(companyName.slice(0, 2).toUpperCase(), left, 38, { width: LOGO, align: "center", lineBreak: false });
  }
  doc
    .font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF")
    .text(companyName, left + LOGO + 12, 31, { width: contentWidth * 0.55, lineBreak: false, ellipsis: true });
  doc
    .font("Helvetica").fontSize(8).fillColor("#FFFFFF").opacity(0.8)
    .text(compact([branding.rfc && branding.rfc !== "-" ? `RFC ${branding.rfc}` : null, branding.phone && branding.phone !== "-" ? branding.phone : null]).join("   ·   ") || "Ficha de vehiculo", left + LOGO + 12, 47, { width: contentWidth * 0.55, lineBreak: false, ellipsis: true })
    .opacity(1);

  doc
    .font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF").opacity(0.75)
    .text("FICHA DE VEHICULO", right - 200, 32, { width: 200, align: "right", lineBreak: false, characterSpacing: 1 })
    .opacity(1);
  doc
    .font("Helvetica").fontSize(8).fillColor("#FFFFFF").opacity(0.75)
    .text(`Generada el ${formatDateEs(new Date())}`, right - 200, 46, { width: 200, align: "right", lineBreak: false })
    .opacity(1);

  // Plate + model
  const modelLine = compact([vehicle.vehicle_brand_name, vehicle.vehicle_model_name, vehicle.vehicle_model_year]).join(" ");
  doc
    .font("Helvetica-Bold").fontSize(34).fillColor("#FFFFFF")
    .text(toSafeText(vehicle.plate), left, 82, { width: contentWidth * 0.62, lineBreak: false, ellipsis: true });
  doc
    .font("Helvetica").fontSize(12).fillColor("#FFFFFF").opacity(0.9)
    .text(modelLine || toSafeText(vehicle.vehicle_type_name, "Sin modelo registrado"), left, 124, { width: contentWidth * 0.62, lineBreak: false, ellipsis: true })
    .opacity(1);

  // Status pill
  const PILL_W = 118;
  doc.roundedRect(right - PILL_W, 92, PILL_W, 24, 12).fill("#FFFFFF");
  doc.circle(right - PILL_W + 14, 104, 4).fill(statusColor);
  doc
    .font("Helvetica-Bold").fontSize(9).fillColor(C_DARK)
    .text(statusText, right - PILL_W + 24, 99, { width: PILL_W - 30, lineBreak: false, ellipsis: true });

  // ─── KPI TILES (overlap the band) ─────────────────────────────────────────────
  const economic = vehicle.full_economic_number ?? vehicle.economic_individual_number;
  const kpis = [
    { label: "NO. ECONOMICO", value: toSafeText(economic) },
    { label: "TIPO", value: toSafeText(vehicle.vehicle_type_name) },
    { label: "ANO", value: toSafeText(vehicle.vehicle_model_year) },
    { label: "FINANCIADO", value: vehicle.is_financed ? "Si" : "No" },
  ];
  const KPI_GAP = 10;
  const KPI_H = 54;
  const kpiW = Math.floor((contentWidth - KPI_GAP * (kpis.length - 1)) / kpis.length);
  const kpiY = HEADER_H - KPI_H / 2;
  kpis.forEach((kpi, i) => {
    const x = left + i * (kpiW + KPI_GAP);
    doc.roundedRect(x, kpiY, kpiW, KPI_H, 8).fillAndStroke("#FFFFFF", C_BORDER);
    doc
      .font("Helvetica-Bold").fontSize(6.5).fillColor(C_MUTED)
      .text(kpi.label, x + 12, kpiY + 12, { width: kpiW - 24, lineBreak: false, characterSpacing: 0.6 });
    doc
      .font("Helvetica-Bold").fontSize(13).fillColor(C_DARK)
      .text(kpi.value, x + 12, kpiY + 26, { width: kpiW - 24, lineBreak: false, ellipsis: true });
  });

  let y = kpiY + KPI_H + 24;

  // ─── CARD HELPERS ─────────────────────────────────────────────────────────────
  function cardTitle(title, atY) {
    doc.roundedRect(left, atY + 1, 3, 12, 1.5).fill(brandColor);
    doc
      .font("Helvetica-Bold").fontSize(9).fillColor(C_DARK)
      .text(title.toUpperCase(), left + 11, atY + 3, { lineBreak: false, characterSpacing: 0.8 });
    return atY + 24;
  }

  // Label above value, N columns, no heavy grid lines.
  function fieldGrid(fields, atY, columns = 3) {
    const gap = 14;
    const w = Math.floor((contentWidth - gap * (columns - 1)) / columns);
    let rowY = atY;
    for (let i = 0; i < fields.length; i += columns) {
      fields.slice(i, i + columns).forEach((field, j) => {
        const x = left + j * (w + gap);
        doc
          .font("Helvetica-Bold").fontSize(6.5).fillColor(C_MUTED)
          .text(field.label.toUpperCase(), x, rowY, { width: w, lineBreak: false, characterSpacing: 0.5 });
        let textX = x;
        if (field.swatch) {
          doc.circle(x + 5, rowY + 17, 5).fillAndStroke(field.swatch, C_BORDER);
          textX = x + 15;
        }
        doc
          .font("Helvetica").fontSize(10).fillColor(field.color ?? C_DARK)
          .text(toSafeText(field.value), textX, rowY + 11, { width: w - (textX - x), lineBreak: false, ellipsis: true });
      });
      rowY += 38;
    }
    return rowY;
  }

  function softPanel(atY, height) {
    doc.roundedRect(left, atY, contentWidth, height, 10).fillAndStroke(C_SOFT, C_BORDER);
  }

  // ─── IDENTIFICACION ───────────────────────────────────────────────────────────
  y = cardTitle("Identificacion", y);
  y = fieldGrid(
    [
      { label: "Matricula", value: vehicle.plate },
      { label: "Marca", value: vehicle.vehicle_brand_name },
      { label: "Modelo", value: vehicle.vehicle_model_name },
      { label: "Tipo", value: vehicle.vehicle_type_name },
      { label: "Color", value: vehicle.color, swatch: /^#[0-9a-f]{3,8}$/i.test(String(vehicle.color ?? "")) ? vehicle.color : null },
      { label: "Estado", value: statusText, color: statusColor },
    ],
    y,
  );
  y += 8;

  // ─── CONDUCTOR ────────────────────────────────────────────────────────────────
  y = cardTitle("Conductor asignado", y);
  const PANEL_H = 56;
  softPanel(y, PANEL_H);
  if (vehicle.driver_name) {
    const initials = vehicle.driver_name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    doc.circle(left + 30, y + PANEL_H / 2, 18).fill(brandTint);
    doc
      .font("Helvetica-Bold").fontSize(12).fillColor(brandColor)
      .text(initials, left + 12, y + PANEL_H / 2 - 7, { width: 36, align: "center", lineBreak: false });
    doc
      .font("Helvetica-Bold").fontSize(11).fillColor(C_DARK)
      .text(vehicle.driver_name, left + 60, y + 13, { width: contentWidth - 80, lineBreak: false, ellipsis: true });
    doc
      .font("Helvetica").fontSize(8.5).fillColor(C_MUTED)
      .text(
        compact([
          vehicle.driver_phone ? `Tel. ${vehicle.driver_phone}` : null,
          vehicle.driver_license_number ? `Licencia ${vehicle.driver_license_number}` : null,
        ]).join("   ·   ") || "Sin datos de contacto",
        left + 60, y + 31, { width: contentWidth - 80, lineBreak: false, ellipsis: true },
      );
  } else {
    doc
      .font("Helvetica").fontSize(9.5).fillColor(C_MUTED)
      .text("Esta unidad no tiene un chofer asignado.", left + 16, y + 21, { width: contentWidth - 32, lineBreak: false });
  }
  y += PANEL_H + 20;

  // ─── POLIZA ───────────────────────────────────────────────────────────────────
  const policy = vehicle.active_insurance_policy ?? null;
  y = cardTitle("Poliza de seguro", y);
  if (policy) {
    y = fieldGrid(
      [
        { label: "Aseguradora", value: policy.insurer_name },
        { label: "No. de poliza", value: policy.policy_number },
        { label: "Cobertura", value: policy.coverage_type_label ?? COVERAGE_LABELS[policy.coverage_type] ?? policy.coverage_type },
        { label: "Vigencia hasta", value: policy.expiry_date ? formatDateEs(policy.expiry_date) : "-" },
      ],
      y,
      4,
    );
  } else {
    doc.font("Helvetica").fontSize(9.5).fillColor(C_MUTED).text("Sin poliza de seguro activa.", left, y, { lineBreak: false });
    y += 24;
  }
  y += 8;

  // ─── FINANCIAMIENTO ───────────────────────────────────────────────────────────
  if (vehicle.is_financed) {
    y = cardTitle("Financiamiento", y);
    y = fieldGrid(
      [
        { label: "Financiera", value: vehicle.financing_institution },
        { label: "No. de contrato", value: vehicle.financing_contract_number },
        { label: "Mensualidad", value: vehicle.financing_monthly_payment != null ? money(vehicle.financing_monthly_payment) : "-" },
        { label: "Inicio", value: vehicle.financing_start_date ? formatDateEs(vehicle.financing_start_date) : "-" },
        { label: "Termino", value: vehicle.financing_end_date ? formatDateEs(vehicle.financing_end_date) : "-" },
      ],
      y,
    );
    y += 8;
  }

  // ─── OBSERVACIONES ────────────────────────────────────────────────────────────
  if (vehicle.notes) {
    y = cardTitle("Observaciones", y);
    const notesText = toSafeText(vehicle.notes);
    const PAD = 12;
    doc.font("Helvetica").fontSize(9);
    const textH = doc.heightOfString(notesText, { width: contentWidth - PAD * 2 });
    const maxH = doc.page.height - 70 - y;
    const panelH = Math.min(textH + PAD * 2, maxH);
    softPanel(y, panelH);
    doc
      .font("Helvetica").fontSize(9).fillColor(C_MID)
      .text(notesText, left + PAD, y + PAD, { width: contentWidth - PAD * 2, height: panelH - PAD * 2, ellipsis: true });
  }

  // ─── FOOTER (all pages) ───────────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    drawPdfFooter(doc, { branding, pageNumber: i + 1, totalPages: range.count });
  }

  doc.end();
  return done;
}

export async function buildVehiclePdfBuffer({ prisma, companyId, vehicle }) {
  const branding = await resolveCompanyBranding({ prisma, companyId });
  return toPdfBuffer({ vehicle, branding });
}
