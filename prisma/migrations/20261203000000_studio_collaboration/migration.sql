-- Studio ACLs and document-scoped access to private Files originals.
BEGIN;
CREATE SCHEMA IF NOT EXISTS runly_studio;
REVOKE ALL ON SCHEMA runly_studio FROM PUBLIC;
GRANT USAGE ON SCHEMA runly_studio TO authenticated;

CREATE TABLE public.studio_collaborator (
  design_id uuid NOT NULL REFERENCES public.studio_design(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profile(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('VIEWER','EDITOR')),
  granted_by uuid NOT NULL REFERENCES public.user_profile(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(design_id,user_id)
);
CREATE INDEX studio_collaborator_user ON public.studio_collaborator(user_id,design_id);
CREATE TABLE public.studio_design_asset (
  design_id uuid NOT NULL REFERENCES public.studio_design(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.file_asset(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES public.user_profile(id),
  origin_design_id uuid REFERENCES public.studio_design(id) ON DELETE CASCADE,
  PRIMARY KEY(design_id,file_id)
);
-- Existing v1/v2 designs were restricted to originals uploaded by their owner.
INSERT INTO public.studio_design_asset(design_id,file_id,added_by)
SELECT DISTINCT d.id,f.id,d.owner_id FROM public.studio_design d
CROSS JOIN LATERAL jsonb_array_elements(d.document->'objects') o
JOIN public.file_asset f ON f.id::text=lower(o->>'fileAssetId')
  AND f.entity_id=d.company_id AND f.uploaded_by_id=d.owner_id AND f.enabled
WHERE o->>'type'='image' AND f.mime_type IN ('image/png','image/jpeg','image/webp');

CREATE TABLE public.studio_presence (
  design_id uuid NOT NULL REFERENCES public.studio_design(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profile(id) ON DELETE CASCADE,
  session_id varchar(64) NOT NULL,
  cursor_x double precision,
  cursor_y double precision,
  selected_id varchar(64),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(design_id,user_id,session_id)
);
CREATE INDEX studio_presence_seen ON public.studio_presence(design_id,seen_at);
ALTER TABLE public.studio_collaborator ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_design_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_collaborator,public.studio_design_asset,public.studio_presence FROM PUBLIC,anon,authenticated;

CREATE FUNCTION runly_studio.member_active(p_company uuid,p_user uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.runly_member_active(p_company,p_user,p_permission) AND EXISTS (
    SELECT 1 FROM public.runly_module m WHERE m.key='runly.studio' AND m.enabled AND m.status='INSTALLED'
      AND NOT EXISTS(SELECT 1 FROM public.company_module cm WHERE cm.company_id=p_company AND cm.module_id=m.id AND NOT cm.enabled)
  );
$$;
REVOKE ALL ON FUNCTION runly_studio.member_active(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION runly_studio.can_access(p_design uuid,p_user uuid,p_edit boolean DEFAULT false,p_depth integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_depth >= 5 THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.studio_design d
    LEFT JOIN public.studio_collaborator c ON c.design_id=d.id AND c.user_id=p_user
    WHERE d.id=p_design AND d.enabled
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
            AND (a.origin_design_id IS NULL OR runly_studio.can_access(a.origin_design_id,p_user,false,p_depth+1))
        )
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION runly_studio.can_access(uuid,uuid,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION runly_studio.can_access(uuid,uuid,boolean,integer) TO authenticated;

CREATE FUNCTION runly_studio.topic_design_id(p_topic text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN split_part(p_topic,'@',1) ~ '^studio:design:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN substring(split_part(p_topic,'@',1) FROM 15)::uuid ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION runly_studio.topic_design_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION runly_studio.topic_design_id(text) TO authenticated;
CREATE POLICY studio_receive ON realtime.messages FOR SELECT TO authenticated USING (
  runly_studio.topic_design_id(realtime.topic()) IS NOT NULL
  AND split_part(realtime.topic(),'@',2)=public.runly_realtime_revision()
  AND runly_studio.can_access(runly_studio.topic_design_id(realtime.topic()),public.current_profile_id(),false)
);
-- Client writes remain denied by runly_realtime_server_writes (restrictive).
CREATE TRIGGER studio_acl_rotation AFTER INSERT OR UPDATE OR DELETE ON public.studio_collaborator
FOR EACH ROW EXECUTE FUNCTION public.runly_rotate_realtime();
CREATE TRIGGER studio_asset_rotation AFTER INSERT OR DELETE ON public.studio_design_asset
FOR EACH ROW EXECUTE FUNCTION public.runly_rotate_realtime();
CREATE TRIGGER studio_design_rotation AFTER UPDATE OF owner_id,company_id,enabled OR DELETE ON public.studio_design
FOR EACH ROW EXECUTE FUNCTION public.runly_rotate_realtime();
CREATE TRIGGER studio_module_rotation AFTER UPDATE OF enabled,status ON public.runly_module
FOR EACH STATEMENT EXECUTE FUNCTION public.runly_rotate_realtime();
CREATE TRIGGER studio_company_module_rotation AFTER INSERT OR UPDATE OR DELETE ON public.company_module
FOR EACH STATEMENT EXECUTE FUNCTION public.runly_rotate_realtime();
CREATE TRIGGER studio_file_rotation AFTER UPDATE OF enabled,entity_id OR DELETE ON public.file_asset
FOR EACH STATEMENT EXECUTE FUNCTION public.runly_rotate_realtime();
COMMIT;
