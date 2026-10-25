// Slash commands of the chat composer. Spec docs/superpowers/specs/2026-10-26-chat-commands-design.md.
// `where: "server"` commands run through POST /chat/commands/run; "app" ones run in the interface.
export const CHAT_COMMANDS = [
  { key: "estado", aliases: ["estado"], label: "Estado", description: "Cambia tu estado: /estado 🍽️ Comiendo", where: "server" },
  { key: "nomolestar", aliases: ["nomolestar", "dnd"], label: "No molestar", description: "/nomolestar 30m, 1h, mañana u off", where: "server" },
  { key: "tarea", aliases: ["tarea"], label: "Crear tarea", description: "Crea una tarea en Mis tareas: /tarea Llamar al cliente", where: "server" },
  { key: "llamar", aliases: ["llamar"], label: "Llamar", description: "Inicia una llamada en esta conversación", where: "app" },
  { key: "ayuda", aliases: ["ayuda", "comandos"], label: "Ayuda", description: "Muestra los comandos disponibles", where: "app" },
];

const fold = (value) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// "/estado en reunión" -> { command, args }; anything that is not a known command stays a normal message.
export function parseCommand(text) {
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(String(text ?? "").trim());
  if (!match) return null;
  const alias = fold(match[1]);
  const command = CHAT_COMMANDS.find((item) => item.aliases.includes(alias));
  return command ? { command, args: (match[2] ?? "").trim() } : null;
}
