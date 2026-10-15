// Global search registry used by GET /search and MirAI's search_runly.
//
// A provider is: { source, moduleKey|null, label, permission, icon,
//   target(id), seeAllTarget?(q), search({ prisma, companyId, actorId, q, limit })
//   -> { items, total } }  (or run(...) -> items for simple providers).
// Items: { id, title, subtitle?, icon, matchedIn?, target? }. All queries must be
// company-scoped, exclude logically deleted rows and respect per-user access.
//
// To add a module: write its provider(s) in a file of this folder (use
// defineProvider/tokenSearch from helpers.js), append them to SEARCH_PROVIDERS
// below and add its label to SEARCH_MODULE_LABELS. RME3 custom modules (tables
// created by the Runly ORM) are not searched yet; the extension point is a
// future provider factory that reads each installed module's searchable fields.
import {
  contactsProvider, usersProvider, employeesProvider, helpProvider,
} from "./directory-providers.js";
import { inventoryProvider } from "./inventory-provider.js";
import { purchaseOrdersProvider, purchaseInvoicesProvider, purchaseCasesProvider } from "./purchases-providers.js";
import {
  ledgerAccountsProvider, ledgerTransactionsProvider, projectsProvider, tasksProvider, calendarEventsProvider,
  notesProvider, canvasBoardsProvider, filesProvider, chatConversationsProvider,
} from "./workspace-providers.js";

export const SEARCH_MODULE_LABELS = {
  "runly.inventory": "Inventario",
  "runly.purchases": "Compras",
  "runly.contacts": "Contactos",
  "runly.hr": "Recursos humanos",
  "runly.identity": "Usuarios y roles",
  "runly.ledger": "Libro mayor",
  "runly.projects": "Proyectos",
  "runly.calendar": "Calendario",
  "runly.files": "Archivos",
  "runly.notes": "Notas",
  "runly.canvas": "Canvas",
  "runly.chat": "Chat",
};

export const SEARCH_PROVIDERS = [
  inventoryProvider,
  purchaseOrdersProvider,
  purchaseInvoicesProvider,
  purchaseCasesProvider,
  contactsProvider,
  employeesProvider,
  usersProvider,
  ledgerAccountsProvider,
  ledgerTransactionsProvider,
  projectsProvider,
  tasksProvider,
  calendarEventsProvider,
  filesProvider,
  notesProvider,
  canvasBoardsProvider,
  chatConversationsProvider,
  helpProvider,
];

export { runSearch } from "./run-search.js";
