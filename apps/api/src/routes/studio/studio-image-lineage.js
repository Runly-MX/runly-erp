// Scope is a currently authorized design. Only immutable server audit events,
// never client-editable FileAsset metadata, delegate access to edited originals.
export function createStudioImageLineage({prisma}) {
  async function imageAllowed(companyId,designId,fileId,db=prisma) {
    const [row]=await db.$queryRaw`WITH RECURSIVE lineage(file_id,depth,visited) AS (
      SELECT DISTINCT ref.file_id,0,ARRAY[ref.file_id] FROM studio_design d,
        jsonb_array_elements(d.document->'objects') o
      CROSS JOIN LATERAL (SELECT CASE WHEN o->>'type'='image' THEN o->>'fileAssetId'
        WHEN o->'fillPaint'->>'type'='image' THEN o->'fillPaint'->>'fileAssetId' END AS file_id) ref
      WHERE d.id=${designId}::uuid AND d.company_id=${companyId}::uuid AND ref.file_id IS NOT NULL
      UNION ALL
      SELECT edge.file_id,l.depth+1,l.visited||edge.file_id
      FROM lineage l JOIN audit_log a ON a.module_key='runly.studio' AND a.entity_type='StudioDesign'
        AND a.entity_id=${designId}::uuid AND a.action='studio.image.copy'
        AND (a.metadata->>'copyFileId'=l.file_id OR a.metadata->>'sourceFileId'=l.file_id)
      CROSS JOIN LATERAL (SELECT CASE WHEN a.metadata->>'copyFileId'=l.file_id
        THEN a.metadata->>'sourceFileId' ELSE a.metadata->>'copyFileId' END AS file_id) edge
      WHERE l.depth<50 AND NOT(edge.file_id=ANY(l.visited))
    ) SELECT EXISTS(SELECT 1 FROM lineage WHERE file_id=${fileId}) AS allowed`
    return row?.allowed===true
  }
  return {imageAllowed}
}
