import { useQuickNoteStore } from "./quick/quickNoteStore";

export default [
  {
    id: "quick-note",
    title: "Nota rápida",
    subtitle: "Abre el bloc flotante de notas (Ctrl+Alt+N)",
    keywords: ["nota", "notas", "apunte", "rapida", "bloc"],
    icon: "NotebookPen",
    run: () => useQuickNoteStore.getState().open(),
  },
];
