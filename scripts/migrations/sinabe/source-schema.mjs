// Field catalog of the CURRENT sinabe schema (backend/prisma/schema.prisma,
// 29 migrations up to 20260128075800_catchup_drift). sinabe uses no @map /
// @@map, so table names equal model names and column names equal field names.
//
// Kinds: s string/enum, i int, f float, b boolean, d DateTime, j Json.
// Deliberately omitted (never migrated, sensitive): User.password,
// CustodyRecord.publicToken, CustodyRecord.tokenExpiresAt.
const spec = (text) => Object.fromEntries(text.trim().split(/\s+/).map((pair) => pair.split(':')))

export const SINABE_TABLES = {
  inventories: { table: 'Inventory', fields: spec(`id:s status:s createdById:s activeNumber:s serialNumber:s comments:s modelId:i enabled:b
    receptionDate:d createdAt:d updatedAt:d details:j altaDate:d bajaDate:d internalFolio:s invoiceId:s purchaseOrderId:s locationId:i`) },
  models: { table: 'Model', fields: spec('id:i name:s typeId:i brandId:i enabled:b') },
  inventoryTypes: { table: 'InventoryType', fields: spec('id:i enabled:b name:s') },
  inventoryBrands: { table: 'InventoryBrand', fields: spec('id:i name:s enabled:b') },
  locations: { table: 'InventoryLocation', fields: spec('id:i name:s enabled:b') },
  conditions: { table: 'Condition', fields: spec('id:i name:s enabled:b') },
  inventoryConditions: { table: 'InventoryCondition', fields: spec('id:i inventoryId:s conditionId:i') },
  customFields: { table: 'CustomField', fields: spec('id:i name:s enabled:b createdAt:d') },
  inventoryCustomFields: { table: 'InventoryCustomField', fields: spec('id:i inventoryId:s customFieldId:i value:s') },
  verticals: { table: 'Vertical', fields: spec('id:i name:s enabled:b createdAt:d description:s updatedAt:d') },
  modelVerticals: { table: 'ModelVertical', fields: spec('id:i modelId:i verticalId:i') },
  purchaseOrders: { table: 'PurchaseOrder', fields: spec('id:s code:s supplier:s description:s projectId:s createdAt:d updatedAt:d createdById:s') },
  invoices: { table: 'Invoice', fields: spec(`id:s code:s concept:s supplier:s fileUrl:s purchaseOrderId:s createdAt:d updatedAt:d
    createdById:s xmlUrl:s`) },
  files: { table: 'File', fields: spec('id:s inventoryId:s metadata:j uploadedAt:d createdAt:d enabled:b type:s url:s') },
  images: { table: 'Image', fields: spec('id:s url:s thumbnail:s type:s metadata:j createdAt:d enabled:b inventoryId:s') },
  users: { table: 'User', fields: spec(`id:s firstName:s lastName:s email:s userName:s phone:s status:b roleId:i createdAt:d updatedAt:d
    enabled:b employeeNumber:s jobTitle:s department:s`) },
  userImages: { table: 'UserImage', fields: spec('id:s url:s thumbnail:s type:s metadata:j enabled:b createdAt:d userId:s') },
  custodyRecords: { table: 'CustodyRecord', fields: spec(`id:s code:s date:d receiverId:s delivererId:s comments:s fileId:s status:s
    receiverSignature:s delivererSignature:s enabled:b createdAt:d updatedAt:d`) },
  custodyItems: { table: 'CustodyItem', fields: spec(`id:s custodyRecordId:s inventoryId:s typeBrand:s model:s serialNumber:s
    assetNumber:s invoiceNumber:s features:s`) },
  auditLogs: { table: 'AuditLog', fields: spec('id:s entityType:s entityId:s action:s entityTitle:s changes:s userId:s createdAt:d') },
  projects: { table: 'Project', fields: spec(`id:s code:s name:s description:s provider:s status:s budgetTotal:f budgetUsed:f
    startDate:d endDate:d createdAt:d updatedAt:d enabled:b createdById:s`) },
  deadlines: { table: 'Deadline', fields: spec(`id:s name:s description:s status:s dueDate:d projectId:s createdAt:d updatedAt:d
    enabled:b createdById:s order:i`) },
  deadlineTasks: { table: 'DeadlineTask', fields: spec(`id:s name:s date:d deadlineId:s enabled:b createdAt:d updatedAt:d
    createdById:s description:s order:i status:s`) },
  inventoryDeadlines: { table: 'InventoryDeadline', fields: spec('id:s inventoryId:s deadlineId:s') },
  projectMembers: { table: 'ProjectMember', fields: spec('id:s role:s name:s projectId:s userId:s') },
  projectDocuments: { table: 'ProjectDocument', fields: spec(`id:s name:s fileUrl:s description:s metadata:j enabled:b uploadDate:d
    projectId:s createdAt:d updatedAt:d createdById:s`) },
  events: { table: 'Event', fields: spec(`id:s title:s description:s scheduledDate:d completedDate:d status:s provider:s type:s
    scope:s verticalId:i isRecurring:b recurrence:s recurrenceEndDate:d seriesId:s createdAt:d updatedAt:d createdById:s`) },
  eventAttendees: { table: 'EventAttendee', fields: spec('id:s eventId:s userId:s') },
  // Prisma implicit many-to-many tables: A = Deadline/DeadlineTask id, B = User id.
  deadlineUsers: { table: '_DeadlineUsers', fields: spec('A:s B:s'), rename: { A: 'deadlineId', B: 'userId' } },
  taskUsers: { table: '_TaskUsers', fields: spec('A:s B:s'), rename: { A: 'taskId', B: 'userId' } },
}

export const MIGRATIONS_TABLE = '_prisma_migrations'

// Migrations of the current sinabe schema (backend/prisma/migrations), oldest first.
export const SINABE_MIGRATIONS = [
  '20250608235543_init', '20250608235622_modern_project_logic', '20250612022738_add_enum_status_and_restructurte_tasks_and_deadliens',
  '20250612043730_add_deadlinetask_status', '20250614155907_add_user_id_to_teammembers', '20250615191904_change_description_type_to_text',
  '20250617023559_relationate_invoice_with_inventory', '20250619033037_refactor_verticals', '20250619035058_add_vertical_description',
  '20250627031955_append_xmlurl_to_invoices', '20250627032501_change_invoice_id_to_uuid', '20250629191918_make_project_id_optional_in_purchase_orders',
  '20250707220513_make_po_fields_optionals', '20251022050652_change_unique_fields_on_invoice_and_purcharse_orders', '20251028014501_add_supplier_to_invoices',
  '20251028150136_remove_enabled_from_invoices_and_purchase_orders', '20251115025248_add_inventory_location', '20251130215714_add_custody_records',
  '20251202065151_add_user_preferences', '20251220204146_add_custody_drafts_and_tokens', '20251230190400_add_notification_system',
  '20251230200400_add_preferences_json', '20251230224247_add_createdby_relation_to_notification_rules', '20251230234038_add_rule_creator_to_notifications',
  '20251231005249_fix_inapp_link_to_text', '20260128003158_add_maintenance_and_audit_log', '20260128042228_rename_maintenance_to_event',
  '20260128075800_catchup_drift',
]
