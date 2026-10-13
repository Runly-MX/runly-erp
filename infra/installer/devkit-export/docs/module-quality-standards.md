# Runly ERP — Module Quality Standards

This document defines the 17 UX and quality criteria that every Runly ERP module is evaluated against. It is the basis for module audits done before marking a module as production-ready.

**Applicability:**

| Module kind | Standard |
|---|---|
| Core (`core: true`) | Most criteria are **REQUIRED** — see column below |
| Feature / custom modules | Criteria are **RECOMMENDED** unless explicitly marked REQUIRED |

A criterion marked **CONDITIONAL** applies only when the module's design includes the relevant surface (e.g., a module with no list screen does not need to implement bulk actions).

---

## The 17 criteria

### 1. Layout

**Description:** Every screen must open inside `AppShell` and start with `PageHeader`. This ensures consistent navigation, breadcrumbs, and action slots across all modules.

**Implementation:** Import `PageHeader` from `@runly/ui`. Never render a bare `<div>` as a page root.

| Core | Custom |
|---|---|
| REQUIRED | REQUIRED |

**Pass:** Screen renders inside the shell with a `PageHeader` that includes a title and (where applicable) primary action buttons.

**Fail:** Bare `<div>` root, missing title, or content that bleeds outside the shell layout.

---

### 2. UI components

**Description:** All interactive elements must come from `@runly/ui`. Native HTML form elements (`<select>`, `<input>`, `<textarea>`, `<dialog>`) are forbidden when a `@runly/ui` equivalent exists.

**Implementation:** Check `packages/ui/src/index.js` before writing any input, combobox, or dialog. See the UI-first policy table in `CLAUDE.md`.

| Core | Custom |
|---|---|
| REQUIRED | REQUIRED |

**Pass:** No native `<select>`, `<input type="text">`, `<textarea>`, or `<input type="checkbox">` in module screens. All form fields use `TextField`, `SelectField`, `CreatableComboboxField`, `CheckboxField`, `DateField`, or equivalents.

**Fail:** Any native element where a `@runly/ui` component exists.

---

### 3. Dialogs

**Description:** Destructive actions (delete, purge, disable) must use `ConfirmDialog` from `@runly/ui`. Non-destructive modals use `Dialog` or `Sheet`. `window.confirm`, `window.alert`, and `window.prompt` are strictly forbidden.

**Implementation:** `ConfirmDialog` requires an `open` boolean state and an `onConfirm` handler. Never call `window.confirm(...)`.

| Core | Custom |
|---|---|
| REQUIRED | REQUIRED |

**Pass:** All destructive action confirmations use `ConfirmDialog`. No browser native dialogs present.

**Fail:** Any `window.confirm` / `window.alert` / `window.prompt` call in the module.

---

### 4. Table views / RunlyTable

**Description:** All list screens that display entity rows must use `RunlyTable` (or `RunlyCrudView` which wraps it). Hand-rolled `<table>` / `<ul>` grids for entity data are not allowed.

**Implementation:** `RunlyTable` receives `columns` (blueprint or manual), `data`, `isLoading`, `pagination`, and optional `toolbar` / `bulkActions` props.

| Core | Custom |
|---|---|
| REQUIRED (when list views exist) | RECOMMENDED |

**Pass:** Entity list is rendered by `RunlyTable` with proper columns, loading, and empty states.

**Fail:** Hand-rolled table or `<ul>` used for entity data listing.

---

### 5. Column visibility

**Description:** Non-essential columns in `RunlyTable` must have `defaultVisible: false` in the blueprint so the table starts clean. Users can toggle visibility via the column picker.

**Implementation:** In the TABLE blueprint (or view schema), set `defaultVisible: false` on auxiliary fields (IDs, timestamps, secondary codes). Always expose at least the primary identifier and one status column by default.

| Core | Custom |
|---|---|
| REQUIRED (when RunlyTable is used) | RECOMMENDED |

**Pass:** Blueprint or column definition marks secondary columns as hidden by default.

**Fail:** All columns visible by default, cluttering the initial view.

---

### 6. Bulk actions

**Description:** List screens that allow multiple selection must expose bulk actions: at minimum **Export** (Excel) and **Delete** (for deletable entities). Enable/disable bulk toggle applies when the entity has an `enabled` or `status` field.

**Implementation:** Pass a `bulkActions` array to `RunlyTable`. Each action receives the selected row array.

| Core | Custom |
|---|---|
| CONDITIONAL | RECOMMENDED |

**Applies when:** The entity list supports multi-selection and operations (delete, export, status change) are meaningful for the entity type.

**Pass:** Selecting rows reveals a bulk action bar with at least Export and Delete.

**Fail:** No bulk action bar, or bulk delete is done via individual row context menus only.

---

### 7. Forms

**Description:** Create and edit screens must use `RunlyForm` (blueprint-driven) or `DynamicForm` + React Hook Form. Hand-rolled `<form>` with uncontrolled inputs is not acceptable.

**Implementation:** Use `RunlyForm` when the form maps directly to a blueprint. Use React Hook Form + Zod resolver for complex multi-step or computed-field forms. Never use `useState` to track individual form field values.

| Core | Custom |
|---|---|
| REQUIRED (when create/edit flows exist) | RECOMMENDED |

**Pass:** Form validation runs on submit; field errors display inline; submit is disabled while request is in flight.

**Fail:** Uncontrolled inputs, no validation, or validation only on the backend with no UI feedback.

---

### 8. Excel export

**Description:** Any list screen with persistent entity data must offer an Excel download button. The export must include all visible + hidden columns (not just what is on screen).

**Implementation:** Use `ExcelJS` (already a workspace dependency). The export function reads the full dataset from the API, not just the current page. Download is triggered client-side via `URL.createObjectURL`.

| Core | Custom |
|---|---|
| REQUIRED (when list views exist) | RECOMMENDED |

**Pass:** Export button present in toolbar; clicking downloads a valid `.xlsx` file with headers and all rows.

**Fail:** No export, or export only downloads the current page.

---

### 9. PDF export

**Description:** Modules that produce documents (invoices, reports, dossiers, certifications) must offer a branded PDF download using `pdf-branding-service` from the API. General list screens do not need PDF export.

**Implementation:** `POST /pdf/generate` with template key and data payload. The service applies the company logo, colors, and footer from `runly.company` branding config.

| Core | Custom |
|---|---|
| CONDITIONAL | OPTIONAL |

**Applies when:** The module generates printable documents (not just data grids).

**Pass:** Clicking the PDF button downloads a branded, correctly formatted PDF.

**Fail:** Raw browser print dialog used, or PDF lacks company branding.

---

### 10. Responsiveness

**Description:** All screens must be usable on mobile viewports (375px+). No horizontal scroll on phones. Toolbars must collapse or stack gracefully.

**Implementation:** Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`). `RunlyTable` handles horizontal scroll internally on small viewports — do not wrap it in an additional overflow container.

| Core | Custom |
|---|---|
| REQUIRED | RECOMMENDED |

**Pass:** Screen renders without horizontal overflow at 375px width. Primary actions remain accessible.

**Fail:** Fixed-width containers that overflow the viewport, or action buttons that become inaccessible on mobile.

---

### 11. Loading states

**Description:** Every data-fetching surface must show a loading indicator while the request is in flight. Never render empty content without first determining whether data is loading or genuinely absent.

**Implementation:** `RunlyTable` shows a skeleton loader automatically when `isLoading={true}`. For non-table surfaces, use the `Skeleton` component or `Spinner` from `@runly/ui`.

| Core | Custom |
|---|---|
| REQUIRED | REQUIRED |

**Pass:** A skeleton or spinner is visible between navigation and data arrival. No blank white flash.

**Fail:** Screen renders empty content during loading, or an `EmptyState` shows before data has arrived.

---

### 12. Empty and error states

**Description:** When a list or detail is genuinely empty, show `EmptyState` from `@runly/ui`. When a request fails or the user lacks permission, show `ErrorState`. Plain text like "Sin registros" or "Error" is not acceptable.

**Implementation:**
- Empty list → `<EmptyState title="..." description="..." action={...} />`
- Permission denied → `<ErrorState code={403} />`
- Network/server error → `<ErrorState code={500} message={error.message} />`

| Core | Custom |
|---|---|
| REQUIRED | REQUIRED |

**Pass:** Empty lists show `EmptyState` with a relevant title, description, and (where applicable) a primary action. Errors show `ErrorState`.

**Fail:** Plain `<p>` or `<div>` text used for empty or error states.

---

### 13. Toast notifications

**Description:** Every mutation (create, update, delete, import, export) must produce a toast notification confirming success or describing the error. Silent mutations leave users uncertain.

**Implementation:** Use `toast.success(...)` and `toast.error(...)` from `sonner`:

```js
import { toast } from 'sonner'
```

Do not import `toast` from `@runly/ui`. Call the toast in the `onSuccess` / `onError` callbacks of the TanStack Query mutation.

| Core | Custom |
|---|---|
| REQUIRED | REQUIRED |

**Pass:** Creating, editing, or deleting a record shows a toast. Failed requests show an error toast with a human-readable message.

**Fail:** Mutation completes silently, or only a console log is produced.

---

### 14. Module push notifications

**Description:** Modules that generate meaningful system events (new record created by another user, status change that affects other users, approval required) must register those events via `activity-bridge` so they surface in the notification center.

**Implementation:** Call the `activity-bridge` event emitter from the API service when the relevant action completes. Map the event to a notification type in the module manifest `exposes` block.

| Core | Custom |
|---|---|
| CONDITIONAL | OPTIONAL |

**Applies when:** The module creates events that other users in the system need to be aware of in real time.

**N/A when:** The module is purely configuration-driven (e.g., company profile, branding settings) and generates no cross-user events.

**Pass:** Relevant events appear in the notification center for affected users.

**Fail:** Events exist in the audit log but no push notification is dispatched.

---

### 15. Liquid Glass design

**Description:** All module screens must use the Runly Liquid Glass design language — frosted glass cards, consistent border-radius, backdrop blur, and design tokens. This is automatically satisfied when using `@runly/ui` components.

**Implementation:** This criterion passes automatically when criteria 1 and 2 are met (`PageHeader` + `@runly/ui` components). Do not apply custom `backdrop-filter` or glass styles manually — use the `glass` Tailwind class from the design system or components that already apply it.

| Core | Custom |
|---|---|
| REQUIRED (automatic) | REQUIRED (automatic) |

**Pass:** Module screens are visually consistent with the rest of the app. Cards use the glass surface style.

**Fail:** Module has its own color palette, flat white cards, or non-standard border radii that break visual cohesion.

---

### 16. File uploads

**Description:** Any entity that can have attachments (contracts, documents, images) must allow uploading directly from the entity's own screen using `AttachmentsPanel` or `FileUploader`. Users must never be sent to the runly.files module to attach a document.

**Implementation:** Use `AttachmentsPanel` from `@runly/ui` inside the entity detail sheet or page. Pass the `entityType` and `entityId` props. The panel handles upload, list, rename, and delete internally.

| Core | Custom |
|---|---|
| CONDITIONAL | CONDITIONAL |

**Applies when:** The entity has a concept of attached documents or media.

**Pass:** Files can be uploaded, viewed, and deleted from within the entity detail without navigating away.

**Fail:** The UI links to runly.files for document attachment, or there is no inline upload capability despite the entity needing it.

---

### 17. ActivityTimeline

**Description:** Entity detail screens for modules that emit audit/activity events must display an `ActivityTimeline` component showing the chronological history of changes and actions on that entity.

**Implementation:** Use `ActivityTimeline` from `@runly/ui`. Feed it from `GET /activity?entityType=<type>&entityId=<id>` (routed through `activity-bridge`). Register the module's entity types with `activity-bridge` so events are captured automatically.

| Core | Custom |
|---|---|
| CONDITIONAL | OPTIONAL |

**Applies when:** `activity-bridge` already registers events for the module's entity type, or the module explicitly emits audit events.

**Pass:** Entity detail shows a timeline of past events (created, updated, status changed, file uploaded, etc.).

**Fail:** No activity history visible despite the entity having a rich lifecycle, or the timeline is present but always empty because events were not registered.

---

## Module audit checklist

Use this table to track compliance for each module. Mark `PASS`, `FAIL`, `N/A`, or `PARTIAL`.

| # | Criterion | Core default | Custom default |
|---|---|---|---|
| 1 | Layout | REQUIRED | REQUIRED |
| 2 | UI components | REQUIRED | REQUIRED |
| 3 | Dialogs | REQUIRED | REQUIRED |
| 4 | Table views / RunlyTable | REQUIRED (if list) | RECOMMENDED |
| 5 | Column visibility | REQUIRED (if RunlyTable) | RECOMMENDED |
| 6 | Bulk actions | CONDITIONAL | RECOMMENDED |
| 7 | Forms | REQUIRED (if create/edit) | RECOMMENDED |
| 8 | Excel export | REQUIRED (if list) | RECOMMENDED |
| 9 | PDF export | CONDITIONAL | OPTIONAL |
| 10 | Responsiveness | REQUIRED | RECOMMENDED |
| 11 | Loading states | REQUIRED | REQUIRED |
| 12 | Empty/Error states | REQUIRED | REQUIRED |
| 13 | Toast notifications | REQUIRED | REQUIRED |
| 14 | Module push notifications | CONDITIONAL | OPTIONAL |
| 15 | Liquid Glass design | REQUIRED (automatic) | REQUIRED (automatic) |
| 16 | File uploads | CONDITIONAL | CONDITIONAL |
| 17 | ActivityTimeline | CONDITIONAL | OPTIONAL |

---

## Running a module audit

For each module under review:

1. Open the module screen in a browser.
2. Go through each applicable criterion in order.
3. Record the result as `PASS`, `FAIL`, `PARTIAL`, or `N/A` with a one-line action note for non-PASS items.
4. Fix all REQUIRED failures before marking the module production-ready.
5. RECOMMENDED failures for custom modules should be filed as backlog items.

Example audit output format:

```
Diagnostico runly.contacts — 2026-06-07

#   Criterio                  Estado    Accion
1   Layout                    PASS      —
2   UI components             PASS      —
3   Dialogs                   PASS      —
4   Vistas tabla / RunlyTable PASS      —
5   Column visibility         PASS      Blueprint tiene defaultVisible: false
6   Bulk actions              PASS      Export, enable/disable, delete
7   Formularios               PASS      DynamicForm + blueprint
8   Excel export              PASS      —
9   PDF export                FAIL      Implementar pdf-branding-service
10  Responsividad             PASS      —
11  Loading states            PASS      RunlyTable lo maneja
12  Empty/Error states        PARTIAL   Permiso denegado usa texto plano -> ErrorState
13  Toast notifications       PASS      —
14  Notificaciones modulo     N/A       Contacts no genera eventos push
15  Liquid Glass              PASS      RunlyTable/PageHeader lo aplican
16  File uploads              N/A       —
17  ActivityTimeline          FAIL      activity-bridge ya registra contacts — agregar componente
```
