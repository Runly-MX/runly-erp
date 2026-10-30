// PDF de la minuta / resumen ejecutivo generados por MirAI a partir de una
// transcripción larga (CallTranscriptDocument.content). Texto real
// (seleccionable), mismo enfoque que transcriptExport.js.

import { pdfSafeText } from "./pdfText.js";

const NAVY = [24, 44, 68];
const TEAL = [15, 124, 134];
const GRAY = [95, 105, 120];
const ZEBRA = [243, 247, 249];
const MARGIN = 48;

function formatClock(ms) {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatDuration(ms) {
  if (!ms) return null;
  const minutes = Math.round(ms / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

const safeName = (title) => (title?.trim() || "documento").replace(/[^\p{L}\p{N}\-. ]+/gu, "_");

function createWriter(pdf) {
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const contentWidth = W - MARGIN * 2;
  const w = { y: 0, pdf, W, H, contentWidth };

  w.ensure = (needed) => {
    if (w.y + needed > H - 56) { pdf.addPage(); w.y = MARGIN; }
  };
  w.text = (text, { size = 10.5, bold = false, color = [30, 35, 45], x = MARGIN, width = contentWidth, gap = 4, lineHeight } = {}) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lh = lineHeight ?? size * 1.4;
    for (const line of pdf.splitTextToSize(pdfSafeText(text), width)) {
      w.ensure(lh);
      pdf.text(line, x, w.y + size);
      w.y += lh;
    }
    w.y += gap;
  };
  w.heading = (text) => {
    w.ensure(40);
    w.y += 8;
    w.text(text.toUpperCase(), { size: 9.5, bold: true, color: TEAL, gap: 2 });
    pdf.setDrawColor(215, 222, 228);
    pdf.line(MARGIN, w.y, W - MARGIN, w.y);
    w.y += 8;
  };
  w.subheading = (title, clock) => {
    w.ensure(36);
    w.text(clock ? `${title}   |   ${clock}` : title, { size: 11.5, bold: true, color: NAVY, gap: 3 });
  };
  w.bullets = (items) => {
    for (const item of items) {
      w.ensure(16);
      const top = w.y;
      w.text(item, { x: MARGIN + 14, width: contentWidth - 14, gap: 2 });
      pdf.setFillColor(...TEAL);
      pdf.circle(MARGIN + 5, top + 6, 1.6, "F");
    }
    w.y += 2;
  };
  w.table = (columns, rows) => {
    const widths = columns.map((c) => c.width * contentWidth);
    const pad = 6;
    const drawRow = (cells, { header = false, zebra = false } = {}) => {
      pdf.setFont("helvetica", header ? "bold" : "normal");
      pdf.setFontSize(header ? 9 : 9.5);
      const wrapped = cells.map((cell, i) => pdf.splitTextToSize(pdfSafeText(cell), widths[i] - pad * 2));
      const lines = Math.max(...wrapped.map((l) => l.length), 1);
      const height = lines * 13 + pad * 2 - 2;
      w.ensure(height);
      if (header) pdf.setFillColor(...NAVY);
      else if (zebra) pdf.setFillColor(...ZEBRA);
      if (header || zebra) pdf.rect(MARGIN, w.y, contentWidth, height, "F");
      pdf.setTextColor(...(header ? [255, 255, 255] : [30, 35, 45]));
      let x = MARGIN;
      wrapped.forEach((cellLines, i) => {
        cellLines.forEach((line, n) => pdf.text(line, x + pad, w.y + pad + 9 + n * 13));
        x += widths[i];
      });
      w.y += height;
    };
    drawRow(columns.map((c) => c.label), { header: true });
    rows.forEach((row, i) => drawRow(row, { zebra: i % 2 === 1 }));
    w.y += 8;
  };
  return w;
}

function header(w, { label, title, subtitle, meta }) {
  const { pdf, W } = w;
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 118, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 214, 222);
  pdf.text(label.toUpperCase(), MARGIN, 40);
  pdf.setFontSize(24);
  pdf.setTextColor(255, 255, 255);
  pdf.text(title, MARGIN, 72);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(205, 215, 226);
  pdf.text(pdf.splitTextToSize(pdfSafeText(subtitle), W - MARGIN * 2)[0] ?? "", MARGIN, 94);
  w.y = 138;
  if (meta.length) w.text(meta.join("   ·   "), { size: 9.5, color: GRAY, gap: 6 });
}

function footers(pdf, text) {
  const total = pdf.internal.getNumberOfPages();
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    pdf.setDrawColor(215, 222, 228);
    pdf.line(MARGIN, H - 40, W - MARGIN, H - 40);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...GRAY);
    pdf.text(text, MARGIN, H - 26);
    pdf.text(`Página ${i} de ${total}`, W - MARGIN, H - 26, { align: "right" });
  }
}

const DISCLAIMER = "Documento generado automáticamente por MirAI a partir de una transcripción de voz con posibles errores de reconocimiento. No equivale a un acta aprobada: confirmar fecha, asistentes, responsables, cifras y compromisos antes de circularlo como versión oficial.";

function renderMinuta(w, c) {
  if (c.objective) { w.heading("Objetivo"); w.text(c.objective); }
  if (c.executiveSummary) {
    w.heading("Resumen ejecutivo");
    for (const p of c.executiveSummary.split(/\n{2,}/)) w.text(p);
  }
  if (c.sections?.length) {
    w.heading("Desarrollo de la reunión");
    c.sections.forEach((s, i) => {
      w.subheading(`${i + 1}. ${s.title}`, `${formatClock(s.startMs)}–${formatClock(s.endMs)}`);
      if (s.body) w.text(s.body);
      if (s.bullets?.length) w.bullets(s.bullets);
    });
  }
  if (c.commitments?.length) {
    w.heading("Compromisos");
    w.table(
      [{ label: "#", width: 0.07 }, { label: "Compromiso / actividad", width: 0.53 }, { label: "Responsable", width: 0.2 }, { label: "Plazo", width: 0.2 }],
      c.commitments.map((x, i) => [String(i + 1).padStart(2, "0"), x.text, x.owner, x.due]),
    );
  }
  if (c.risks?.length) {
    w.heading("Riesgos relevantes");
    w.table(
      [{ label: "Situación", width: 0.3 }, { label: "Impacto potencial", width: 0.35 }, { label: "Respuesta sugerida", width: 0.35 }],
      c.risks.map((r) => [r.situation, r.impact, r.response]),
    );
  }
  if (c.openDecisions?.length) { w.heading("Decisiones aún no cerradas"); w.bullets(c.openDecisions); }
  if (c.conclusions) { w.heading("Conclusiones y seguimiento"); w.text(c.conclusions); }
}

function renderResumen(w, c) {
  if (c.overview) { w.heading("Panorama general"); w.text(c.overview); }
  if (c.findings?.length) {
    w.heading("Hallazgos y propuestas principales");
    c.findings.forEach((f, i) => {
      w.subheading(`${String(i + 1).padStart(2, "0")}  ${f.title}`);
      if (f.detail) w.text(f.detail, { x: MARGIN + 22, width: w.contentWidth - 22 });
    });
  }
  if (c.priorities?.length) {
    w.heading("Prioridades de seguimiento");
    w.bullets(c.priorities);
  }
}

export async function downloadTranscriptDocumentPdf(document, { callTitle } = {}) {
  const content = document?.content;
  if (!content) throw new Error("El documento todavía no está listo.");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const w = createWriter(pdf);
  const isMinuta = document.kind === "MINUTA";
  const subject = (callTitle || "").replace(/^Transcripción\s+—\s+/, "") || "Reunión";
  const meta = [
    content.callStartedAt && new Date(content.callStartedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }),
    formatDuration(content.durationMs) && `Duración aprox. ${formatDuration(content.durationMs)}`,
  ].filter(Boolean);

  header(w, {
    label: "Documento de trabajo",
    title: isMinuta ? "Minuta de reunión" : "Resumen ejecutivo",
    subtitle: subject,
    meta,
  });
  (isMinuta ? renderMinuta : renderResumen)(w, content);

  w.y += 10;
  w.ensure(60);
  w.text(DISCLAIMER, { size: 8.5, color: GRAY });
  footers(pdf, isMinuta ? "Minuta | Documento preliminar" : "Resumen ejecutivo | Documento preliminar");
  pdf.save(`${safeName(`${isMinuta ? "Minuta" : "Resumen"} ${subject}`)}.pdf`);
}
