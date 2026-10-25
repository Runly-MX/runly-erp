// Global-search providers for chat messages and the modules added with the Slack-parity
// work (LMS courses, fleet vehicles, company automations). Spec
// docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 5.
import { Prisma } from "@prisma/client";
import { defineProvider, tokenSearch, safeTitle, joinParts } from "./helpers.js";

const snippet = (body) => String(body ?? "").replace(/\s+/g, " ").trim().slice(0, 110);

// Only conversations the person belongs to (the same rule as the in-chat search).
export const chatMessagesProvider = defineProvider({
  source: "chat_messages",
  moduleKey: "runly.chat",
  label: "Mensajes",
  permission: "chat.conversations.read",
  icon: "MessageSquareText",
  target: () => "/app/m/runly.chat/chat/inbox",
  seeAllTarget: () => "/app/m/runly.chat/chat/inbox",
  search: ({ prisma, companyId, actorId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: Prisma.sql`chat_messages m
        JOIN chat_conversations c ON c.id = m.conversation_id
        JOIN chat_conversation_members me ON me.conversation_id = c.id AND me.user_id = ${actorId}::uuid AND me.left_at IS NULL
        LEFT JOIN user_profile u ON u.id = m.sender_user_id`,
      select: "m.id, m.body, m.conversation_id, c.type, c.title AS conv_title, u.display_name AS sender_name",
      scope: Prisma.sql`c.company_id = ${companyId}::uuid AND c.deleted_at IS NULL AND m.deleted_at IS NULL
        AND m.body <> '' AND (m.sender_type <> 'system' OR m.metadata ? 'integration')`,
      columns: ["m.body"],
      titleColumn: "m.body",
      orderBy: "m.created_at DESC",
      map: (r) => ({
        id: r.id,
        title: safeTitle("Mensaje", snippet(r.body)),
        subtitle: joinParts([r.conv_title ?? (r.type === "direct" ? "Mensaje directo" : "Conversación"), r.sender_name]),
        icon: "MessageSquareText",
        target: `/app/m/runly.chat/chat/inbox/${r.conversation_id}?msg=${r.id}`,
      }),
    }),
});

export const lmsCoursesProvider = defineProvider({
  source: "lms_courses",
  moduleKey: "runly.lms",
  label: "Cursos",
  permission: "lms.course.manage",
  icon: "GraduationCap",
  target: (id) => `/app/m/runly.lms/courses/${id}`,
  seeAllTarget: () => "/app/m/runly.lms/courses",
  search: ({ prisma, companyId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "lms_course c",
      select: "c.id, c.title, c.category, c.status",
      scope: Prisma.sql`c.company_id = ${companyId}::uuid AND c.enabled = true`,
      columns: ["c.title", "c.summary", "c.category"],
      titleColumn: "c.title",
      orderBy: "c.updated_at DESC",
      map: (r) => ({
        id: r.id,
        title: safeTitle("Curso", r.title),
        subtitle: joinParts([r.category, r.status === "published" ? "Publicado" : "Borrador"]),
        icon: "GraduationCap",
      }),
    }),
});

export const fleetVehiclesProvider = defineProvider({
  source: "fleet_vehicles",
  moduleKey: "runly.fleet",
  label: "Vehículos",
  permission: "fleet.vehicles.read",
  icon: "Truck",
  target: (id) => `/app/m/runly.fleet/vehicles/${id}`,
  seeAllTarget: () => "/app/m/runly.fleet/vehicles",
  search: ({ prisma, companyId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "fleet_vehicle v",
      select: "v.id, v.plate, v.model_name, v.economic_group_number, v.economic_individual_number",
      scope: Prisma.sql`v.company_id = ${companyId}::uuid AND v.enabled = true`,
      columns: ["v.plate", "v.model_name", "v.economic_group_number", "v.economic_individual_number"],
      titleColumn: "v.plate",
      orderBy: "v.plate ASC",
      map: (r) => ({
        id: r.id,
        title: safeTitle("Vehículo", r.plate),
        subtitle: joinParts([r.model_name, r.economic_group_number && `Económico ${r.economic_group_number}${r.economic_individual_number ? `-${r.economic_individual_number}` : ""}`]),
        icon: "Truck",
      }),
    }),
});

export const automationsProvider = defineProvider({
  source: "automations",
  moduleKey: "runly.automations",
  label: "Automatizaciones",
  permission: "automations.read",
  icon: "Workflow",
  target: () => "/app/m/runly.automations",
  seeAllTarget: () => "/app/m/runly.automations",
  search: ({ prisma, companyId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "system_automation a",
      select: "a.id, a.key, a.label, a.enabled",
      scope: Prisma.sql`a.company_id = ${companyId}::uuid`,
      columns: ["a.label", "a.key"],
      titleColumn: "a.label",
      orderBy: "a.updated_at DESC",
      map: (r) => ({
        id: r.id,
        title: safeTitle("Automatización", r.label, r.key),
        subtitle: r.enabled ? "Activa" : "En pausa",
        icon: "Workflow",
      }),
    }),
});
