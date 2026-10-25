// Lightweight SQL doubles for the fast renderer/service suite only.
// Production membership/RBAC/RLS and rotation are tested by the real Supabase suite.
export async function installMinimalStudioAccess(pool) {
  await pool.query(`ALTER TABLE user_profile ADD COLUMN display_name text DEFAULT 'Fixture';
    CREATE TABLE studio_collaborator(design_id uuid,user_id uuid,role text,granted_by uuid,PRIMARY KEY(design_id,user_id));
    CREATE TABLE studio_design_asset(design_id uuid,file_id uuid,added_by uuid,origin_design_id uuid,PRIMARY KEY(design_id,file_id));
    CREATE TABLE realtime_authorization_revision(id boolean PRIMARY KEY,revision bigint);
    INSERT INTO realtime_authorization_revision VALUES(true,1);
    CREATE SCHEMA IF NOT EXISTS runly_studio;
    CREATE OR REPLACE FUNCTION runly_studio.member_active(c uuid,u uuid,p text) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS(SELECT 1 FROM company WHERE id=c) AND EXISTS(SELECT 1 FROM user_profile WHERE id=u) $$;
    CREATE OR REPLACE FUNCTION runly_studio.can_access(d uuid,u uuid,e boolean DEFAULT false) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS(SELECT 1 FROM studio_design s LEFT JOIN studio_collaborator c ON c.design_id=s.id AND c.user_id=u
      WHERE s.id=d AND s.enabled AND (s.owner_id=u OR c.role IN ('VIEWER','EDITOR')) AND (NOT e OR s.owner_id=u OR c.role='EDITOR')) $$;`)
}
