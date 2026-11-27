-- Rollback of the stage 4C/4D schema additions (additive migrations 20270117..20270119). Run only after stopping the new API/worker
-- and after exporting any derivative objects you need: derivative rows and their Storage objects are discarded.
BEGIN;
DROP TRIGGER IF EXISTS content_derivative_object ON runly_content.derivative;
DROP FUNCTION IF EXISTS runly_content.record_derivative_object();
DROP TABLE IF EXISTS runly_content.derivative_orphan;
DROP TABLE IF EXISTS runly_content.derivative;
DROP INDEX IF EXISTS file_asset_entity_enabled_id_idx;
-- 20270117 only widened the accepted MIME list of enqueue_file(); restore the stage-3 definition if HEIC must stop being admitted:
--   re-run the CREATE OR REPLACE FUNCTION runly_content.enqueue_file() block of 20270116000000_content_intelligence_consolidation.
DELETE FROM _prisma_migrations WHERE migration_name IN ('20270119000000_content_derivative_reconcile','20270118000000_content_searchable_pdf','20270117000000_content_intelligence_heic');
COMMIT;
