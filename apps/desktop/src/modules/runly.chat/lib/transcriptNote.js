// Saves a transcript, or a minuta / resumen generated from it, as a runly.notes
// note: recordings and their transcripts expire, notes do not.
import { formatTimestamp } from "./transcriptDisplay.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const p = (text) => (text ? `<p>${esc(text)}</p>` : "");
const h = (text) => `<h2>${esc(text)}</h2>`;
const ul = (items) => (items?.length ? `<ul>${items.map((i) => `<li><p>${esc(i)}</p></li>`).join("")}</ul>` : "");
const table = (head, rows) => (rows?.length
  ? `<table><tbody><tr>${head.map((c) => `<th><p>${esc(c)}</p></th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td><p>${esc(c)}</p></td>`).join("")}</tr>`).join("")}</tbody></table>`
  : "");
const paragraphs = (text) => String(text ?? "").split(/\n{2,}/).map(p).join("");

export const htmlToPlainText = (html) => html
  .replace(/<\/(p|h2|h3|li|tr)>/g, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\n{2,}/g, "\n")
  .trim();

export function documentToHtml(document) {
  const c = document?.content ?? {};
  if (document?.kind === "RESUMEN") {
    return [
      c.overview && h("Panorama general"), paragraphs(c.overview),
      c.findings?.length && h("Hallazgos y propuestas principales"),
      ...(c.findings ?? []).flatMap((f, i) => [`<h3>${String(i + 1).padStart(2, "0")}  ${esc(f.title)}</h3>`, p(f.detail)]),
      c.priorities?.length && h("Prioridades de seguimiento"), ul(c.priorities),
    ].filter(Boolean).join("");
  }
  return [
    c.objective && h("Objetivo"), p(c.objective),
    c.executiveSummary && h("Resumen ejecutivo"), paragraphs(c.executiveSummary),
    c.sections?.length && h("Desarrollo de la reunión"),
    ...(c.sections ?? []).flatMap((s, i) => [`<h3>${i + 1}. ${esc(s.title)} (${formatTimestamp(s.startMs)}–${formatTimestamp(s.endMs)})</h3>`, p(s.body), ul(s.bullets)]),
    c.commitments?.length && h("Compromisos"),
    table(["Compromiso", "Responsable", "Plazo"], (c.commitments ?? []).map((x) => [x.text, x.owner, x.due])),
    c.risks?.length && h("Riesgos relevantes"),
    table(["Situación", "Impacto potencial", "Respuesta sugerida"], (c.risks ?? []).map((r) => [r.situation, r.impact, r.response])),
    c.openDecisions?.length && h("Decisiones aún no cerradas"), ul(c.openDecisions),
    c.conclusions && h("Conclusiones y seguimiento"), p(c.conclusions),
    p("Generado automáticamente por MirAI a partir de una transcripción; confirma fechas, responsables y cifras antes de circularlo."),
  ].filter(Boolean).join("");
}

export function transcriptToHtml(transcript) {
  const lines = (transcript?.segments ?? []).map((s) => (
    `<p><strong>${formatTimestamp(s.startMs)}</strong> ${s.speakerLabel ? `<strong>${esc(s.speakerLabel)}:</strong> ` : ""}${esc(s.text)}</p>`
  ));
  return [p("Transcripción automática; puede contener errores de reconocimiento."), ...lines].join("");
}

export async function saveHtmlAsNote({ token, title, html }) {
  const { runly } = await import("../../../lib/runly");
  const res = await runly.notes.create({ title, content: html }, token);
  const note = res?.note ?? res?.data?.note ?? res;
  // The editor's autosave fills content_text; set it now so search finds the note.
  await runly.notes.update(note.id, { contentText: htmlToPlainText(html) }, token).catch(() => {});
  return note;
}
