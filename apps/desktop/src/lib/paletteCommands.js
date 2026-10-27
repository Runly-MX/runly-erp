// Commands for the command palette (Ctrl+K): things to do, not places to go.
// Pure: the palette passes the current state and runs the chosen command id.

const command = (id, title, subtitle, keywords, icon) => ({
  key: `command:${id}`, kind: "command", command: id, title, subtitle, keywords, icon, color: undefined, target: null, blocked: false,
});

export function buildPaletteCommands({
  miraiAvailable = false,
  miraiTabHidden = false,
  chatAvailable = false,
  chatHidden = false,
  isDark = false,
  fullscreenEnabled = false,
  isFullscreen = false,
} = {}) {
  const items = [];
  if (miraiAvailable) {
    items.push(
      command("mirai-tab", miraiTabHidden ? "Mostrar botón flotante de MirAI" : "Ocultar botón flotante de MirAI",
        "Alt+M · MirAI sigue disponible con Alt+Shift+M", ["mirai", "asistente", "boton", "flotante", "ocultar", "mostrar", "quitar", "pestana"], "Sparkles"),
      command("mirai-open", "Abrir MirAI", "Alt+Shift+M · tu asistente en todo Runly", ["mirai", "asistente", "ia", "pregunta", "ayuda"], "Bot"),
    );
  }
  if (chatAvailable) {
    items.push(command("chat-float", chatHidden ? "Mostrar chat flotante" : "Ocultar chat flotante",
      "La burbuja de chat sobre las pantallas", ["chat", "mensajes", "burbuja", "flotante", "ocultar", "mostrar", "quitar"], "MessageSquare"));
  }
  items.push(command("theme", isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro", "Apariencia de Runly en este dispositivo",
    ["tema", "oscuro", "claro", "dark", "light", "modo", "apariencia", "noche"], isDark ? "Sun" : "Moon"));
  if (fullscreenEnabled) {
    items.push(command("fullscreen", isFullscreen ? "Salir de pantalla completa" : "Pantalla completa", "Oculta la barra del navegador",
      ["pantalla", "completa", "fullscreen", "maximizar"], "Maximize"));
  }
  items.push(
    command("copy-link", "Copiar enlace de esta página", "Lo copia al portapapeles", ["copiar", "enlace", "link", "url", "compartir"], "Link"),
    command("reload", "Recargar Runly", "Vuelve a cargar la aplicación", ["recargar", "actualizar", "refrescar", "reiniciar", "reload"], "RefreshCw"),
  );
  return items;
}
