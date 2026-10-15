// Per-user workspace sources: ledger, projects/tasks, calendar, notes, canvas,
// files and chat conversations. Each one only returns rows the actor can see
// (owner, member, collaborator or shared), mirroring the module's own access
// rules. An item may carry its own `target` when it links to a parent record.
import { Prisma } from "@prisma/client";
import { toLocalIso } from "@runly/core";
import { defineProvider, tokenSearch, joinParts, safeTitle } from "./helpers.js";

const dateText = (value) => (value ? toLocalIso(new Date(value)) : null);

// Same visibility rule as routes/ledger/ledger-service.js (owner, account or group member).
function ledgerVisible(alias, actorId) {
  return Prisma.sql`(
    ${Prisma.raw(alias)}.owner_id = ${actorId}::uuid
    OR EXISTS (SELECT 1 FROM ledger_account_member m WHERE m.account_id = ${Prisma.raw(alias)}.id AND m.user_id = ${actorId}::uuid AND m.status = 'active')
    OR EXISTS (SELECT 1 FROM ledger_group_member gm JOIN ledger_group g ON g.id = gm.group_id AND g.enabled = true
               WHERE gm.group_id = ${Prisma.raw(alias)}.group_id AND gm.user_id = ${actorId}::uuid AND gm.status = 'active')
  )`;
}

export const ledgerAccountsProvider = defineProvider({
  source: "ledger_accounts",
  moduleKey: "runly.ledger",
  label: "Cuentas",
  permission: "ledger.accounts.read",
  icon: "Landmark",
  target: (id) => `/app/m/runly.ledger/accounts/${id}`,
  seeAllTarget: () => "/app/m/runly.ledger/accounts",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "ledger_account a",
      select: "a.id, a.name, a.bank, a.currency",
      scope: Prisma.sql`a.company_id = ${companyId}::uuid AND a.enabled = true AND ${ledgerVisible("a", actorId)}`,
      columns: ["a.name", "a.bank", "a.account_number"],
      titleColumn: "a.name",
      orderBy: "a.name ASC",
      map: (r) => ({ id: r.id, title: safeTitle("Cuenta", r.name), subtitle: joinParts([r.bank, r.currency]), icon: "Landmark" }),
    }),
});

export const ledgerTransactionsProvider = defineProvider({
  source: "ledger_transactions",
  moduleKey: "runly.ledger",
  label: "Movimientos",
  permission: "ledger.transactions.read",
  icon: "ArrowLeftRight",
  target: (id) => `/app/m/runly.ledger/accounts/${id}`,
  seeAllTarget: () => "/app/m/runly.ledger/accounts",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "ledger_transaction t JOIN ledger_account a ON a.id = t.account_id",
      select: "t.id, a.id AS account_id, a.name AS account_name, t.nombre, t.fecha, t.deposito, t.retiro",
      scope: Prisma.sql`t.company_id = ${companyId}::uuid AND t.enabled = true AND a.enabled = true AND ${ledgerVisible("a", actorId)}`,
      columns: ["t.numero", "t.nombre", "t.referencia", "t.concepto"],
      titleColumn: "t.nombre",
      orderBy: "t.fecha DESC",
      map: (r) => {
        const amount = r.deposito != null && Number(r.deposito) !== 0 ? `+${r.deposito}` : r.retiro != null ? `-${r.retiro}` : null;
        return {
          id: r.id,
          title: safeTitle("Movimiento", r.nombre),
          subtitle: joinParts([dateText(r.fecha), r.account_name, amount]),
          icon: "ArrowLeftRight",
          target: `/app/m/runly.ledger/accounts/${r.account_id}`,
        };
      },
    }),
});

const projectVisible = (actorId) => Prisma.sql`(
  p.owner_id = ${actorId}::uuid
  OR EXISTS (SELECT 1 FROM project_member pm WHERE pm.project_id = p.id AND pm.user_id = ${actorId}::uuid)
)`;

export const projectsProvider = defineProvider({
  source: "projects",
  moduleKey: "runly.projects",
  label: "Proyectos",
  permission: "projects.project.read",
  icon: "FolderKanban",
  target: (id) => `/app/m/runly.projects?open=project:${id}`,
  seeAllTarget: () => "/app/m/runly.projects",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "project p",
      select: "p.id, p.name, p.status, p.due_date",
      scope: Prisma.sql`p.company_id = ${companyId}::uuid AND p.status <> 'ARCHIVED' AND ${projectVisible(actorId)}`,
      columns: ["p.name", "p.description"],
      titleColumn: "p.name",
      orderBy: "p.updated_at DESC",
      map: (r) => ({ id: r.id, title: safeTitle("Proyecto", r.name), subtitle: joinParts([r.status, r.due_date && `vence ${dateText(r.due_date)}`]), icon: "FolderKanban" }),
    }),
});

export const tasksProvider = defineProvider({
  source: "tasks",
  moduleKey: "runly.projects",
  label: "Tareas",
  permission: "projects.task.read",
  icon: "ListChecks",
  target: (id) => `/app/m/runly.projects?open=task:${id}`,
  seeAllTarget: () => "/app/m/runly.projects",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "task t JOIN project p ON p.id = t.project_id JOIN task_status s ON s.id = t.status_id",
      select: "t.id, t.title, t.task_number, t.due_date, p.name AS project_name, s.name AS status_name",
      scope: Prisma.sql`p.company_id = ${companyId}::uuid AND p.status <> 'ARCHIVED' AND ${projectVisible(actorId)}`,
      columns: ["t.title", "t.description", "t.task_number", "p.name"],
      titleColumn: "t.title",
      orderBy: "t.updated_at DESC",
      map: (r) => ({
        id: r.id,
        title: safeTitle("Tarea", r.title),
        subtitle: joinParts([r.project_name, r.task_number != null && `#${r.task_number}`, r.status_name]),
        icon: "ListChecks",
      }),
    }),
});

export const calendarEventsProvider = defineProvider({
  source: "calendar_events",
  moduleKey: "runly.calendar",
  label: "Eventos",
  permission: "calendar.events.read",
  icon: "CalendarDays",
  target: (id) => `/app/m/runly.calendar/calendar?open=event:${id}`,
  seeAllTarget: () => "/app/m/runly.calendar/calendar",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "calendar_event e JOIN calendar_calendar cal ON cal.id = e.calendar_id",
      select: "e.id, e.title, e.start_at, e.location, cal.name AS calendar_name",
      scope: Prisma.sql`e.enabled = true AND cal.enabled = true AND cal.company_id = ${companyId}::uuid AND (
        cal.owner_id = ${actorId}::uuid
        OR EXISTS (SELECT 1 FROM calendar_share sh WHERE sh.calendar_id = cal.id AND sh.user_id = ${actorId}::uuid))`,
      columns: ["e.title", "e.description", "e.location"],
      titleColumn: "e.title",
      orderBy: "e.start_at DESC",
      map: (r) => ({ id: r.id, title: safeTitle("Evento", r.title), subtitle: joinParts([dateText(r.start_at), r.location, r.calendar_name]), icon: "CalendarDays" }),
    }),
});

export const notesProvider = defineProvider({
  source: "notes",
  moduleKey: "runly.notes",
  label: "Notas",
  permission: "notes.notes.read",
  icon: "NotebookPen",
  target: (id) => `/app/m/runly.notes/notes?note=${id}`,
  seeAllTarget: () => "/app/m/runly.notes/notes",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "notes n",
      select: "n.id, n.title, n.updated_at",
      scope: Prisma.sql`n.is_trashed = false AND n.is_archived = false AND n.deleted_at IS NULL AND (
        (n.owner_user_id = ${actorId}::uuid AND (n.company_id = ${companyId}::uuid OR n.company_id IS NULL))
        OR (n.company_id = ${companyId}::uuid AND EXISTS (SELECT 1 FROM note_shares sh WHERE sh.note_id = n.id AND sh.shared_with_user_id = ${actorId}::uuid)))`,
      columns: ["n.title", "n.content_text"],
      titleColumn: "n.title",
      orderBy: "n.updated_at DESC",
      map: (r) => ({ id: r.id, title: safeTitle("Nota sin titulo", r.title), subtitle: dateText(r.updated_at), icon: "NotebookPen" }),
    }),
});

export const canvasBoardsProvider = defineProvider({
  source: "canvas_boards",
  moduleKey: "runly.canvas",
  label: "Tableros",
  permission: "canvas.view",
  icon: "PenTool",
  target: (id) => `/app/m/runly.canvas/${id}`,
  seeAllTarget: () => "/app/m/runly.canvas",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "canvas_board b",
      select: "b.id, b.name, b.description",
      scope: Prisma.sql`b.company_id = ${companyId}::uuid AND b.archived_at IS NULL AND (
        b.owner_id = ${actorId}::uuid
        OR EXISTS (SELECT 1 FROM canvas_collaborator cc WHERE cc.board_id = b.id AND cc.user_id = ${actorId}::uuid))`,
      columns: ["b.name", "b.description"],
      titleColumn: "b.name",
      orderBy: "b.updated_at DESC",
      map: (r) => ({ id: r.id, title: safeTitle("Tablero", r.name), subtitle: joinParts([r.description]), icon: "PenTool" }),
    }),
});

// Conservative mirror of files/visibility.js: own uploads, accepted shares and
// company-wide files of the Files module itself (no module attachments).
export const filesProvider = defineProvider({
  source: "files",
  moduleKey: "runly.files",
  label: "Archivos",
  permission: "files.assets.read",
  icon: "File",
  target: (id) => `/app/m/runly.files/files/${id}`,
  seeAllTarget: () => "/app/m/runly.files/files",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "file_asset f",
      select: "f.id, f.original_name, f.mime_type, f.size_bytes",
      scope: Prisma.sql`f.entity_id = ${companyId}::uuid AND f.enabled = true AND f.entity_type = 'AtlasFile' AND (
        f.uploaded_by_id = ${actorId}::uuid
        OR EXISTS (SELECT 1 FROM file_asset_share s WHERE s.file_id = f.id AND s.user_id = ${actorId}::uuid AND s.status = 'ACCEPTED')
        OR (f.access_scope = 'COMPANY' AND (f.module_key IS NULL OR f.module_key IN ('runly.files', 'atlas.files'))))`,
      columns: ["f.original_name"],
      titleColumn: "f.original_name",
      orderBy: "f.created_at DESC",
      map: (r) => ({ id: r.id, title: safeTitle("Archivo", r.original_name), subtitle: joinParts([r.mime_type]), icon: "File" }),
    }),
});

// Only conversations the actor currently belongs to; message bodies are never searched.
export const chatConversationsProvider = defineProvider({
  source: "chat_conversations",
  moduleKey: "runly.chat",
  label: "Conversaciones",
  permission: "chat.conversations.read",
  icon: "MessageSquare",
  target: (id) => `/app/m/runly.chat/chat/inbox/${id}`,
  seeAllTarget: () => "/app/m/runly.chat/chat/inbox",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: Prisma.sql`chat_conversations c
        JOIN chat_conversation_members me ON me.conversation_id = c.id AND me.user_id = ${actorId}::uuid AND me.left_at IS NULL
        LEFT JOIN LATERAL (
          SELECT string_agg(u.display_name, ', ' ORDER BY u.display_name) AS names
          FROM chat_conversation_members cm JOIN user_profile u ON u.id = cm.user_id
          WHERE cm.conversation_id = c.id AND cm.left_at IS NULL AND cm.user_id <> ${actorId}::uuid
        ) mem ON true`,
      select: "c.id, c.type, c.title, mem.names AS member_names",
      scope: Prisma.sql`c.company_id = ${companyId}::uuid AND c.deleted_at IS NULL`,
      columns: ["c.title", "mem.names"],
      titleColumn: "coalesce(c.title, mem.names)",
      orderBy: "c.last_message_at DESC NULLS LAST",
      map: (r) => ({
        id: r.id,
        title: safeTitle("Conversacion", r.title, r.member_names),
        subtitle: r.type === "direct" ? "Mensaje directo" : r.type === "group" ? "Grupo" : "Soporte externo",
        icon: "MessageSquare",
      }),
    }),
});
