# Template contact form (design)

## Problem
Built-in website templates could not include a working contact form: `ContactFormBlock` needs the id of a form that
already exists, which a template cannot know. Templates therefore pointed to a Contact page without a form.

## Decision
A template page may contain a `ContactFormBlock` whose `formId` is the placeholder `@contact`. When the template is
applied (`POST /website/sites/:siteId/templates/:templateId/apply`):

1. If any selected page uses the placeholder, the apply step reuses the site's enabled form named "Contacto", or
   creates it inside the apply transaction (fields: name, email, message; creates a lead; honeypot on; no Turnstile).
   The form is provisioned with the same website scope as forms created from the Forms screen.
2. The placeholder in every selected page is replaced with the form id.
3. If the actor lacks `website.forms.create`, the placeholder blocks are removed instead, so the apply still works and
   no unpublishable form is left in a page.

Creating the form in the same transaction keeps apply idempotent: a replayed or failed apply never leaves an orphan.

## Scope
- In: `apps/api/src/services/website-template-forms.js`, wiring in `website-template-service.js`, the Contacto page of
  Maya Studio, Aurora Viajes and Finora.
- Out: choosing a different form per template, notification email, Turnstile, editing the default fields (done from the
  Forms screen after applying).

## Verification
- Unit tests for placeholder detection, binding and removal (`website-template-forms.test.js`).
- Template documents still pass the publish rules (`website-template-conform.test.js`).
- Not yet run against a database: apply a template with the contact page on a disposable instance and publish.
