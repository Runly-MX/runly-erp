// apps/api/src/routes/chat/chat-commands-service.js
//
// Slash commands of the chat composer that run on the server: /estado, /nomolestar, /tarea.
// (/llamar and /ayuda run in the app.) The registry is a plain list so modules can add
// commands later. Every command acts only as the caller, inside their active company.
// Spec docs/superpowers/specs/2026-10-26-chat-commands-design.md.
import { ChatServiceError } from "./chat-service-error.js";

export const MAX_ARGS = 300;

// "30m", "1h", "2h", "hoy", "manana"/"mañana" -> ISO instant, or null to turn it off.
export function parseDndArgument(text, now = new Date()) {
  const raw = String(text ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (["off", "no", "apagar", "desactivar", "quitar"].includes(raw)) return { off: true };
  const minutes = /^(\d{1,3})\s*(m|min|minutos?)$/.exec(raw);
  const hours = /^(\d{1,2})\s*(h|hr|hrs|horas?)$/.exec(raw);
  if (minutes) return { until: new Date(now.getTime() + Number(minutes[1]) * 60_000) };
  if (hours) return { until: new Date(now.getTime() + Number(hours[1]) * 3_600_000) };
  if (raw === "" || raw === "1h") return { until: new Date(now.getTime() + 3_600_000) };
  if (raw === "manana") { const d = new Date(now); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(14, 0, 0, 0); return { until: d }; }
  return null;
}

// "🍽️ Comiendo" -> { emoji: "🍽️", text: "Comiendo" }; text alone gets a default emoji.
export function parseStatusArgument(text) {
  const raw = String(text ?? "").trim();
  if (!raw || ["limpiar", "quitar", "borrar", "off"].includes(raw.toLowerCase())) return { clear: true };
  const first = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(raw)][0]?.segment ?? "";
  if (/\p{Extended_Pictographic}/u.test(first)) return { emoji: first, text: raw.slice(first.length).trim() };
  return { emoji: "💬", text: raw };
}

export function createChatCommandsService({ prisma, statusService, projectsService, tasksService, announceStatus = null }) {
  const commands = {
    estado: async ({ profileId, args }) => {
      const parsed = parseStatusArgument(args);
      if (parsed.clear) { await statusService.setStatus(profileId, null); announceStatus?.(profileId); return { summary: "Quitaste tu estado." }; }
      const saved = await statusService.setStatus(profileId, { emoji: parsed.emoji, text: parsed.text || "Ocupado", expiresAt: null });
      announceStatus?.(profileId);
      return { summary: `Estado: ${saved?.emoji ?? ""} ${saved?.text ?? ""}`.trim() };
    },
    nomolestar: async ({ profileId, args }) => {
      const parsed = parseDndArgument(args);
      if (!parsed) throw new ChatServiceError("Usa /nomolestar 30m, 1h, mañana o off.", 400);
      const current = await statusService.getDnd(profileId);
      if (parsed.off) { await statusService.setDnd(profileId, { ...current, until: null }); announceStatus?.(profileId); return { summary: "No molestar desactivado." }; }
      await statusService.setDnd(profileId, { ...current, until: parsed.until.toISOString() });
      announceStatus?.(profileId);
      return { summary: "No molestar activado." };
    },
    tarea: async ({ profileId, companyId, conversationId, args }) => {
      const title = String(args ?? "").trim().slice(0, 200);
      if (!title) throw new ChatServiceError("Escribe el título: /tarea Llamar al cliente.", 400);
      const project = await projectsService.getOrCreatePersonalProject(companyId, profileId);
      const task = await tasksService.createTask(project.id, profileId, { title, description: `Creada desde el chat: /app/m/runly.chat/chat/inbox/${conversationId}` });
      return { summary: `Tarea creada: ${task.title}`, link: `/app/m/runly.projects?open=task:${task.id}&project=${project.id}` };
    },
  };

  async function run({ command, args, companyId, profileId, conversationId }) {
    const handler = commands[String(command ?? "").toLowerCase()];
    if (!handler) throw new ChatServiceError("Ese comando no existe.", 404);
    const text = String(args ?? "").slice(0, MAX_ARGS);
    if (conversationId) {
      const [member] = await prisma.$queryRaw`SELECT 1 FROM chat_conversation_members m JOIN chat_conversations c ON c.id = m.conversation_id AND c.company_id = ${companyId}::uuid WHERE m.conversation_id = ${conversationId}::uuid AND m.user_id = ${profileId}::uuid AND m.left_at IS NULL`;
      if (!member) throw new ChatServiceError("Conversación no encontrada.", 404);
    }
    return handler({ args: text, companyId, profileId, conversationId });
  }

  return { run, names: Object.keys(commands) };
}
