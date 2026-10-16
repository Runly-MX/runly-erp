# Catálogo de capacidades MCP

Generado con `node scripts/generate-mcp-catalog.mjs`. No contiene datos de una instancia.

Las herramientas disponibles dependen del consentimiento OAuth. Cada operación revalida empresa, módulo, permisos y recurso. Las escrituras siguen `prepare → aprobación web → commit`.

| Herramienta | Scope | Aprobación |
| --- | --- | --- |
| `runly_whoami` | `runly:read` | none |
| `runly_companies_list` | `runly:read` | none |
| `runly_modules_list` | `runly:read` | none |
| `runly_module_schema` | `runly:read` | none |
| `runly_inventory_search` | `inventory:read` | none |
| `runly_inventory_get` | `inventory:read` | none |
| `runly_inventory_catalogs` | `inventory:read` | none |
| `runly_inventory_summary` | `inventory:read` | none |
| `runly_inventory_create_prepare` | `inventory:write` | web-session-explicit |
| `runly_inventory_update_prepare` | `inventory:write` | web-session-explicit |
| `runly_inventory_create_commit` | `inventory:write` | web-session-explicit |
| `runly_inventory_update_commit` | `inventory:write` | web-session-explicit |
| `runly_hr_query` | `hr:read` | none |
| `runly_hr_prepare` | `hr:write` | web-session-explicit |
| `runly_hr_commit` | `hr:write` | web-session-explicit |
| `runly_fleet_query` | `fleet:read` | none |
| `runly_fleet_prepare` | `fleet:write` | web-session-explicit |
| `runly_fleet_commit` | `fleet:write` | web-session-explicit |
| `runly_notes_query` | `notes:read` | none |
| `runly_notes_prepare` | `notes:write` | web-session-explicit |
| `runly_notes_commit` | `notes:write` | web-session-explicit |
| `runly_pfm_query` | `pfm:read` | none |
| `runly_pfm_prepare` | `pfm:write` | web-session-explicit |
| `runly_pfm_commit` | `pfm:write` | web-session-explicit |
| `runly_ledger_query` | `ledger:read` | none |
| `runly_ledger_prepare` | `ledger:write` | web-session-explicit |
| `runly_ledger_commit` | `ledger:write` | web-session-explicit |
| `runly_projects_query` | `projects:read` | none |
| `runly_projects_prepare` | `projects:write` | web-session-explicit |
| `runly_projects_commit` | `projects:write` | web-session-explicit |
| `runly_calendar_query` | `calendar:read` | none |
| `runly_calendar_prepare` | `calendar:write` | web-session-explicit |
| `runly_calendar_commit` | `calendar:write` | web-session-explicit |

## runly.hr

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `hr_employees_search` | Lectura | `hr.employee.read` |
| `hr_employee_detail` | Lectura | `hr.employee.read` |
| `hr_headcount_summary` | Lectura | `hr.employee.read` |
| `hr_users_eligible` | Lectura | `hr.employee.read` |
| `hr_departments` | Lectura | `hr.employee.read` |
| `hr_positions` | Lectura | `hr.employee.read` |
| `hr.employee.create` | Escritura aprobada | `hr.employee.create` |
| `hr.employee.update` | Escritura aprobada | `hr.employee.update` |

## runly.fleet

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `fleet_vehicles_search` | Lectura | `fleet.vehicles.read` |
| `fleet_vehicle_detail` | Lectura | `fleet.vehicles.read` |
| `fleet_summary` | Lectura | `fleet.vehicles.read` |
| `fleet_drivers_search` | Lectura | `fleet.drivers.read` |
| `fleet.vehicle.create` | Escritura aprobada | `fleet.vehicles.create` |
| `fleet.vehicle.update` | Escritura aprobada | `fleet.vehicles.update` |
| `fleet.insurance.create` | Escritura aprobada | `fleet.insurance.create` |
| `fleet.insurance.update` | Escritura aprobada | `fleet.insurance.update` |

## runly.notes

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `notes_search` | Lectura | `notes.notes.read` |
| `notes_get` | Lectura | `notes.notes.read` |
| `notes_folders` | Lectura | `notes.notes.read` |
| `notes_tags` | Lectura | `notes.notes.read` |
| `notes.note.create` | Escritura aprobada | `notes.notes.create` |
| `notes.note.rename_move` | Escritura aprobada | `notes.notes.update` |

## runly.pfm

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `pfm_overview` | Lectura | `pfm.wallets.read` |
| `pfm_list_wallets` | Lectura | `pfm.wallets.read` |
| `pfm_search_movements` | Lectura | `pfm.movements.read` |
| `pfm_spending_summary` | Lectura | `pfm.movements.read` |
| `pfm_budgets` | Lectura | `pfm.movements.read` |
| `pfm_upcoming` | Lectura | `pfm.movements.read` |
| `pfm_categories` | Lectura | `pfm.categories.read` |
| `pfm.movement.create` | Escritura aprobada | `pfm.movements.create` |
| `pfm.movement.update` | Escritura aprobada | `pfm.movements.update` |
| `pfm.budget.create` | Escritura aprobada | `pfm.budgets.manage` |
| `pfm.budget.update` | Escritura aprobada | `pfm.budgets.manage` |

## runly.ledger

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `ledger_accounts` | Lectura | `ledger.accounts.read` |
| `ledger_search_transactions` | Lectura | `ledger.transactions.read` |
| `ledger_summary` | Lectura | `ledger.transactions.read` |
| `ledger_categories` | Lectura | `ledger.categories.read` |
| `ledger.transaction.create` | Escritura aprobada | `ledger.transactions.create` |
| `ledger.transaction.update` | Escritura aprobada | `ledger.transactions.update` |

## runly.projects

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `projects_list_tasks` | Lectura | `projects.task.read` |
| `projects_task_summary` | Lectura | `projects.task.read` |
| `projects_list_projects` | Lectura | `projects.project.read` |
| `projects_detail` | Lectura | `projects.project.read` |
| `projects.task.create` | Escritura aprobada | `projects.task.create` |
| `projects.task.update` | Escritura aprobada | `projects.task.update` |
| `projects.project.create` | Escritura aprobada | `projects.project.create` |
| `projects.project.update` | Escritura aprobada | `projects.project.update` |

## runly.calendar

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `calendar_list_events` | Lectura | `calendar.events.read` |
| `calendar_summary` | Lectura | `calendar.events.read` |
| `calendar_free_slots` | Lectura | `calendar.events.read` |
| `calendar_calendars` | Lectura | `calendar.events.read` |
| `calendar.event.create` | Escritura aprobada | `calendar.events.create` |
| `calendar.event.update` | Escritura aprobada | `calendar.events.update` |

Inventario conserva sus ocho operaciones y sus cuatro herramientas base de identidad/descubrimiento. RME3 con metadata `mcp.version=1` continúa siendo solo descubrimiento; no se anuncia CRUD ejecutable.
