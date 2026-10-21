# Inventory change proposals (duplicates the user cannot open)

Status: approved by the product owner in chat on 2026-10-21 (autonomous decisions allowed).

## Problem

Serial and asset numbers are unique among active items of a company, even across areas. A supplier (guest) or a
user who tries to register an item that already exists in a folder they cannot open is rejected, sees only
"ya existe" and is stuck: they cannot open it, add what they know, or ask for access.

## Behaviour

When a duplicate is `restricted` (it exists outside the caller's areas) the form offers two actions next to the
warning. Nothing about the existing item is revealed to the proposer.

1. **Enviar mis datos a revision** (`kind = change`): the values typed in the form that can describe an item
   (name, model, type, brand, location, condition, part number, warranty, notes) are stored as a proposal
   against the existing item. The proposer chooses which fields to send and may add a message.
2. **Solicitar acceso** (`kind = access_request`): a proposal without values, with a message, so the folder
   managers know someone needs that item.

Reviewers (users who can update the item in its area, or admins) see the pending proposals in a sheet opened from
the inventory header (with a count). Each proposal lists, per field, the current value next to the proposed one;
the reviewer accepts or rejects each field. Accepted fields are applied to the item through the normal update path
(same validation, audit and area rules); the proposal ends as `accepted`, `partial` or `rejected`. An access
request is closed with `dismissed` once handled (access itself is granted in Areas > Miembros).

## Rules

- A proposal is matched to the item by the duplicated identifier on the server; the client never sends an item id.
- Only an allowlist of fields can be proposed; identifiers, status, area and anything commercial are excluded.
- One pending proposal per (item, proposer, kind): sending again replaces the previous one.
- Submitting answers only `{ id, status }`.
- Reviewing requires write access to the item's area (`canWriteArea`), enforced on the server.
- Guests submit through `/inventory/guest/change-proposals`; users through `/inventory/change-proposals`.

## Data

`inv_change_proposal` (company scoped): item, kind, matched field/value, `changes` JSON
(`{ field: { value, label? } }`), `decisions` JSON, status, proposer (user or guest) with a display label,
message, reviewer, review note, timestamps. No foreign keys: proposals outlive soft-deleted items and guests.

## Out of scope

Notifications to the folder managers (the header count is the signal for now), proposing changes to items the
proposer can already open (they edit directly), and merging two items.
