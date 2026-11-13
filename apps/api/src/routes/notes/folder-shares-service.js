import { createUserAccessService } from '../../services/user-access-service.js'

export class FolderSharesError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'FolderSharesError'
    this.status = status
  }
}

const PERMISSIONS = ['read', 'edit']

// Folder shares are stored in note_folder_shares and materialized as
// note_shares rows (source_folder_id = folder) on every note of the folder.
// shortcut: applies to the folder's own notes only, not nested folders; revisit
// if folders gain a tree UI.
export function createFolderSharesService({ prisma }) {
  async function ownedFolder(folderId, userId) {
    const [folder] = await prisma.$queryRaw`
      SELECT id, company_id FROM note_folders
      WHERE id = ${folderId}::uuid AND owner_user_id = ${userId}::uuid
    `
    if (!folder) throw new FolderSharesError('Carpeta no encontrada.', 404)
    return folder
  }

  async function listShares(folderId, userId) {
    await ownedFolder(folderId, userId)
    return prisma.$queryRaw`
      SELECT fs.*, up.display_name, up.email AS user_email, up.avatar_file_id
      FROM note_folder_shares fs
      JOIN user_profile up ON up.id = fs.shared_with_user_id
      WHERE fs.folder_id = ${folderId}::uuid
      ORDER BY up.display_name
    `
  }

  async function shareFolder(folderId, userId, { targetUserId, permission }) {
    const folder = await ownedFolder(folderId, userId)
    if (!targetUserId || targetUserId === userId) throw new FolderSharesError('Usuario destino invalido.')
    if (!PERMISSIONS.includes(permission)) throw new FolderSharesError("El permiso debe ser 'read' o 'edit'.")
    await createUserAccessService({ prisma }).assertCandidates({
      companyId: folder.company_id, userIds: [targetUserId], permission: 'notes.notes.read',
    })
    const [share] = await prisma.$queryRaw`
      INSERT INTO note_folder_shares (folder_id, shared_with_user_id, shared_by_user_id, permission)
      VALUES (${folderId}::uuid, ${targetUserId}::uuid, ${userId}::uuid, ${permission})
      ON CONFLICT (folder_id, shared_with_user_id) DO UPDATE SET permission = EXCLUDED.permission
      RETURNING *
    `
    await prisma.$executeRaw`
      INSERT INTO note_shares (note_id, shared_with_user_id, shared_by_user_id, permission, source_folder_id)
      SELECT n.id, ${targetUserId}::uuid, ${userId}::uuid, ${permission}, ${folderId}::uuid
      FROM notes n
      WHERE n.folder_id = ${folderId}::uuid AND n.owner_user_id = ${userId}::uuid AND n.deleted_at IS NULL
      ON CONFLICT (note_id, shared_with_user_id) DO UPDATE SET permission = EXCLUDED.permission
        WHERE note_shares.source_folder_id = EXCLUDED.source_folder_id
    `
    return share
  }

  async function updateShare(folderId, shareId, userId, { permission }) {
    await ownedFolder(folderId, userId)
    if (!PERMISSIONS.includes(permission)) throw new FolderSharesError("El permiso debe ser 'read' o 'edit'.")
    const [share] = await prisma.$queryRaw`
      UPDATE note_folder_shares SET permission = ${permission}
      WHERE id = ${shareId}::uuid AND folder_id = ${folderId}::uuid
      RETURNING *
    `
    if (!share) throw new FolderSharesError('Acceso no encontrado.', 404)
    await prisma.$executeRaw`
      UPDATE note_shares SET permission = ${permission}
      WHERE source_folder_id = ${folderId}::uuid AND shared_with_user_id = ${share.shared_with_user_id}::uuid
    `
    return share
  }

  async function revokeShare(folderId, shareId, userId) {
    await ownedFolder(folderId, userId)
    const [share] = await prisma.$queryRaw`
      DELETE FROM note_folder_shares WHERE id = ${shareId}::uuid AND folder_id = ${folderId}::uuid
      RETURNING shared_with_user_id
    `
    if (!share) throw new FolderSharesError('Acceso no encontrado.', 404)
    await prisma.$executeRaw`
      DELETE FROM note_shares
      WHERE source_folder_id = ${folderId}::uuid AND shared_with_user_id = ${share.shared_with_user_id}::uuid
    `
    return { ok: true }
  }

  // Call after a note is created in, or moved to, a folder: drops grants that
  // came from its previous folder and applies the current folder's shares.
  async function syncNoteFolder(noteId) {
    await prisma.$executeRaw`
      DELETE FROM note_shares ns USING notes n
      WHERE ns.note_id = n.id AND n.id = ${noteId}::uuid
        AND ns.source_folder_id IS NOT NULL
        AND ns.source_folder_id IS DISTINCT FROM n.folder_id
    `
    await prisma.$executeRaw`
      INSERT INTO note_shares (note_id, shared_with_user_id, shared_by_user_id, permission, source_folder_id)
      SELECT n.id, fs.shared_with_user_id, fs.shared_by_user_id, fs.permission, fs.folder_id
      FROM notes n
      JOIN note_folders f ON f.id = n.folder_id AND f.owner_user_id = n.owner_user_id
      JOIN note_folder_shares fs ON fs.folder_id = f.id
      WHERE n.id = ${noteId}::uuid AND fs.shared_with_user_id <> n.owner_user_id
      ON CONFLICT (note_id, shared_with_user_id) DO NOTHING
    `
  }

  return { listShares, shareFolder, updateShare, revokeShare, syncNoteFolder }
}
