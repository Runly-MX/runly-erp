// Minuta of a call for company automations (spec
// docs/superpowers/specs/2026-10-31-automations-calls-chat-autoreply-design.md §A):
// who attended, and a minuta written by MirAI (the MINUTA document of the transcript)
// or, without AI, a plain one: header, possible agreements found by keywords and the
// transcript by speaker. Both become an email-sized text and a PDF.
import PDFDocument from "pdfkit";
import { isLocalEnabled } from "../../services/ai/ai-providers.js";
import { formatMs } from "./transcript-map-reduce.js";

export const MAX_MINUTES_TEXT = 4500;
const MAX_HIGHLIGHTS = 15;
// Words that usually mark an agreement, a task or something left open.
const KEYWORDS = /\b(acord\w*|acuerdo\w*|comprom\w+|quedamos|queda en|pendiente\w*|tarea\w*|entreg\w+|fecha l[ií]mite|responsable\w*|decid\w+|siguiente paso\w*|seguimiento)\b/i;

export class CallMinutesError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "CallMinutesError";
    this.status = status;
  }
}

// Who attended a call: members that joined and external guests that were let in.
export async function listCallParticipants(prisma, { companyId, callId, scope = "all" }) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: {
      id: true, conversationId: true,
      participants: { where: { joinedAt: { not: null } }, select: { userId: true, user: { select: { displayName: true, firstName: true, lastName: true, email: true, isBot: true } } } },
      guests: { where: { admittedAt: { not: null } }, select: { id: true, displayName: true, email: true, invite: { select: { email: true } } } },
    },
  });
  if (!call) throw new CallMinutesError("La llamada no existe.", 404);
  const [conversation] = await prisma.$queryRaw`SELECT company_id FROM chat_conversations WHERE id = ${call.conversationId}::uuid LIMIT 1`;
  if (String(conversation?.company_id ?? "") !== String(companyId)) throw new CallMinutesError("La llamada no existe.", 404);
  const internal = call.participants.filter((row) => !row.user?.isBot).map((row) => ({
    id: row.userId, name: row.user.displayName || `${row.user.firstName} ${row.user.lastName}`.trim(), email: row.user.email ?? null, internal: true, userId: row.userId,
  }));
  const external = call.guests.map((row) => ({ id: row.id, name: row.displayName, email: row.email ?? row.invite?.email ?? null, internal: false, userId: null }));
  return { conversationId: call.conversationId, items: scope === "internal" ? internal : scope === "external" ? external : [...internal, ...external] };
}

const speakerName = (segment, names) => segment.speakerUser?.displayName || names.get(segment.speakerGuestId) || segment.speakerLabel || "Participante";

// Minuta without AI: what was said, by whom and when, plus the lines that look like
// agreements or pending items.
export function plainMinutes({ header, segments, guestNames = new Map() }) {
  const lines = segments.map((segment) => ({ at: formatMs(segment.startMs), speaker: speakerName(segment, guestNames), text: String(segment.text ?? "").trim() })).filter((line) => line.text);
  return { kind: "PLAIN", ...header, highlights: lines.filter((line) => KEYWORDS.test(line.text)).slice(0, MAX_HIGHLIGHTS), transcript: lines };
}

// Minuta written by MirAI (content of the MINUTA document).
export function aiMinutes({ header, content }) {
  return {
    kind: "AI", ...header,
    objective: content.objective ?? null,
    summary: content.executiveSummary ?? null,
    sections: (content.sections ?? []).map((section) => ({ title: section.title, at: formatMs(section.startMs ?? 0), body: section.body ?? "", bullets: section.bullets ?? [] })),
    commitments: (content.commitments ?? []).map((item) => ({ text: item.text, owner: item.owner ?? "", due: item.due ?? "" })),
    openDecisions: content.openDecisions ?? [],
  };
}

function headerLines(minutes) {
  return [
    minutes.title ? `Minuta: ${minutes.title}` : "Minuta de la reunión",
    [minutes.date && `Fecha: ${minutes.date}`, minutes.duration && `Duración: ${minutes.duration}`].filter(Boolean).join(" · "),
    minutes.participants?.length ? `Participantes: ${minutes.participants.join(", ")}` : "",
  ].filter(Boolean);
}

// Email body: the important part first, cut to fit (the PDF keeps everything).
export function minutesText(minutes, max = MAX_MINUTES_TEXT) {
  const out = [...headerLines(minutes), ""];
  if (minutes.kind === "AI") {
    if (minutes.objective) out.push("Objetivo", minutes.objective, "");
    if (minutes.summary) out.push("Resumen", minutes.summary, "");
    if (minutes.commitments.length) out.push("Compromisos", ...minutes.commitments.map((item) => `- ${item.text}${item.owner ? ` (${item.owner}` : ""}${item.owner && item.due ? `, ${item.due})` : item.owner ? ")" : item.due ? ` (${item.due})` : ""}`), "");
    if (minutes.openDecisions.length) out.push("Pendiente de decidir", ...minutes.openDecisions.map((item) => `- ${item}`), "");
    if (minutes.sections.length) out.push("Temas", ...minutes.sections.map((section) => `- ${section.title}`), "");
  } else {
    if (minutes.highlights.length) out.push("Posibles acuerdos y pendientes", ...minutes.highlights.map((line) => `- [${line.at}] ${line.speaker}: ${line.text}`), "");
    out.push("Transcripción", ...minutes.transcript.map((line) => `[${line.at}] ${line.speaker}: ${line.text}`));
  }
  const text = out.join("\n").trim();
  return text.length > max ? `${text.slice(0, max - 60).trimEnd()}\n\n(Continúa en el PDF adjunto.)` : text;
}

// The standard PDF fonts only cover Latin-1 and a few symbols.
const pdfSafe = (text) => String(text ?? "").normalize("NFC").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—‘’“”•…]/g, "");

export function minutesPdf(minutes) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 56, bottom: 56, left: 60, right: 60 }, info: { Title: pdfSafe(minutes.title || "Minuta") } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const heading = (text) => doc.moveDown(0.8).font("Helvetica-Bold").fontSize(12).fillColor("#18181b").text(pdfSafe(text)).moveDown(0.3);
    const body = (text, options = {}) => doc.font("Helvetica").fontSize(10).fillColor("#27272a").text(pdfSafe(text), options);
    const [first, ...rest] = headerLines(minutes);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#18181b").text(pdfSafe(first));
    for (const line of rest) doc.moveDown(0.2).font("Helvetica").fontSize(10).fillColor("#52525b").text(pdfSafe(line));
    if (minutes.kind === "AI") {
      if (minutes.objective) { heading("Objetivo"); body(minutes.objective); }
      if (minutes.summary) { heading("Resumen ejecutivo"); body(minutes.summary); }
      if (minutes.sections.length) {
        heading("Desarrollo de la reunión");
        minutes.sections.forEach((section, index) => {
          doc.moveDown(0.4).font("Helvetica-Bold").fontSize(10.5).fillColor("#18181b").text(pdfSafe(`${index + 1}. ${section.title} (${section.at})`));
          if (section.body) body(section.body);
          for (const bullet of section.bullets) body(`•  ${bullet}`, { indent: 10 });
        });
      }
      if (minutes.commitments.length) { heading("Compromisos"); for (const item of minutes.commitments) body(`•  ${item.text}${item.owner ? ` — ${item.owner}` : ""}${item.due ? ` (${item.due})` : ""}`); }
      if (minutes.openDecisions.length) { heading("Decisiones pendientes"); for (const item of minutes.openDecisions) body(`•  ${item}`); }
    } else {
      body("Minuta generada sin IA: incluye la transcripción completa y las frases que parecen acuerdos o pendientes.", { oblique: true });
      if (minutes.highlights.length) { heading("Posibles acuerdos y pendientes"); for (const line of minutes.highlights) body(`•  [${line.at}] ${line.speaker}: ${line.text}`); }
      heading("Transcripción");
      for (const line of minutes.transcript) {
        doc.moveDown(0.25).font("Helvetica-Bold").fontSize(9.5).fillColor("#3f3f46").text(pdfSafe(`${line.speaker}  ${line.at}`));
        body(line.text);
      }
    }
    doc.end();
  });
}

const durationText = (ms) => {
  if (!ms) return null;
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

export function createCallMinutesService({ prisma, filesService = null, documents, env = process.env }) {
  async function timeZone() {
    const row = await prisma.instanceConfig.findUnique({ where: { key: "instance_time_zone" }, select: { value: true } }).catch(() => null);
    return row?.value || "America/Mexico_City";
  }

  async function generate({ companyId, transcriptId, mode = "auto", source = null }) {
    const transcript = await prisma.callTranscript.findFirst({
      where: { id: transcriptId, companyId },
      include: { segments: { orderBy: { startMs: "asc" }, include: { speakerUser: { select: { displayName: true } } } } },
    });
    if (!transcript) throw new CallMinutesError("La transcripción no existe.", 404);
    if (transcript.status !== "READY") throw new CallMinutesError("La transcripción todavía no está lista.", 409);
    if (!transcript.segments.length) throw new CallMinutesError("La transcripción no tiene contenido.", 422);
    const aiReady = Boolean(env.GROQ_API_KEY) || isLocalEnabled(env);
    if (mode === "ai" && !aiReady) throw new CallMinutesError("MirAI no está configurado en esta instancia: usa el modo sin IA.", 422);

    const [call] = await prisma.$queryRaw`SELECT c.started_at, conv.title FROM call c JOIN chat_conversations conv ON conv.id = c.conversation_id WHERE c.id = ${transcript.callId}::uuid LIMIT 1`;
    const people = await listCallParticipants(prisma, { companyId, callId: transcript.callId });
    const startedAt = call?.started_at ?? transcript.createdAt;
    const header = {
      title: call?.title || null,
      date: new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: await timeZone() }).format(new Date(startedAt)),
      duration: durationText(transcript.durationMs ?? transcript.segments.at(-1)?.endMs),
      participants: people.items.map((person) => person.name),
    };
    const guestNames = new Map(people.items.filter((person) => !person.internal).map((person) => [person.id, person.name]));
    const minutes = mode !== "plain" && aiReady
      ? aiMinutes({ header, content: (await documents.generateNow({ transcriptId, kind: "MINUTA", profileId: transcript.requestedByUserId })).content })
      : plainMinutes({ header, segments: transcript.segments, guestNames });

    if (!filesService) throw new CallMinutesError("El almacenamiento de archivos no está disponible en esta instancia.", 503);
    const pdf = await minutesPdf(minutes);
    const name = `Minuta ${(header.title || "reunión").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80)} ${new Date(startedAt).toLocaleDateString("en-CA")}.pdf`;
    const asset = await filesService.uploadForCompany({
      companyId,
      file: new File([pdf], name, { type: "application/pdf" }),
      fields: { moduleKey: "runly.files", entityType: "AtlasFile", shareWithCompany: true, metadata: { source: source ?? { moduleKey: "runly.calls", sourceEntityId: transcriptId }, minutes: { transcriptId, kind: minutes.kind } } },
    });
    return { id: asset.id, name: asset.originalName ?? name, text: minutesText(minutes), mode: minutes.kind === "AI" ? "ai" : "plain" };
  }

  return { generate };
}
