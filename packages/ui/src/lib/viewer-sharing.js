import { createContext } from "react";

// App-level link sharing for AdvancedFileViewer. Provide
// { shareLink(file) } high in the tree to open the app's "Compartir enlace"
// dialog (private Runly link or public links) from the viewer's copy-link
// action; without it the viewer falls back to copying the stable Runly link.
export const ViewerSharingContext = createContext(null);
