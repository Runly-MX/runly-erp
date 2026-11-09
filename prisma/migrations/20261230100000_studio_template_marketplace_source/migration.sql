ALTER TABLE public.studio_template DROP CONSTRAINT IF EXISTS studio_template_source_check;
ALTER TABLE public.studio_template ADD CONSTRAINT studio_template_source_check CHECK (source IN ('user','ai','marketplace'));
