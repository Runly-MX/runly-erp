// apps/api/src/routes/chat/orphan-attachment-sweep-job.js
//
// Deletes abandoned "pending" chat attachments: rows written by
// presignAttachmentUpload (message_id NULL) that never got linked to a sent
// message. The composer deletes its own removed/unsent uploads via
// DELETE /chat/attachments/:id, but a closed tab, a crash, or an offline
// client leaves the row + storage object behind. This sweep is the safety net.
//
// Threshold: the presigned upload URL expires in 300s, so anything with a NULL
// message_id older than a couple hours is certainly abandoned. Never touch a
// compose still in progress (long voice note, slow upload, user stepped away).

export async function sweepOrphanChatAttachments({
  prisma,
  supabaseAdmin,
  olderThanMinutes = 120,
  limit = 200,
}) {
  const rows = await prisma.$queryRaw`
    SELECT id, bucket, object_key
    FROM chat_attachments a
    WHERE message_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM runly_lifecycle.owners('public.chat_attachments'::regclass, to_jsonb(a)) o
        JOIN runly_lifecycle.company_deletion d ON d.company_id = o WHERE d.state <> 'CANCELLED')
      AND created_at < NOW() - (${olderThanMinutes} * INTERVAL '1 minute')
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  if (rows.length === 0) return { swept: 0 };

  const byBucket = new Map();
  for (const row of rows) {
    if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
    byBucket.get(row.bucket).push(row.object_key);
  }
  for (const [bucket, keys] of byBucket) {
    try {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(keys);
      if (error) {
        console.error("[chat.orphan-sweep] storage remove failed", { bucket, count: keys.length, error: error.message });
      }
    } catch (err) {
      console.error("[chat.orphan-sweep] storage remove threw", { bucket, error: err?.message ?? err });
    }
  }

  const ids = rows.map((row) => row.id);
  const deleted = await prisma.$executeRaw`
    DELETE FROM chat_attachments WHERE id = ANY(${ids}::uuid[])
  `;
  return { swept: Number(deleted) || ids.length };
}
