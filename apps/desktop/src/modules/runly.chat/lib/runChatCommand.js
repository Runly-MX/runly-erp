import { toast } from "sonner";
import { runly } from "../../../lib/runly";
import { CHAT_COMMANDS } from "./chatCommands";

// Runs a parsed slash command: on the server (/estado, /nomolestar, /tarea) or in the app
// (/llamar, /ayuda). Shows the result as a toast; throws when it fails.
export async function runChatCommand({ command, args, conversationId, token, startCall }) {
  if (command.key === "ayuda") {
    toast.message("Comandos del chat", { description: CHAT_COMMANDS.filter((item) => item.key !== "ayuda").map((item) => `/${item.aliases[0]}: ${item.description}`).join("\n"), duration: 12000 });
    return;
  }
  if (command.key === "llamar") {
    if (!startCall || !conversationId) throw new Error("Las llamadas no están disponibles aquí.");
    await startCall({ conversationId, kind: "AUDIO" });
    return;
  }
  const res = await runly.chat.runCommand({ command: command.key, args, conversationId }, token);
  const result = res?.data ?? {};
  toast.success(result.summary ?? "Listo", result.link ? { action: { label: "Abrir", onClick: () => { window.location.assign(result.link); } } } : undefined);
}
