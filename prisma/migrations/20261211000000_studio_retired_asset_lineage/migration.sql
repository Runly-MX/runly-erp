-- Generated with Supabase CLI migration new; sequenced after existing migrations.
-- Retired documents are unavailable directly but retain their existing ACL as
-- an image-reference origin. No new user, company, role or Files privileges.
BEGIN;
CREATE FUNCTION runly_studio.reference_access(p_design uuid,p_user uuid,p_edit boolean,p_depth integer,p_reference boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_depth >= 5 THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.studio_design d
    LEFT JOIN public.studio_collaborator c ON c.design_id=d.id AND c.user_id=p_user
    WHERE d.id=p_design AND (d.enabled OR p_reference)
      AND runly_studio.member_active(d.company_id,p_user,'studio.view')
      AND (NOT p_edit OR runly_studio.member_active(d.company_id,p_user,'studio.edit'))
      AND (d.owner_id=p_user OR c.role IN ('VIEWER','EDITOR'))
      AND (NOT p_edit OR d.owner_id=p_user OR c.role='EDITOR')
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(d.document->'objects') o
        WHERE o->>'type'='image' AND NOT EXISTS (
          SELECT 1 FROM public.studio_design_asset a JOIN public.file_asset f ON f.id=a.file_id
          WHERE a.design_id=d.id AND f.id::text=lower(o->>'fileAssetId') AND f.entity_id=d.company_id
            AND f.enabled AND f.mime_type IN ('image/png','image/jpeg','image/webp')
            AND (a.origin_design_id IS NULL OR runly_studio.reference_access(a.origin_design_id,p_user,false,p_depth+1,true))
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION runly_studio.reference_access(uuid,uuid,boolean,integer,boolean) FROM PUBLIC,anon,authenticated,service_role,runly_studio_socket;
CREATE OR REPLACE FUNCTION runly_studio.can_access(p_design uuid,p_user uuid,p_edit boolean DEFAULT false,p_depth integer DEFAULT 0)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT runly_studio.reference_access(p_design,p_user,p_edit,GREATEST(p_depth,0),false);
$$;
COMMIT;
