-- Durable incremental-edit receipts live in the existing append-only audit
-- journal. Keep lookup bounded by batch identity, and enforce uniqueness even
-- if a future writer forgets the design transaction lock. No historical SQL changes.
CREATE UNIQUE INDEX IF NOT EXISTS studio_operation_receipt_identity
ON audit_log (company_id, actor_id, entity_id, (metadata->>'clientId'), (metadata->>'batchId'))
WHERE module_key='runly.studio' AND entity_type='StudioDesign'
  AND action='studio.design.update' AND metadata ? 'digest' AND metadata ? 'result';
