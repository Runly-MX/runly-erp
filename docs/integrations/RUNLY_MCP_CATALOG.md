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
| `runly_files_import_prepare` | `files:write` | web-session-explicit |
| `runly_files_import_commit` | `files:write` | web-session-explicit |
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
| `runly_contacts_query` | `contacts:read` | none |
| `runly_contacts_prepare` | `contacts:write` | web-session-explicit |
| `runly_contacts_commit` | `contacts:write` | web-session-explicit |
| `runly_purchases_query` | `purchases:read` | none |
| `runly_purchases_prepare` | `purchases:write` | web-session-explicit |
| `runly_purchases_commit` | `purchases:write` | web-session-explicit |
| `runly_canvas_query` | `canvas:read` | none |
| `runly_canvas_prepare` | `canvas:write` | web-session-explicit |
| `runly_canvas_commit` | `canvas:write` | web-session-explicit |
| `runly_attendance_query` | `attendance:read` | none |
| `runly_files_query` | `files:read` | none |
| `runly_documents_query` | `documents:read` | none |
| `runly_identity_query` | `identity:read` | none |
| `runly_activity_query` | `activity:read` | none |
| `runly_chat_query` | `chat:read` | none |

## runly.hr

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `hr_employees_search` | Lectura | `hr.employee.read` |
| `hr_employee_detail` | Lectura | `hr.employee.read` |
| `hr_headcount_summary` | Lectura | `hr.employee.read` |
| `hr_users_eligible` | Lectura | `hr.employee.read` |
| `hr_departments` | Lectura | `hr.employee.read` |
| `hr_positions` | Lectura | `hr.employee.read` |
| `hr_employees_page` | Lectura | `hr.employee.read` |
| `hr.employee.create` | Escritura aprobada | `hr.employee.create` + `hr.employee.read` |
| `hr.employee.update` | Escritura aprobada | `hr.employee.update` + `hr.employee.read` |

## runly.fleet

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `fleet_vehicles_search` | Lectura | `fleet.vehicles.read` |
| `fleet_vehicle_detail` | Lectura | `fleet.vehicles.read` |
| `fleet_summary` | Lectura | `fleet.vehicles.read` |
| `fleet_drivers_search` | Lectura | `fleet.drivers.read` |
| `fleet_vehicles_page` | Lectura | `fleet.vehicles.read` |
| `fleet_vehicle_documents` | Lectura | `fleet.vehicles.read` |
| `fleet_reports_page` | Lectura | `fleet.reports.read` |
| `fleet.vehicle.create` | Escritura aprobada | `fleet.vehicles.create` + `fleet.vehicles.read` |
| `fleet.vehicle.update` | Escritura aprobada | `fleet.vehicles.update` + `fleet.vehicles.read` |
| `fleet.insurance.create` | Escritura aprobada | `fleet.insurance.create` + `fleet.insurance.read` |
| `fleet.insurance.update` | Escritura aprobada | `fleet.insurance.update` + `fleet.insurance.read` |

## runly.notes

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `notes_search` | Lectura | `notes.notes.read` |
| `notes_get` | Lectura | `notes.notes.read` |
| `notes_folders` | Lectura | `notes.notes.read` |
| `notes_tags` | Lectura | `notes.notes.read` |
| `notes_page` | Lectura | `notes.notes.read` |
| `notes.note.create` | Escritura aprobada | `notes.notes.create` + `notes.notes.read` |
| `notes.note.rename_move` | Escritura aprobada | `notes.notes.update` + `notes.notes.read` |

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
| `pfm_native_movements_page` | Lectura | `pfm.movements.read` |
| `pfm.movement.create` | Escritura aprobada | `pfm.movements.create` + `pfm.movements.read` |
| `pfm.movement.update` | Escritura aprobada | `pfm.movements.update` + `pfm.movements.read` |
| `pfm.budget.create` | Escritura aprobada | `pfm.budgets.manage` + `pfm.wallets.read` |
| `pfm.budget.update` | Escritura aprobada | `pfm.budgets.manage` + `pfm.wallets.read` |

## runly.ledger

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `ledger_accounts` | Lectura | `ledger.accounts.read` |
| `ledger_search_transactions` | Lectura | `ledger.transactions.read` |
| `ledger_summary` | Lectura | `ledger.transactions.read` |
| `ledger_categories` | Lectura | `ledger.categories.read` |
| `ledger_transactions_page` | Lectura | `ledger.transactions.read` |
| `ledger_groups` | Lectura | `ledger.accounts.read` |
| `ledger.transaction.create` | Escritura aprobada | `ledger.transactions.create` + `ledger.transactions.read` |
| `ledger.transaction.update` | Escritura aprobada | `ledger.transactions.update` + `ledger.transactions.read` |

## runly.projects

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `projects_list_tasks` | Lectura | `projects.task.read` |
| `projects_task_summary` | Lectura | `projects.task.read` |
| `projects_list_projects` | Lectura | `projects.project.read` |
| `projects_detail` | Lectura | `projects.project.read` |
| `projects_page` | Lectura | `projects.project.read` |
| `projects_task_detail` | Lectura | `projects.task.read` |
| `projects.task.create` | Escritura aprobada | `projects.task.create` + `projects.task.read` |
| `projects.task.update` | Escritura aprobada | `projects.task.update` + `projects.task.read` |
| `projects.project.create` | Escritura aprobada | `projects.project.create` + `projects.project.read` |
| `projects.project.update` | Escritura aprobada | `projects.project.update` + `projects.project.read` |

## runly.calendar

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `calendar_list_events` | Lectura | `calendar.events.read` |
| `calendar_summary` | Lectura | `calendar.events.read` |
| `calendar_free_slots` | Lectura | `calendar.events.read` |
| `calendar_calendars` | Lectura | `calendar.calendars.read` |
| `calendar_events_page` | Lectura | `calendar.events.read` |
| `calendar.event.create` | Escritura aprobada | `calendar.events.create` + `calendar.events.read` |
| `calendar.event.update` | Escritura aprobada | `calendar.events.update` + `calendar.events.read` |
| `calendar.event.attendees.add` | Escritura aprobada | `calendar.events.update` + `calendar.events.read` |

## runly.contacts

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `contacts_search` | Lectura | `contacts.contacts.read` |
| `contacts_detail` | Lectura | `contacts.contacts.read` |
| `contacts_summary` | Lectura | `contacts.contacts.read` |
| `contacts.contact.create` | Escritura aprobada | `contacts.contacts.create` + `contacts.contacts.read` |
| `contacts.contact.update` | Escritura aprobada | `contacts.contacts.update` + `contacts.contacts.read` |

## runly.purchases

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `purchases_pending` | Lectura | `purchases.read` |
| `purchases_search_documents` | Lectura | `purchases.read` |
| `purchases_list_approvals` | Lectura | `purchases.approval.decide` |
| `purchases_spend_summary` | Lectura | `purchases.read` |
| `purchases.request.create` | Escritura aprobada | `purchases.request.create` + `purchases.request.read` |
| `purchases.approval.decide` | Escritura aprobada | `purchases.approval.decide` |

## runly.canvas

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `canvas_board_types` | Lectura | `canvas.view` |
| `canvas_boards` | Lectura | `canvas.view` |
| `canvas_board_summary` | Lectura | `canvas.view` |
| `canvas_hotspots` | Lectura | `canvas.view` |
| `canvas.board.create` | Escritura aprobada | `canvas.create` + `canvas.view` |
| `canvas.hotspot.update` | Escritura aprobada | `canvas.edit` + `canvas.view` |

## runly.attendance

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `attendance_person_status` | Lectura | `attendance.view` |
| `attendance_presence_now` | Lectura | `attendance.view` |
| `attendance_quota_compliance` | Lectura | `attendance.view` |
| `attendance_hours` | Lectura | `attendance.view` |
| `attendance_overtime` | Lectura | `attendance.view` |

## runly.files

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `files_search` | Lectura | `files.assets.read` |
| `files_metadata` | Lectura | `files.assets.read` |

## runly.documents

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `documents_search` | Lectura | `files.assets.read` |
| `documents_metadata` | Lectura | `files.assets.read` |

## runly.identity

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `identity_candidates` | Lectura | `identity.users.read` |

## runly.activity

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `activity_mine` | Lectura | `activity.read` |

## runly.chat

| Operación | Modo | Permiso ERP |
| --- | --- | --- |
| `chat_my_conversations` | Lectura | `chat.conversations.read` |

Inventario conserva sus ocho operaciones y sus cuatro herramientas base de identidad/descubrimiento. RME3 con metadata `mcp.version=1` continúa siendo solo descubrimiento; no se anuncia CRUD ejecutable.
