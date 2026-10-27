import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaletteCommands } from "../paletteCommands.js";
import { buildCommandItems } from "../commandPalette.js";

const titles = (commands) => commands.map((c) => c.title);

test("MirAI and chat commands appear only when those features are available", () => {
  assert.deepEqual(buildPaletteCommands().map((c) => c.command), ["theme", "copy-link", "reload"]);
  const all = buildPaletteCommands({ miraiAvailable: true, chatAvailable: true, fullscreenEnabled: true });
  assert.deepEqual(all.map((c) => c.command), ["mirai-tab", "mirai-open", "chat-float", "theme", "fullscreen", "copy-link", "reload"]);
});

test("toggle titles follow the current state", () => {
  const hidden = buildPaletteCommands({ miraiAvailable: true, miraiTabHidden: true, chatAvailable: true, chatHidden: true, isDark: true, fullscreenEnabled: true, isFullscreen: true });
  assert.ok(titles(hidden).includes("Mostrar botón flotante de MirAI"));
  assert.ok(titles(hidden).includes("Mostrar chat flotante"));
  assert.ok(titles(hidden).includes("Cambiar a tema claro"));
  assert.ok(titles(hidden).includes("Salir de pantalla completa"));
  const shown = buildPaletteCommands({ miraiAvailable: true, chatAvailable: true });
  assert.ok(titles(shown).includes("Ocultar botón flotante de MirAI"));
  assert.ok(titles(shown).includes("Ocultar chat flotante"));
});

test("the palette lists commands, finds them by intent and keeps them in the actions mode", () => {
  const commands = buildPaletteCommands({ miraiAvailable: true, chatAvailable: true });
  const search = (query, mode = null) => buildCommandItems({ query, mode, commands }).flat.filter((i) => i.kind === "command").map((i) => i.command);
  assert.ok(search("").includes("mirai-tab"));
  assert.deepEqual(search("quitar chat"), ["chat-float"]);
  assert.ok(search("ocultar mirai").includes("mirai-tab"));
  assert.ok(search("oscuro").includes("theme"));
  assert.ok(search("", "actions").includes("copy-link"));
  assert.deepEqual(search("", "modules"), []);
});
