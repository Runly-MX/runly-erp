# Command palette quick actions

Official modules contribute actions to the Ctrl+K palette ("Acciones rápidas") by adding
`apps/desktop/src/modules/<moduleKey>/quickActions.js`, whose default export is an array of
`{ id, title, subtitle, keywords, icon, color, run({ navigate }) }`. They are discovered by
`lib/quickActionRegistry.js` and shown only when the module is available to the user.

Actions that need a dialog call `openQuickAction(id, props)` (`lib/quickActionStore.js`); the
module's host component, mounted in `RunlyApp.jsx`, renders it (see `ChatQuickActionsHost.jsx`).

The home widget `calls` (`app/home/widgets/CallsWidget.jsx`) reuses runly.chat's actions.

Not supported yet: RME3 custom modules (`modules/custom`) cannot contribute quick actions.
