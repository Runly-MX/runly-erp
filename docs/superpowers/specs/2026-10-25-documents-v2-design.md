# Documents v2: the template engine for every module (design)

Plan: `docs/superpowers/plans/2026-10-25-documents-v2-template-engine.md`.

## Goal

`runly.documents` is the single engine other modules call to manage and fill templates. Users upload their own Word, Excel, PowerPoint or PDF as the template; the engine detects fields, lets the user map them, and fills them from a record. Output is the template format or PDF.

## Architecture

1. Engine (`apps/api/src/services/document-templates/*`): docx / xlsx / pptx fill, suggested tags with labels, PDF field detection and fill, PDF conversion.
2. Hub (`runly.documents`): template storage (files, versions, detected fields, mapping, personal or company visibility), generation history (`GeneratedDocument`) and the management UI. One list of all templates with module / state / visibility filters; "Nueva plantilla" picks module, then document type, then file or blank. Module screens embed the same `TemplateManager` with a fixed kind.
3. Kinds: each module registers a kind (key, label, field schema, permission, formats, data loader). Built-in kinds: `general.manual`, `growth.lead`, `hr.employee`, `contacts.contact`, `purchases.order`, `fleet.vehicle`, `inventory.custody`, `lms.certificate`.

Modules call `hub.engine.generate({ kind, templateId?, data | sourceId, output })` without HTTP.

## Platform hooks (phase 5)

- Module Services `runly.documents:documents.generate` and `runly.documents:templates.list` (Automation Studio and Builder modules). Output is a file id usable as the attachment of `email.send`. Company templates only for automations (no user); a user also reaches their personal templates. The kind must belong to a module active for the company; users need the kind permission, system calls rely on the admin grant. The contract adds an arg type `json` (object or JSON text, max 20 KB).
- Builder modules declare kinds in their manifest (`documentKinds`, mirrored by `ModuleDefinition.documentKinds`). The API registers `<moduleKey>.<name>` while the module is installed and enabled (coalesced sync from the Route Loader on boot, install, enable, disable, uninstall and sync) and unregisters it afterwards. The loader reads only the declared fields from the module table, scoped by `company_id` and skipping soft-deleted rows.
- MirAI and MCP share one capability (`routes/documents/mirai-capabilities.js`): tools `documents_kinds` and `documents_templates`, and the action `documents.document.generate` (prepare / approve / commit). The MCP `documents` domain gains `documents:write`.

## Out of scope

- Image and list fields in Builder kinds (text, number and date only).
- Per-company enabling of Builder kinds beyond the module switch.
