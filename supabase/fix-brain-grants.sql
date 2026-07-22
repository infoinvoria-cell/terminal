-- Run in Supabase Dashboard → SQL Editor
-- Grants write access for service_role on brain graph tables

GRANT ALL ON public.brain_nodes TO service_role;
GRANT ALL ON public.brain_links TO service_role;
GRANT USAGE ON SEQUENCE public.brain_links_id_seq TO service_role;
