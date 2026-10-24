# Notes Pen/IME Stability Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Text written with S Pen handwriting-to-text (and any IME composition) in a note is never rewritten or erased by autosave, Y.js sync or editor re-renders.

**Architecture:** A pure update gate holds inbound remote Y.js updates while a composition is active and applies them merged afterwards; a TipTap extension drives the gate from `compositionstart/end`; editor extensions stop depending on volatile values (token, profile); touch/pen pointer handling separates pen drawing from palm/finger scroll. A dev-only debug log confirms behavior on the tablet.

**Tech Stack:** TipTap 3.30.5 (`@tiptap/core`, `@tiptap/pm/state`), Yjs, node:test, React.

Spec: `docs/superpowers/specs/2026-10-24-notes-quick-notes-redesign-design.md` section 5.1.

Conventions: JavaScript only, Spanish UI text, English code/comments, no emojis, files under 1000 lines, tests with `node --test`, commit each task right away, stage only the files you touched (other sessions may have uncommitted work), branch `main`. Never start/stop dev servers. Do not print secrets.

Base dir for relative paths: `apps/desktop/src/modules/runly.notes/`.

---

### Task 1: Remote update gate (pure) + provider integration

**Files:**
- Create: `lib/updateGate.js`
- Create: `lib/__tests__/update-gate.test.js`
- Modify: `lib/SupabaseYjsProvider.js` (broadcast handler at the `ydoc.update` listener, `destroy()`)

- [ ] **Step 1: Write the failing test** `lib/__tests__/update-gate.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { createUpdateGate } from '../updateGate.js'

function makeUpdate(text) {
  const doc = new Y.Doc()
  doc.getText('t').insert(0, text)
  return Y.encodeStateAsUpdate(doc)
}

test('applies immediately when not composing', () => {
  const applied = []
  const gate = createUpdateGate((u) => applied.push(u))
  gate.push(makeUpdate('a'))
  assert.equal(applied.length, 1)
})

test('holds updates while composing and applies one merged update on end', () => {
  const applied = []
  const gate = createUpdateGate((u) => applied.push(u))
  gate.setComposing(true)
  gate.push(makeUpdate('a'))
  gate.push(makeUpdate('b'))
  assert.equal(applied.length, 0)
  gate.setComposing(false)
  assert.equal(applied.length, 1)
  const doc = new Y.Doc()
  Y.applyUpdate(doc, applied[0])
  assert.equal(doc.getText('t').length > 0, true)
})

test('safety timeout releases held updates if compositionend never arrives', async () => {
  const applied = []
  const gate = createUpdateGate((u) => applied.push(u), { maxHoldMs: 20 })
  gate.setComposing(true)
  gate.push(makeUpdate('a'))
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(applied.length, 1)
  assert.equal(gate.composing, false)
})

test('destroy drops held updates and clears the timer', () => {
  const applied = []
  const gate = createUpdateGate((u) => applied.push(u), { maxHoldMs: 20 })
  gate.setComposing(true)
  gate.push(makeUpdate('a'))
  gate.destroy()
  assert.equal(applied.length, 0)
})
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test apps/desktop/src/modules/runly.notes/lib/__tests__/update-gate.test.js`
Expected: FAIL, cannot find module `../updateGate.js`.

- [ ] **Step 3: Implement** `lib/updateGate.js`

```js
import * as Y from 'yjs'

// Holds inbound remote Y.js updates while an IME / handwriting composition is
// active. y-prosemirror re-renders the touched range when a remote update is
// applied, which replaces the composing text node and makes Samsung
// handwriting-to-text (and Android IMEs) lose or rewrite what was just
// written. Updates are CRDT-commutative, so delaying them is safe.
export function createUpdateGate(apply, { maxHoldMs = 8000 } = {}) {
  let composing = false
  let queue = []
  let timer = null

  function flush() {
    clearTimeout(timer)
    timer = null
    if (queue.length === 0) return
    const merged = queue.length === 1 ? queue[0] : Y.mergeUpdates(queue)
    queue = []
    apply(merged)
  }

  return {
    get composing() { return composing },
    push(update) {
      if (composing) queue.push(update)
      else apply(update)
    },
    setComposing(flag) {
      const next = Boolean(flag)
      if (next === composing) return
      composing = next
      if (composing) {
        clearTimeout(timer)
        timer = setTimeout(() => {
          composing = false
          flush()
        }, maxHoldMs)
      } else {
        flush()
      }
    },
    destroy() {
      clearTimeout(timer)
      timer = null
      queue = []
      composing = false
    },
  }
}
```

- [ ] **Step 4: Run test, expect pass** (same command). Expected: 4 pass.

- [ ] **Step 5: Wire into the provider.** In `lib/SupabaseYjsProvider.js`:
  - `import { createUpdateGate } from './updateGate.js'`
  - In the constructor, before `this._init(...)`: `this._remoteGate = createUpdateGate((bytes) => Y.applyUpdate(this.ydoc, bytes, 'broadcast'))`
  - In the `ydoc.update` broadcast listener replace `Y.applyUpdate(this.ydoc, base64ToBytes(payload.update), 'broadcast')` with `this._remoteGate.push(base64ToBytes(payload.update))` (keep the try/catch and debug line).
  - Add method `setComposing(flag) { this._remoteGate.setComposing(flag) }`.
  - In `destroy()` add `this._remoteGate.destroy()` as the first statement after `this._destroyed = true`.
  - Do NOT gate the `server-load` apply in `_init` (it runs before the editor exists).

- [ ] **Step 6: Run the notes tests**

Run: `node --test apps/desktop/src/modules/runly.notes/lib/__tests__/`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/modules/runly.notes/lib/updateGate.js apps/desktop/src/modules/runly.notes/lib/__tests__/update-gate.test.js apps/desktop/src/modules/runly.notes/lib/SupabaseYjsProvider.js
git commit -m "feat(notes): hold remote Y.js updates while an IME composition is active"
```

---

### Task 2: CompositionGuard extension, editor attributes and debug log

**Files:**
- Create: `lib/extensions/CompositionGuard.js`
- Create: `lib/notesDebug.js`
- Modify: `lib/editor-extensions.js` (`buildExtensions`: add the extension when `collab`; add `autocorrect` option)
- Modify: `components/NoteEditor.jsx` (`editorProps.attributes`, around line 520)

- [ ] **Step 1: `lib/notesDebug.js`**

```js
// Dev aid for the S Pen / IME investigation. Enabled with ?notesDebug=1 or
// localStorage runly:notes:debug=1. No-op otherwise.
function enabled() {
  try {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('notesDebug') === '1'
      || window.localStorage.getItem('runly:notes:debug') === '1'
  } catch {
    return false
  }
}

export function notesDebug(event, detail) {
  if (!enabled()) return
  console.debug(`[notes/debug ${Math.round(performance.now())}ms] ${event}`, detail ?? '')
}
```

- [ ] **Step 2: `lib/extensions/CompositionGuard.js`**

```js
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { notesDebug } from '../notesDebug.js'

// ProseMirror finishes its own compositionend handling ~20 ms later; releasing
// held remote updates in the same tick would race it.
const RELEASE_DELAY_MS = 60

export const CompositionGuard = Extension.create({
  name: 'compositionGuard',

  addOptions() {
    return { provider: null }
  },

  addProseMirrorPlugins() {
    const { provider } = this.options
    let releaseTimer = null

    const begin = () => {
      clearTimeout(releaseTimer)
      notesDebug('compositionstart')
      provider?.setComposing(true)
    }
    const end = () => {
      clearTimeout(releaseTimer)
      releaseTimer = setTimeout(() => {
        notesDebug('compositionend (release held updates)')
        provider?.setComposing(false)
      }, RELEASE_DELAY_MS)
    }

    return [
      new Plugin({
        key: new PluginKey('compositionGuard'),
        props: {
          handleDOMEvents: {
            compositionstart: () => { begin(); return false },
            compositionend: () => { end(); return false },
            blur: () => { end(); return false },
          },
        },
        view: () => ({
          destroy: () => {
            clearTimeout(releaseTimer)
            provider?.setComposing(false)
          },
        }),
      }),
    ]
  },
})
```

- [ ] **Step 3: Register it.** In `lib/editor-extensions.js` import it and, inside `if (collab) { base.push(...) }`, add `CompositionGuard.configure({ provider })` as the first pushed item.

- [ ] **Step 4: Editor attributes.** Read `components/NoteEditor.jsx` from line 515 to the end. In the `editorProps` of `EditorProvider`, ensure `attributes` includes `spellcheck: 'false'`, `autocorrect: 'off'`, `autocapitalize: 'sentences'`, merged with any existing attributes/class (do not drop the existing ones). Spellcheck/autocorrect off is the default for the first version; a per-note toggle is out of scope for this phase.

- [ ] **Step 5: Debug hooks in `NoteEditor.jsx`.** Import `notesDebug`. Log (using `notesDebug`) in: `handleUpdate` (`'local update'` with `transaction.docChanged`), the `extensions` memo body (`'extensions rebuilt'`), and in `seedIfNeeded` (`'seed'`). Keep it one line each; they are no-ops when the flag is off.

- [ ] **Step 6: Verify** `pnpm lint` (no new errors in touched files) and `node --test apps/desktop/src/modules/runly.notes/lib/__tests__/`.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/modules/runly.notes/lib/extensions/CompositionGuard.js apps/desktop/src/modules/runly.notes/lib/notesDebug.js apps/desktop/src/modules/runly.notes/lib/editor-extensions.js apps/desktop/src/modules/runly.notes/components/NoteEditor.jsx
git commit -m "feat(notes): composition guard extension, pen-friendly editor attributes, debug log"
```

---

### Task 3: Stable extensions and stop re-feeding the editor while writing

**Files:**
- Modify: `components/NoteEditor.jsx` (`extensions` memo deps, token/profile handling)
- Modify: `lib/editor-extensions.js` and `lib/extensions/SlashCommand.jsx` / `lib/slashCommandItems.js` (token as getter)
- Modify: `NotesScreen.jsx` (the `liveNoteData` effect, around line 135)
- Test: `lib/__tests__/stable-editor-deps.test.js` (pure helper test)

- [ ] **Step 1: Token as a getter.** `SlashCommand.configure({ noteId, token })` and `buildSlashItems({ noteId, token })` capture the token at build time. Change them to accept `getToken` (a function) alongside the existing `token` option (keep `token` as fallback so other callers keep working): `const token = getToken ? getToken() : token` evaluated when an item runs (inside `run`), not when built. In `NoteEditorSurface`, hold `tokenRef` (`useRef(token)`, updated in an effect or during render commit via the existing `useCommitRefValue` hook) and pass `getToken: () => tokenRef.current` to `buildExtensions`. Remove `token` from the `extensions` memo deps.

- [ ] **Step 2: User identity via awareness.** Remove `userProfile?.avatarUrl`, `userProfile?.displayName`, `session?.user?.email` from the memo deps. Keep the initial `user` object passed to `CollaborationCaret` as today, but add an effect in `NoteEditorSurface`:

```js
useEffect(() => {
  if (!provider || readOnly) return
  provider.setAwarenessField('user', {
    id: session?.user?.id ?? null,
    name: userProfile?.displayName ?? session?.user?.user_metadata?.full_name ?? session?.user?.email ?? 'Usuario',
    color: colorForUser(session?.user?.id ?? session?.user?.email),
    avatarUrl: userProfile?.avatarUrl ?? session?.user?.user_metadata?.avatar_url ?? null,
  })
}, [provider, readOnly, session?.user?.id, session?.user?.email, session?.user?.user_metadata, userProfile?.displayName, userProfile?.avatarUrl])
```

  The memo then depends only on `ydoc, provider, readOnly, note.id, session?.user?.id`.

- [ ] **Step 3: Stop swapping the editor note.** In `NotesScreen.jsx` the effect that copies `liveNoteData.note` into `selectedNote` re-renders `NoteEditor` (new `note` object) after every mutation, including autosave refetches. Introduce a pure helper `lib/stableNoteIdentity.js`:

```js
// Returns the previous note object when only server-driven noise changed
// (updated_at, content, word counts). The editor owns content and title while
// it is open, so those fields must not re-feed it.
const EDITOR_RELEVANT = ['id', 'title', 'icon', 'cover_url', 'background_color', 'paper_style', 'paper_margin', 'is_public', 'public_slug', 'owner_user_id', 'note_type', 'folder_id', 'is_pinned']

export function nextSelectedNote(prev, incoming) {
  if (!prev || prev.id !== incoming.id) return incoming
  const same = EDITOR_RELEVANT.every((k) => prev[k] === incoming[k])
  return same ? prev : incoming
}
```

  Note: `title` is in the relevant list because the header shows it; the editor derives the title from the document, so `NoteEditor` must not depend on `note.title` for rendering the body (verify; if it does, keep the identity check but exclude `title`). Use it in the effect: `setSelectedNote((prev) => nextSelectedNote(prev, liveNoteData.note))`.

- [ ] **Step 4: Test** `lib/__tests__/stable-editor-deps.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextSelectedNote } from '../stableNoteIdentity.js'

const base = { id: 'n1', title: 'A', icon: '', cover_url: null, updated_at: '1', content: '<p>a</p>' }

test('keeps previous object when only updated_at/content change', () => {
  const next = nextSelectedNote(base, { ...base, updated_at: '2', content: '<p>ab</p>' })
  assert.equal(next, base)
})

test('takes incoming when a relevant field changes', () => {
  const incoming = { ...base, cover_url: 'x' }
  assert.equal(nextSelectedNote(base, incoming), incoming)
})

test('takes incoming when the note id changes', () => {
  const incoming = { ...base, id: 'n2' }
  assert.equal(nextSelectedNote(base, incoming), incoming)
})
```

  Run it first (expect fail on missing module), then create the helper, then expect 3 pass.

- [ ] **Step 5: Verify**: `node --test apps/desktop/src/modules/runly.notes/lib/__tests__/`, `pnpm lint`, `pnpm --filter @runly/desktop build:web`. If `NoteEditor` reads `note.content` after mount only for the one-time seed, confirm that the seed path still works (it reads `note.content` once in `onCreate`).

- [ ] **Step 6: Commit** the touched files with message `fix(notes): keep editor identity stable while writing (token getter, awareness user, stable selected note)`.

---

### Task 4: Pen vs touch (palm rejection) on drawing surfaces

**Files:**
- Modify: `components/DrawingCanvas.jsx`, `hooks/useImageAnnotationDrawing.jsx`
- Create: `lib/pointerInput.js`, `lib/__tests__/pointer-input.test.js`

- [ ] **Step 1: Test first** `lib/__tests__/pointer-input.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldDraw } from '../pointerInput.js'

test('pen and mouse draw, touch does not when a pen has been seen', () => {
  assert.equal(shouldDraw({ pointerType: 'pen' }, { penSeen: false }), true)
  assert.equal(shouldDraw({ pointerType: 'mouse' }, { penSeen: false }), true)
  assert.equal(shouldDraw({ pointerType: 'touch' }, { penSeen: false }), true)
  assert.equal(shouldDraw({ pointerType: 'touch' }, { penSeen: true }), false)
})

test('touch drawing disabled explicitly', () => {
  assert.equal(shouldDraw({ pointerType: 'touch' }, { penSeen: false, touchDraws: false }), false)
})
```

- [ ] **Step 2: Implement** `lib/pointerInput.js`

```js
// Once a stylus has touched a drawing surface, finger/palm contacts stop
// drawing (palm rejection). Before that, touch still draws so phones keep
// working. `touchDraws: false` forces pan/scroll for touch.
export function shouldDraw(event, { penSeen = false, touchDraws = true } = {}) {
  if (event.pointerType === 'touch') return touchDraws && !penSeen
  return true
}
```

- [ ] **Step 3: Apply.** Read both drawing files. On `pointerdown`: if `event.pointerType === 'pen'` set a ref `penSeenRef.current = true`; if `!shouldDraw(event, { penSeen: penSeenRef.current })` return without starting a stroke and without `preventDefault` so the browser can scroll/pan. Ensure the drawing surface has `touch-action: none` only while the pen is the active pointer, otherwise `pan-x pan-y pinch-zoom` (set via inline style computed from `penSeenRef`/state). Do not change the stroke data format.

- [ ] **Step 4: Verify** `node --test apps/desktop/src/modules/runly.notes/lib/__tests__/`, `pnpm lint`, `pnpm --filter @runly/desktop build:web`.

- [ ] **Step 5: Commit** `feat(notes): palm rejection on drawing surfaces once a pen is detected`.

---

### Task 5: Docs, verification evidence, manual acceptance checklist

**Files:**
- Modify: `docs/TASKS.md` (new entry under the notes section)
- Create: `docs/superpowers/plans/2026-10-24-notes-pen-stability-results.md`

- [ ] **Step 1:** Run `node --test apps/desktop/src/modules/runly.notes/lib/__tests__/`, `node --test apps/api/src/routes/notes/__tests__/`, `pnpm lint`, `pnpm --filter @runly/desktop build:web`; record exact pass counts in the results file.
- [ ] **Step 2:** In the results file add the manual acceptance checklist for the Galaxy Tab (S Pen handwriting-to-text, three paragraphs, collab with a second session editing the same note, autosave running, `?notesDebug=1` log shows `compositionstart`, held updates released after `compositionend`, no `extensions rebuilt` during writing). Mark manual items unchecked; do NOT mark `[x]` without evidence.
- [ ] **Step 3:** Add to `docs/TASKS.md` an unchecked entry referencing spec and results, with automated verification noted as `Verified: <date> (automated only ...)` only for what was actually run.
- [ ] **Step 4: Commit** `docs(notes): pen stability results and acceptance checklist`.
