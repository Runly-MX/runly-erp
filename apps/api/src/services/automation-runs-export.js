// CSV / Excel of the run history. One row per run with the per-block summary; the
// cells that start like a formula are neutralised (names and errors come from data).
import ExcelJS from "exceljs";

const STATUS = { success: "Correcta", partial: "Parcial", failed: "Falló", running: "En curso", waiting: "En espera", cancelled: "Cancelada", rejected: "Rechazada" };
const TRIGGER = { record: "Registro", event: "Evento", schedule: "Horario", delayed: "Tras una espera", webhook: "Webhook" };
const HEADERS = ["Fecha", "Automatización", "Resultado", "Disparador", "Duración (ms)", "Error", "Bloques"];

function blocks(steps) {
  return (Array.isArray(steps) ? steps : []).map((step) => `${step.index + 1}: ${step.skipped ? "omitido" : step.ok ? (step.waiting ? "en espera" : "ok") : "falló"}`).join(" · ");
}

export function runsTable(rows, labels = new Map()) {
  return rows.map((run) => [
    new Date(run.createdAt),
    labels.get(run.automationKey) ?? run.automationKey,
    STATUS[run.status] ?? run.status,
    TRIGGER[run.triggerKind] ?? run.triggerKind,
    run.durationMs ?? 0,
    run.error ?? "",
    blocks(run.steps),
  ]);
}

const safeText = (value) => (typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

function csvCell(value) {
  const text = value instanceof Date ? value.toISOString() : value === null || value === undefined ? "" : String(safeText(value));
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function buildRunsFile({ rows, labels, format }) {
  const table = runsTable(rows, labels);
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Historial");
    sheet.addRow(HEADERS).font = { bold: true };
    for (const line of table) sheet.addRow(line.map(safeText));
    sheet.getColumn(1).numFmt = "yyyy-mm-dd hh:mm:ss";
    [20, 30, 12, 16, 14, 50, 40].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    return { content: Buffer.from(await workbook.xlsx.writeBuffer()), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
  }
  const text = [HEADERS, ...table].map((line) => line.map(csvCell).join(",")).join("\r\n");
  return { content: Buffer.from(`﻿${text}`, "utf8"), type: "text/csv; charset=utf-8", ext: "csv" };
}
