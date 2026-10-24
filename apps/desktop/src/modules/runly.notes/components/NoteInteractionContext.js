import { createContext } from 'react'

// View mode is a UI preference, separate from the note's write permission.
// `noteId` and `token` let a note image upload its edited copy (full image editor).
export const NoteInteractionContext = createContext({
  viewing: false, noteId: null, token: null, isPublic: false, outlineOpen: false, toggleOutline: () => {},
  openReferencePicker: () => {}, createSubpage: null,
})
