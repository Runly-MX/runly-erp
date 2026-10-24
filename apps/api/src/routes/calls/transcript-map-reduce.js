// Long-transcript pipeline (docs/superpowers/specs/2026-10-24-long-transcript-documents-design.md).
// A one-hour meeting is 15-20k tokens, far above the per-request/per-minute
// token limit of Groq's on_demand tier, so it is never sent in one call:
//   1. chunkSegments  — split by size, keeping timestamps
//   2. mapChunk       — one small call per chunk -> structured notes
//   3. buildDigest    — compact text of every chunk's notes (condensed
//                       recursively when it still does not fit)
//   4. reduce*        — one call over the digest for the global parts
// Every call goes through a token pacer so a long run stays under the TPM
// budget instead of failing with 413/429.

export const CHARS_PER_TOKEN = 3.2;
const MAP_MAX_TOKENS = 1800;
const REDUCE_MAX_TOKENS = 2200;
const PROMPT_OVERHEAD_TOKENS = 400;

export function resolveTokenBudget(env = process.env) {
  const n = Number(env.TRANSCRIPT_AI_TPM);
  return Number.isFinite(n) && n >= 3000 ? Math.floor(n) : 7500;
}

export function chunkMaxChars(budget) {
  return Math.max(3000, Math.min(14000, Math.floor(budget * 0.65)));
}

export function digestMaxChars(budget) {
  return Math.floor(budget * 0.5 * CHARS_PER_TOKEN);
}

export function formatMs(ms) {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// "74:57" or "1:14:57" -> ms; null when unparseable.
export function parseClock(value) {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return ((h * 60 + m) * 60 + s) * 1000;
}

export function extractJsonObject(text) {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export function segmentsToLines(segments) {
  const lines = [];
  for (const s of segments) {
    const prefix = `[${formatMs(s.startMs)}] ${s.speakerLabel ? `${s.speakerLabel}: ` : ""}`;
    lines.push({ startMs: s.startMs, endMs: s.endMs ?? s.startMs, text: `${prefix}${s.text}` });
  }
  return lines;
}

// `overlap` trailing lines of a chunk are repeated at the head of the next one
// as context only; the chunk's own range starts after them.
export function chunkSegments(segments, { maxChars = 5000, overlap = 2 } = {}) {
  const lines = segmentsToLines(segments);
  const chunks = [];
  let current = [];
  let size = 0;
  let ownFrom = 0;
  const flush = () => {
    if (current.length <= ownFrom) return;
    const own = current.slice(ownFrom);
    chunks.push({
      index: chunks.length,
      startMs: own[0].startMs,
      endMs: own[own.length - 1].endMs,
      text: current.map((l) => l.text).join("\n"),
    });
  };
  for (const line of lines) {
    // A single oversized segment is split so no chunk can exceed the limit.
    const pieces = line.text.length > maxChars
      ? line.text.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, "g")).map((text) => ({ ...line, text }))
      : [line];
    for (const piece of pieces) {
      if (size + piece.text.length + 1 > maxChars && current.length > ownFrom) {
        flush();
        const tail = current.slice(-overlap);
        current = [...tail];
        ownFrom = tail.length;
        size = tail.reduce((n, l) => n + l.text.length + 1, 0);
      }
      current.push(piece);
      size += piece.text.length + 1;
    }
  }
  flush();
  return chunks;
}

export function createTokenPacer({ budgetPerMinute = 7500, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const events = [];
  async function acquire(estimate) {
    const need = Math.min(estimate, budgetPerMinute);
    for (;;) {
      const t = now();
      while (events.length && t - events[0].at >= 60_000) events.shift();
      const used = events.reduce((n, e) => n + e.tokens, 0);
      if (used + need <= budgetPerMinute) {
        const event = { at: t, tokens: need };
        events.push(event);
        return event;
      }
      await sleep(Math.max(250, events[0].at + 60_000 - t));
    }
  }
  // Replace the reservation with what the provider reported once known.
  function settle(event, actualTokens) {
    if (Number.isFinite(actualTokens) && actualTokens > 0) event.tokens = actualTokens;
  }
  return { acquire, settle };
}

export function createPipelineRunner({ aiRouter, pacer, task = "transcript_analysis" }) {
  async function callJson({ system, user, maxTokens }) {
    const estimate = Math.ceil((system.length + user.length) / CHARS_PER_TOKEN) + maxTokens;
    const event = await pacer.acquire(estimate);
    const result = await aiRouter.runTask({
      task,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      jsonMode: true,
      reasoningEffort: "low",
      useMaxCompletionTokens: true,
      maxTokens,
      timeoutMs: 90_000,
      maxAttempts: 4,
      retryDelayMs: 4000,
      respectRateLimit: true,
      validateResponse: (msg) => Boolean(extractJsonObject(msg?.content)),
    });
    pacer.settle(event, result.usage?.total_tokens);
    const obj = extractJsonObject(result.message?.content);
    if (!obj) throw new Error("El servicio de IA no devolvio un JSON legible.");
    return { obj, model: result.model };
  }
  return { callJson };
}

const str = (v) => (typeof v === "string" ? v.trim() : "");
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

const MAP_SYSTEM = [
  "Eres un asistente que toma notas de una reunion de trabajo a partir de un FRAGMENTO de su transcripcion (cada linea empieza con su minuto [mm:ss]).",
  "Las primeras lineas pueden repetir contexto del fragmento anterior: usalas para entender, pero no dupliques lo ya cubierto.",
  "Devuelve SOLO un objeto JSON con esta forma exacta:",
  '{"sections":[{"title":string,"from":"mm:ss","gist":string,"body":string,"bullets":string[]}],"decisions":[{"text":string,"at":"mm:ss"}],"actions":[{"text":string,"owner":string,"due":string,"at":"mm:ss"}],"risks":[{"situation":string,"impact":string,"response":string}],"pending":string[]}',
  "sections: 1 a 3 temas tratados. title corto; gist una sola oracion; body 2-4 oraciones neutrales en espanol; bullets 0-4 datos concretos (cifras, equipos, plazos).",
  "decisions: solo acuerdos ya tomados. actions: tareas o compromisos; owner y due vacios si no se dijeron. pending: temas abiertos o por validar.",
  "Corrige terminos tecnicos evidentes del reconocimiento de voz solo si el contexto lo permite; ante la duda, no inventes. Listas vacias si no hay contenido.",
].join(" ");

function sanitizeNotes(obj, chunk) {
  const clampMs = (clock) => {
    const ms = parseClock(clock);
    return ms == null ? chunk.startMs : Math.min(Math.max(ms, chunk.startMs), chunk.endMs);
  };
  return {
    chunk: chunk.index,
    startMs: chunk.startMs,
    endMs: chunk.endMs,
    sections: (Array.isArray(obj.sections) ? obj.sections : [])
      .map((s) => ({ title: str(s?.title), startMs: clampMs(s?.from), gist: str(s?.gist), body: str(s?.body), bullets: strList(s?.bullets) }))
      .filter((s) => s.title && (s.body || s.gist)),
    decisions: (Array.isArray(obj.decisions) ? obj.decisions : [])
      .map((d) => ({ text: str(d?.text), startMs: clampMs(d?.at) })).filter((d) => d.text),
    actions: (Array.isArray(obj.actions) ? obj.actions : [])
      .map((a) => ({ text: str(a?.text), owner: str(a?.owner), due: str(a?.due), startMs: clampMs(a?.at) })).filter((a) => a.text),
    risks: (Array.isArray(obj.risks) ? obj.risks : [])
      .map((r) => ({ situation: str(r?.situation), impact: str(r?.impact), response: str(r?.response) })).filter((r) => r.situation),
    pending: strList(obj.pending),
  };
}

export async function mapChunk(runner, chunk) {
  const user = `Fragmento ${chunk.index + 1} (${formatMs(chunk.startMs)} a ${formatMs(chunk.endMs)}):\n${chunk.text}`;
  const { obj, model } = await runner.callJson({ system: MAP_SYSTEM, user, maxTokens: MAP_MAX_TOKENS });
  return { notes: sanitizeNotes(obj, chunk), model };
}

// Sections for the document are the per-chunk sections verbatim; adjacent
// duplicates created by the overlap are merged by title.
export function collectSections(notesList) {
  const out = [];
  for (const notes of notesList) {
    for (const s of notes.sections) {
      const last = out[out.length - 1];
      if (last && last.title.toLowerCase() === s.title.toLowerCase()) {
        last.endMs = notes.endMs;
        last.bullets = [...new Set([...last.bullets, ...s.bullets])];
        if (s.body && !last.body.includes(s.body)) last.body = `${last.body} ${s.body}`.trim();
      } else {
        out.push({ ...s, endMs: notes.endMs });
      }
    }
  }
  // A section ends where the next one starts.
  for (let i = 0; i < out.length - 1; i += 1) out[i].endMs = Math.max(out[i].startMs, out[i + 1].startMs);
  return out;
}

export function notesToDigestLines(notesList) {
  const lines = [];
  for (const n of notesList) {
    for (const s of n.sections) lines.push(`[${formatMs(s.startMs)}] Tema: ${s.title} - ${s.gist || s.body}`);
    for (const d of n.decisions) lines.push(`[${formatMs(d.startMs)}] Acuerdo: ${d.text}`);
    for (const a of n.actions) {
      lines.push(`[${formatMs(a.startMs)}] Compromiso: ${a.text}${a.owner ? ` (responsable: ${a.owner})` : ""}${a.due ? ` (plazo: ${a.due})` : ""}`);
    }
    for (const r of n.risks) lines.push(`Riesgo: ${r.situation}${r.impact ? ` -> ${r.impact}` : ""}${r.response ? ` | respuesta: ${r.response}` : ""}`);
    for (const p of n.pending) lines.push(`Pendiente: ${p}`);
  }
  return lines;
}

const CONDENSE_SYSTEM = [
  "Condensa estas notas de una reunion en menos lineas conservando TODO lo accionable (acuerdos, compromisos con responsable/plazo, riesgos, pendientes) y los minutos [mm:ss] de origen.",
  "Fusiona lineas repetidas. No inventes datos.",
  'Devuelve SOLO JSON: {"lines": string[]}',
].join(" ");

// Shrinks the digest until it fits one reduce call; each round condenses
// groups of lines, so cost grows with the log of the meeting length.
export async function buildDigest(runner, notesList, { maxChars, maxRounds = 4 }) {
  let lines = notesToDigestLines(notesList);
  for (let round = 0; round < maxRounds && lines.join("\n").length > maxChars; round += 1) {
    const groups = [];
    let group = [];
    let size = 0;
    for (const line of lines) {
      if (size + line.length + 1 > maxChars * 0.6 && group.length) { groups.push(group); group = []; size = 0; }
      group.push(line);
      size += line.length + 1;
    }
    if (group.length) groups.push(group);
    const next = [];
    for (const g of groups) {
      const { obj } = await runner.callJson({ system: CONDENSE_SYSTEM, user: g.join("\n"), maxTokens: MAP_MAX_TOKENS });
      next.push(...strList(obj.lines));
    }
    if (!next.length) break;
    lines = next;
  }
  const text = lines.join("\n");
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

const REDUCE_BASE = "Eres un asistente que redacta documentos formales de reuniones en espanol, neutrales y sin inventar datos. Recibes las notas ordenadas de TODA la reunion (con su minuto). Las propuestas no son decisiones ya autorizadas: usa 'se propuso' o 'se prevé' cuando no hubo acuerdo claro. Devuelve SOLO JSON.";

const REDUCE_MINUTA = [
  REDUCE_BASE,
  'Forma exacta: {"objective":string,"executiveSummary":string,"commitments":[{"text":string,"owner":string,"due":string}],"risks":[{"situation":string,"impact":string,"response":string}],"openDecisions":string[],"conclusions":string}',
  "objective: 1-2 oraciones. executiveSummary: 2 parrafos cortos separados por \\n\\n. commitments: consolida y deduplica los compromisos (owner = area o persona probable, o 'Por definir'; due = plazo o condicion, o 'Por definir'). risks: hasta 8. openDecisions: temas sin cerrar. conclusions: 2-3 oraciones con el seguimiento sugerido.",
].join(" ");

const REDUCE_RESUMEN = [
  REDUCE_BASE,
  'Forma exacta: {"overview":string,"findings":[{"title":string,"detail":string}],"priorities":string[]}',
  "overview: 2 oraciones sobre el proposito y enfoque. findings: entre 4 y 8 hallazgos o propuestas principales, title corto, detail 1-2 oraciones. priorities: 3-5 prioridades de seguimiento, accionables.",
].join(" ");

export async function reduceDocument(runner, kind, digest) {
  const system = kind === "RESUMEN" ? REDUCE_RESUMEN : REDUCE_MINUTA;
  const { obj, model } = await runner.callJson({ system, user: digest, maxTokens: REDUCE_MAX_TOKENS });
  if (kind === "RESUMEN") {
    return {
      model,
      content: {
        overview: str(obj.overview),
        findings: (Array.isArray(obj.findings) ? obj.findings : [])
          .map((f) => ({ title: str(f?.title), detail: str(f?.detail) })).filter((f) => f.title),
        priorities: strList(obj.priorities),
      },
    };
  }
  return {
    model,
    content: {
      objective: str(obj.objective),
      executiveSummary: str(obj.executiveSummary),
      commitments: (Array.isArray(obj.commitments) ? obj.commitments : [])
        .map((c) => ({ text: str(c?.text), owner: str(c?.owner) || "Por definir", due: str(c?.due) || "Por definir" })).filter((c) => c.text),
      risks: (Array.isArray(obj.risks) ? obj.risks : [])
        .map((r) => ({ situation: str(r?.situation), impact: str(r?.impact), response: str(r?.response) })).filter((r) => r.situation),
      openDecisions: strList(obj.openDecisions),
      conclusions: str(obj.conclusions),
    },
  };
}

// Stable fingerprint so cached notes are discarded when the transcript is
// regenerated with different segments.
export function sourceKeyOf(segments) {
  const last = segments[segments.length - 1];
  return `${segments.length}:${last?.endMs ?? 0}`;
}
