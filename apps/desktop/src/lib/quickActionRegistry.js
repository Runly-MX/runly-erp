// Modules contribute quick actions to the command palette (Ctrl+K) by adding
// `modules/<moduleKey>/quickActions.js` whose default export is an array of
// { id, title, subtitle, keywords, icon, color, run({ navigate }) }.
// They only show while the module is available to the user.
const files = import.meta.glob("../modules/*/quickActions.js", { eager: true });

export const QUICK_ACTIONS = Object.entries(files).flatMap(([path, mod]) => {
  const moduleKey = path.split("/").at(-2);
  return (mod.default ?? []).map((action) => ({ ...action, moduleKey }));
});
