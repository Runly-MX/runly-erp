# RME3 Troubleshooting

## Common Failures

- Missing `components/index.js`: the dynamic bundle cannot register your React components.
- Bad registry key: `schema.component` must match `<moduleKey>:<ComponentName>` exactly.
- Missing bundle build: run module install or sync and verify `GET /modules/<key>/bundle.js` returns 200.
- Wrong file extension: module UI files must be `.jsx`, not `.tsx`.
- Unsupported import: stay within the documented externals and allowed bundled dependencies.
- Stale bundle cache: force a rebuild with `POST /modules/<key>/sync` and reload the page.
- Import mistake: never import `toast` from `@runly/ui`; use `import { toast } from 'sonner'`.

## Explicit Imports

- Use `import { toast } from 'sonner'` for toast notifications.
- Never use `import { toast } from '@runly/ui'` — that export does not exist in installer mode.
- Use `@runly/ui` for UI primitives such as `Accordion`, `AccordionContent`, `AccordionItem`, `AccordionTrigger`, `ActionMenu`, `ActiveFilterChips`, `ActivityBellTrigger`, `ActivityDrawer`.

