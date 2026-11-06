# Studio bulk create, phase 4: HR, contacts, photo per row, label sheets

Last phase of the "etiquetas desde Studio" roadmap. Implemented directly
(plan = the four items below, each with its unit test).

1. **Providers**: Recursos humanos (`hr.employee.read`, via `hr.listEmployees`
   with the caller's auth user; work data only: name, employee number, job title,
   department, work email, phone, location, manager, hire date; never personal
   email, emergency contacts or payroll) and Contactos (`contacts.contacts.read`;
   name, legal name, email, phone and the default address split into fields plus
   "Dirección completa").
2. **Photo per row**: every provider adds a `Foto` column with the record's image
   file id (inventory cover, vehicle cover, employee photo, contact avatar) and an
   `images` map of signed URLs, signed only for enabled image files of the active
   company. An image object may carry `imageField` (column name); bulk exports
   swap its `fileAssetId` for the row photo and resolve it through that map
   (`exportVariant(..., { images })`). Rows without a photo keep the placeholder.
3. **Label sheets**: bulk PDF option "Varias etiquetas por hoja carta": letter
   sheet, 10 mm margins, 3 mm gaps, columns x rows that fit; all selected pages
   must share one size; up to 200 sheets.
4. **Remembered source**: the last module and filters used with a design are kept
   in this browser (`localStorage`, never the data) and preselected next time.

Verified: unit tests, lint, web build, read-only provider runs against the E2E
company (HR 33 employees, contacts 138).
