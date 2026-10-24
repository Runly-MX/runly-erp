import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { useNotes, useCreateNote } from './useNotes.js'
import { useNote } from './useNote.js'

// Direct children of a note (the API only returns the ones the user can open).
export function useSubpages(noteId) {
  const { data, isLoading, isError, refetch } = useNotes({ parentId: noteId, pageSize: 100 }, { enabled: Boolean(noteId) })
  return { children: data?.notes ?? [], isLoading, isError, refetch }
}

// Root-first ancestors of a sub-page (from the note detail; only the ones the
// user can open). Empty for root notes.
export function useNoteAncestors(note) {
  const { data } = useNote(note?.parent_note_id ? note.id : null)
  return note?.parent_note_id ? (data?.note?.ancestors ?? []) : []
}

// Creates a child under `parentId`; resolves with the new note row.
export function useCreateSubpage() {
  const create = useCreateNote()
  const createSubpage = useCallback(
    (parentId) => create.mutateAsync({
      parentId,
      title: 'Nueva subpagina',
      content: '<p></p><p></p>',
    }).then((res) => res?.note ?? null),
    [create],
  )
  return { createSubpage, isCreating: create.isPending }
}

// Fetches a full note row (content included) so opening a breadcrumb or strip
// entry never feeds the editor a partial object.
export function useFetchNote() {
  const { session } = useAuth()
  const token = session?.access_token
  const queryClient = useQueryClient()
  return useCallback(async (noteId) => {
    const res = await queryClient.fetchQuery({
      queryKey: ['notes', noteId],
      queryFn: () => runly.notes.get(noteId, token),
      staleTime: 0,
    })
    return res?.note ?? null
  }, [queryClient, token])
}
