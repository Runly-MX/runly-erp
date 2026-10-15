// People / directory sources: contacts, users, employees, plus module help.
import { Prisma } from "@prisma/client";
import { likeAny } from "../../lib/search-tokens.js";
import { createHelpService } from "../help-service.js";
import { defineProvider, tokenSearch, firstNonEmpty, safeTitle, joinParts, fullName, enc } from "./helpers.js";

export const contactsProvider = defineProvider({
  source: "contacts",
  moduleKey: "runly.contacts",
  label: "Contactos",
  permission: "contacts.contacts.read",
  icon: "ContactRound",
  target: (id) => `/app/m/runly.contacts/contacts/${id}`,
  seeAllTarget: () => "/app/m/runly.contacts/contacts",
  search: ({ prisma, companyId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "contact t",
      select: "t.id, t.name, t.email, t.phone, t.type",
      scope: Prisma.sql`t.company_id = ${companyId}::uuid AND t.enabled = true`,
      columns: ["t.name", "t.legal_name", "t.email", "t.phone", "t.tax_id", "t.notes_markdown", "t.website", "t.industry", "array_to_string(t.tags, ' ')"],
      extras: (pattern) => [
        Prisma.sql`EXISTS (SELECT 1 FROM contact_address a WHERE a.contact_id = t.id AND (${likeAny(["a.label", "a.street", "a.neighborhood", "a.postal_code", "a.city", "a.state"], pattern)}))`,
      ],
      titleColumn: "t.name",
      orderBy: "t.name ASC",
      map: (r) => ({ id: r.id, title: safeTitle("Contacto sin nombre", r.name), subtitle: firstNonEmpty(r.email, r.phone, r.type), icon: "ContactRound" }),
    }),
});

export const usersProvider = defineProvider({
  source: "users",
  moduleKey: "runly.identity",
  label: "Usuarios",
  permission: "identity.users.read",
  icon: "Users",
  target: (id) => `/app/m/runly.identity/identity/users/${id}`,
  seeAllTarget: () => "/app/m/runly.identity/identity/users",
  search: ({ prisma, companyId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "membership m JOIN user_profile u ON u.id = m.user_id",
      select: "u.id, u.display_name, u.email",
      scope: Prisma.sql`m.company_id = ${companyId}::uuid AND m.enabled = true AND u.enabled = true AND u.is_bot = false`,
      columns: ["u.display_name", "u.email", "u.first_name", "u.last_name"],
      titleColumn: "u.display_name",
      orderBy: "u.display_name ASC",
      map: (r) => ({ id: r.id, title: safeTitle("Usuario", r.display_name, r.email), subtitle: firstNonEmpty(r.email), icon: "Users" }),
    }),
});

export const employeesProvider = defineProvider({
  source: "employees",
  moduleKey: "runly.hr",
  label: "Empleados",
  permission: "hr.employee.read",
  icon: "UserCheck",
  target: (id) => `/app/m/runly.hr/hr/employees/${id}`,
  seeAllTarget: () => "/app/m/runly.hr/hr/employees",
  search: ({ prisma, companyId, q, limit }) =>
    tokenSearch(prisma, {
      q,
      limit,
      from: "hr_employee t",
      select: "t.id, t.first_name, t.last_name, t.job_title, t.department, t.work_email, t.employee_code",
      scope: Prisma.sql`t.company_id = ${companyId}::uuid AND t.enabled = true`,
      columns: [
        "t.employee_code", "t.first_name", "t.last_name", "(t.first_name || ' ' || t.last_name)", "t.work_email",
        "t.personal_email", "t.phone", "t.job_title", "t.department", "t.manager_name", "t.work_location", "t.notes_markdown",
      ],
      titleColumn: "(t.first_name || ' ' || t.last_name)",
      orderBy: "t.first_name ASC, t.last_name ASC",
      map: (r) => ({
        id: r.id,
        title: safeTitle("Empleado sin nombre", fullName(r.first_name, r.last_name), r.employee_code),
        subtitle: joinParts([r.job_title, r.department]) ?? firstNonEmpty(r.work_email, r.employee_code),
        icon: "UserCheck",
      }),
    }),
});

export const helpProvider = defineProvider({
  source: "help",
  moduleKey: null,
  label: "Ayuda",
  permission: "runly.help.read",
  icon: "BookOpen",
  target: (id) => `/app/help?module=${enc(id)}`,
  async run({ prisma, q, limit }) {
    const helpService = createHelpService({ prisma });
    const results = await helpService.searchHelp(q);
    return results.slice(0, limit).map((r) => ({
      id: r.moduleKey,
      title: safeTitle("Ayuda", r.title),
      subtitle: `${r.moduleName} · ${r.snippet}`.slice(0, 140),
      icon: "BookOpen",
    }));
  },
});
