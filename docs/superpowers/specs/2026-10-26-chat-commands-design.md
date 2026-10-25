# Chat slash commands

Status: built (approved with "si" after saved messages). Slack gap 3.

## Design
- Typing `/` at the start of a message in the composer opens the existing slash menu with a **Comandos** group (before the module shortcuts such as `/inventario:taladro`, which keep working anywhere in the text). Commands are offered only at the start of the message and never open a record search.
- Sending `/comando argumentos` runs the command instead of posting it; anything that is not a known command is a normal message. A toast shows the result.
- Commands: `/estado [emoji] texto | limpiar`, `/nomolestar 30m | 1h | mañana | off`, `/tarea título` (creates a task in "Mis tareas" with a link back to the conversation), `/llamar` (starts a call here), `/ayuda` (lists commands). `/recordar` is not built: reminders are made from the message menu.
- Server commands run in `chat-commands-service.js` (`POST /chat/commands/run`), always as the caller, in the active company, in a conversation they belong to. The registry is a plain object so modules can add commands later; client list in `lib/chatCommands.js`.

## Testing
Unit: argument parsers, handlers, errors, slash menu rules (ui), client parser. E2E `.e2e/chat-commands-e2e.mjs` (9 checks).
