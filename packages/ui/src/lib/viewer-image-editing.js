import { createContext } from "react";

// App-level image editing handlers for AdvancedFileViewer. Provide
// { saveCopy(editedFile, sourceFile), replace(editedFile, sourceFile) } high in
// the tree (either may be omitted); each returns a promise and throws when the
// save failed, after reporting the error to the user. The viewer then shows
// "Editar" on image files without every host wiring it. See
// docs/ai-context/rme3-runtime-capabilities.md.
export const ViewerImageEditingContext = createContext(null);
