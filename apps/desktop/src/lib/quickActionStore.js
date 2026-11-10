import { create } from "zustand";

// A quick action that needs UI (a dialog) asks for it here; the module's host
// component, mounted once in the app shell, renders it. `id` names the dialog.
export const useQuickActionStore = create((set) => ({
  request: null,
  open: (id, props = {}) => set({ request: { id, props } }),
  close: () => set({ request: null }),
}));

export const openQuickAction = (id, props) => useQuickActionStore.getState().open(id, props);
