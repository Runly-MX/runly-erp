# runly.files: upload and subfolders inside system folders

Status: draft for approval. Nothing here is implemented yet.

## Problem

In the Files explorer the tree has two kinds of folders:

- **User folders** ("Mis carpetas"): real rows in `file_folder`. Users create, rename, move, share and delete them; files and subfolders can be dropped into them.
- **System folders** ("Del sistema"): not rows. They are computed per module and per record (Proyectos > a project, Personal > an employee, Inventario > an item...) from `file_asset.moduleKey`, `entityType` and `metadata.sourceEntityId` (`apps/api/src/services/files/record-folders.js`). They are read-only today.

Requested: inside a system folder the user must be able to **upload files** and **create subfolders**. System folders themselves must stay unmovable and not renamable or deletable.

## What the code does today (facts)

- `POST /files/upload` already accepts `moduleKey`, `entityType` and `entityId` (stored as `metadata.sourceEntityId`). It does **not** check that the caller may attach to that record: it only requires `files.assets.create`. Exposing record uploads in the UI on top of that would let any user with that permission attach files to any record id.
- Files of a project are stored against its **tasks** (`entityType: "Task"`, `sourceEntityId = taskId`); the project folder is the union of its tasks' files (`recordFilesWhere`). There is no "attached directly to the project" case.
- `FileFolder.parentId` references another `FileFolder`, so a user subfolder cannot hang from a record folder.
- Record folders have no id of their own; the UI addresses them as `"<EntityType>:<uuid>"`.

## Design

### 1. Record attachers (server registry)

`apps/api/src/services/files/record-attachers.js` exports a map `EntityType -> { moduleKey, label, canView(context, id), canAttach(context, id) }`, reusing the visibility rules each module already applies (for example `visibleProjectsWhere` for projects). Entries start with the entity types already in `LABELS` (Project, HrEmployee, FleetDriver, FleetVehicle, Contact, InvItem, CanvasBoard, GrowthLead). `canAttach` also requires the module's own attach permission, not just `files.assets.create`.

`POST /files/upload` gains an optional `recordRef` (`"Type:uuid"`). When present the server resolves it through the registry, rejects with 403/404 if `canAttach` fails, and derives `moduleKey`, `entityType` and `sourceEntityId` itself (the client-supplied values are ignored for this path). Projects get a new direct-attachment case: `entityType: "Project"`, and `recordFilesWhere` returns the union of Project and Task attachments.

### 2. Subfolders anchored to a record

Forward migration on `file_folder` (nullable columns, existing rows untouched):

- `anchor_type text`, `anchor_id uuid`.

A folder with an anchor and `parent_id = null` is a root subfolder of that record's system folder; its descendants inherit the anchor (enforced on create and on move: a move may not cross anchors). Visibility of an anchored folder = `canView(record)` combined with the folder's existing `scope` and member rules, so a private subfolder is still private. Management (rename, move inside the same anchor, share, delete) follows the existing rule: creator or company admin.

`GET /files/folders` returns the anchored folders with their anchor; the tree/explorer shows them as children of the record folder. `GET /files?folderId=` for an anchored folder lists its files; files uploaded into it carry both `folderId` and the record attachment (section 1), so they also appear in the record's own flat list.

### 3. UI

- System folder views get the same create bar, "Subir" and "Nueva carpeta" as user folders; the destination label reads "Del sistema / Proyectos / <registro>". Upload sends `recordRef` (plus `folderId` when inside an anchored subfolder).
- System folders and module folders stay non-draggable and without rename/delete in their menus; "Nueva carpeta" and "Subir aquí" appear.
- Drop targets: dropping files on a record folder attaches them there (a move of an own file into the record), subject to `canAttach`.

### 4. Out of scope

Moving or renaming system folders; creating subfolders at module level (above the record); changing how modules attach their own files.

## Phases

1. `record-attachers` + `recordRef` upload + tests for: allowed attach, forbidden attach (403), unknown record (404), project direct attachment in the folder listing.
2. UI: enable upload/create-doc in record folders (no subfolders yet), destination label.
3. Migration + anchored subfolders (API, validators, tree), rules for visibility and cross-anchor moves, tests.
4. UI for subfolders, drag and drop into record folders, E2E.

## Risks

- Each module has its own notion of "who can attach"; the registry must reuse existing checks rather than re-implement them, entry by entry. Entries without a clear rule stay disabled in the UI instead of guessing.
- Projects change from task-only to task-or-project attachments; listing and counts (`recordGroups`) must handle both.
- The migration adds columns only; no data backfill.

## Verification

Server tests per phase as above, plus the local Playwright suite in `.e2e/` (upload into a record folder, create an anchored subfolder, forbidden attach for a user without the module permission).
