BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(11);

SELECT hasnt_table('public', 'saved_searches', 'Lagrede søk er ikke del av Open-skjemaet');
SELECT hasnt_table('public', 'saved_search_notifications', 'Søkevarsler er ikke del av Open-skjemaet');
SELECT hasnt_table('public', 'push_subscriptions', 'Push-abonnement er ikke del av Open-skjemaet');
SELECT hasnt_table('public', 'push_dispatch_failures', 'Push-drift er ikke del av Open-skjemaet');
SELECT hasnt_function('public', 'dispatch_push', ARRAY['text', 'jsonb'], 'Meldinger utløser ingen privat push-dispatch');
SELECT hasnt_function('public', 'saved_search_unread_counts', ARRAY[]::text[], 'Ingen RPC for private søkevarsler følger med');
SELECT is((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity),
  0::bigint, 'Alle Open-tabeller beholder RLS');
SELECT ok(NOT has_function_privilege('anon', 'public.admin_export_user_data(uuid)', 'EXECUTE'),
  'Anonym kan ikke kalle administratorens dataeksport');
SELECT throws_ok($$SELECT public.admin_export_user_data('00000000-0000-4000-8000-00000000d001')$$,
  'P0001', 'Not authorized', 'Dataeksport krever administrator selv med direkte SQL-kall');

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000d001', 'open-owner-pgtap@example.com'),
  ('00000000-0000-4000-8000-00000000d002', 'open-other-pgtap@example.com');
INSERT INTO public.listings (id, seller_id, title) VALUES
  ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000d001', 'Åpen testannonse');
SELECT throws_ok($$UPDATE public.listings SET seller_id = '00000000-0000-4000-8000-00000000d002'
  WHERE id = '00000000-0000-4000-8000-00000000d003'$$,
  'P0001', 'Listing ownership cannot be changed', 'Eierskapet til en annonse kan ikke endres');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000d002', 'admin');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d002","role":"authenticated"}', true);
SELECT ok((SELECT data ? 'profile' AND data ? 'listings' AND data ? 'account_deletion'
  AND NOT data ?| ARRAY['saved_searches', 'saved_search_notifications', 'push_subscriptions']
  FROM (SELECT public.admin_export_user_data('00000000-0000-4000-8000-00000000d001') AS data) exported),
  'Dataeksport virker for kjernen uten kall til kuttede tabeller');

SELECT * FROM finish();
ROLLBACK;
