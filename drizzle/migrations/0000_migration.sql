CREATE TABLE public.cabinets (
  user_id uuid PRIMARY KEY,
  form jsonb NOT NULL DEFAULT '{}'::jsonb,
  purchases jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cabinets TO authenticated;
GRANT ALL ON public.cabinets TO service_role;
ALTER TABLE public.cabinets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cabinet select" ON public.cabinets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own cabinet insert" ON public.cabinets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own cabinet update" ON public.cabinets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);