-- kaupet_open: basisskjema for en ny database. Ikke rediger for hånd;
-- legg nye endringer i egne migrasjoner etter denne.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'user',
    'demo',
    'moderator'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."block_scope" AS ENUM (
    'all',
    'conversation'
);


ALTER TYPE "public"."block_scope" OWNER TO "postgres";


CREATE TYPE "public"."listing_condition" AS ENUM (
    'new',
    'like_new',
    'good',
    'acceptable',
    'for_parts'
);


ALTER TYPE "public"."listing_condition" OWNER TO "postgres";


CREATE TYPE "public"."listing_status" AS ENUM (
    'draft',
    'active',
    'sold',
    'archived',
    'expired',
    'disabled'
);


ALTER TYPE "public"."listing_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_ban_user"("_user_id" "uuid", "_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF public.has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'Kan ikke utestenge en administrator';
  END IF;
  INSERT INTO public.user_bans(user_id, reason, banned_by)
  VALUES (_user_id, _reason, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, created_at = now();
  UPDATE public.listings SET status = 'disabled'
    WHERE seller_id = _user_id AND status = 'active';
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'ban_user', 'user', _user_id::text, _reason);
END $$;


ALTER FUNCTION "public"."admin_ban_user"("_user_id" "uuid", "_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_listing"("_id" "uuid", "_message" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _seller_id uuid;
  _title text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT seller_id, title INTO _seller_id, _title FROM public.listings WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'delete_listing', 'listing', _id::text, _message);
  DELETE FROM public.listings WHERE id = _id;
  IF _seller_id IS NOT NULL THEN
    INSERT INTO public.system_messages(recipient_id, body)
    VALUES (_seller_id, _message);
  END IF;
END $$;


ALTER FUNCTION "public"."admin_delete_listing"("_id" "uuid", "_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_disable_listing"("_id" "uuid", "_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.listings SET status = 'disabled' WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'disable_listing', 'listing', _id::text, _reason);
END $$;


ALTER FUNCTION "public"."admin_disable_listing"("_id" "uuid", "_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_disable_listing_with_message"("_id" "uuid", "_reason" "text", "_message" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _seller_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT seller_id INTO _seller_id FROM public.listings WHERE id = _id;
  UPDATE public.listings SET status = 'disabled' WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'disable_listing', 'listing', _id::text, _reason);
  IF _seller_id IS NOT NULL THEN
    INSERT INTO public.system_messages(recipient_id, body)
    VALUES (_seller_id, _message);
  END IF;
END $$;


ALTER FUNCTION "public"."admin_disable_listing_with_message"("_id" "uuid", "_reason" "text", "_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_enable_listing"("_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.listings SET status = 'active',
    published_at = COALESCE(published_at, now()),
    expires_at = now() + interval '30 days'
    WHERE id = _id AND status = 'disabled';
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'enable_listing', 'listing', _id::text);
END $$;


ALTER FUNCTION "public"."admin_enable_listing"("_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_export_user_data"("_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _result jsonb;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;

  _result := jsonb_build_object(
    'generated_at', now(), 'generated_by_admin_id', auth.uid(), 'user_id', _user_id,
    'auth', (SELECT jsonb_build_object(
      'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at, 'user_metadata', u.raw_user_meta_data
    ) FROM auth.users u WHERE u.id = _user_id),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id),
    'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.user_roles r WHERE r.user_id = _user_id), '[]'::jsonb),
    'listings', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object(
        'images', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order) FROM public.listing_images i WHERE i.listing_id = l.id), '[]'::jsonb)
      )) FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb),
    'favorites', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.favorites f WHERE f.user_id = _user_id), '[]'::jsonb),
    'conversations', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.conversations c WHERE c.buyer_id = _user_id OR c.seller_id = _user_id), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.messages m WHERE m.sender_id = _user_id OR m.conversation_id IN (SELECT c.id FROM public.conversations c WHERE c.buyer_id = _user_id OR c.seller_id = _user_id)), '[]'::jsonb),
    'message_reactions', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.message_reactions r WHERE r.user_id = _user_id), '[]'::jsonb),
    'reports', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.reports r WHERE r.reporter_id = _user_id OR r.reported_user_id = _user_id OR r.resolved_by = _user_id), '[]'::jsonb),
    'blocks', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM public.user_blocks b WHERE b.blocker_id = _user_id OR b.blocked_id = _user_id), '[]'::jsonb),
    'system_messages', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.system_messages m WHERE m.recipient_id = _user_id), '[]'::jsonb),
    'error_log', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.error_log e WHERE e.user_id = _user_id), '[]'::jsonb),
    'moderation', jsonb_build_object(
      'bans', COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM public.user_bans b WHERE b.user_id = _user_id), '[]'::jsonb),
      'suspensions', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.user_suspensions s WHERE s.user_id = _user_id), '[]'::jsonb),
      'admin_actions', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM public.admin_moderation_log l WHERE (l.target_type = 'user' AND l.target_id = _user_id::text) OR l.admin_id = _user_id), '[]'::jsonb)
    ),
    'account_deletion', (SELECT to_jsonb(a) FROM public.account_deletions a WHERE a.user_id = _user_id)
  );

  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'export_user_data', 'user', _user_id::text, COALESCE(_email, ''));

  RETURN _result;
END;
$$;


ALTER FUNCTION "public"."admin_export_user_data"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_find_users_by_email"("_query" "text") RETURNS TABLE("user_id" "uuid", "email" "text", "display_name" "text", "created_at" timestamp with time zone, "is_admin" boolean, "is_demo" boolean, "is_moderator" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.display_name,
    u.created_at,
    public.has_role(u.id, 'admin'),
    public.has_role(u.id, 'demo'),
    public.has_role(u.id, 'moderator')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email ILIKE '%' || _query || '%'
  ORDER BY u.created_at DESC
  LIMIT 50;
END $$;


ALTER FUNCTION "public"."admin_find_users_by_email"("_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_grant_demo_role"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'demo') ON CONFLICT DO NOTHING;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'grant_demo_role', 'user', _user_id::text);
END $$;


ALTER FUNCTION "public"."admin_grant_demo_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_grant_moderator_role"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'moderator') ON CONFLICT DO NOTHING;
END $$;


ALTER FUNCTION "public"."admin_grant_moderator_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_grant_role"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."admin_grant_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_bans"() RETURNS TABLE("user_id" "uuid", "display_name" "text", "reason" "text", "banned_by" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT b.user_id, p.display_name, b.reason, b.banned_by, b.created_at
  FROM public.user_bans b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  ORDER BY b.created_at DESC;
END $$;


ALTER FUNCTION "public"."admin_list_bans"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_reports"("_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "listing_id" "uuid", "kaupet_code" "text", "listing_title" "text", "reporter_id" "uuid", "reporter_name" "text", "owner_id" "uuid", "owner_name" "text", "reported_user_id" "uuid", "reported_user_name" "text", "reason" "text", "comment" "text", "status" "text", "resolved_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text IN ('admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT
      r.id,
      r.created_at,
      r.listing_id,
      l.kaupet_code::text,
      l.title AS listing_title,
      r.reporter_id,
      rp.display_name AS reporter_name,
      l.seller_id AS owner_id,
      op.display_name AS owner_name,
      r.reported_user_id,
      ru.display_name AS reported_user_name,
      r.reason,
      r.comment,
      r.status,
      r.resolved_at
    FROM public.reports r
    LEFT JOIN public.listings l ON l.id = r.listing_id
    LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
    LEFT JOIN public.profiles op ON op.id = l.seller_id
    LEFT JOIN public.profiles ru ON ru.id = r.reported_user_id
    ORDER BY r.created_at DESC
    LIMIT _limit;
END $$;


ALTER FUNCTION "public"."admin_list_reports"("_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_replace_listing_category"("_category_id" "uuid", "_replacement_category_id" "uuid", "_expected_rows" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _expected_count integer;
  _listing_count integer;
  _matched_count integer;
  _updated_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF _category_id = _replacement_category_id
    OR _expected_rows IS NULL OR jsonb_typeof(_expected_rows) <> 'array' THEN
    RAISE EXCEPTION 'Invalid category replacement';
  END IF;

  SELECT count(*) INTO _expected_count FROM jsonb_array_elements(_expected_rows);
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(_expected_rows) AS e(id uuid)
    GROUP BY id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate listing in category replacement';
  END IF;

  PERFORM 1 FROM public.categories WHERE id = _category_id FOR UPDATE;
  PERFORM 1 FROM public.listings
  WHERE category_id = _category_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO _listing_count
  FROM public.listings WHERE category_id = _category_id;
  SELECT count(*) INTO _matched_count
  FROM public.listings l
  JOIN jsonb_to_recordset(_expected_rows) AS e(
    id uuid, status public.listing_status, updated_at timestamptz
  ) ON e.id = l.id AND e.status = l.status AND e.updated_at = l.updated_at
  WHERE l.category_id = _category_id;
  IF _listing_count <> _expected_count OR _matched_count <> _expected_count THEN
    RAISE EXCEPTION 'A listing changed during category replacement' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.listings l
  SET category_id = _replacement_category_id,
      attributes = COALESCE(e.attributes, l.attributes)
  FROM jsonb_to_recordset(_expected_rows) AS e(
    id uuid, status public.listing_status, updated_at timestamptz, attributes jsonb
  )
  WHERE l.id = e.id AND l.category_id = _category_id
    AND l.status = e.status AND l.updated_at = e.updated_at;
  GET DIAGNOSTICS _updated_count = ROW_COUNT;
  IF _updated_count <> _expected_count THEN
    RAISE EXCEPTION 'A listing changed during category replacement' USING ERRCODE = 'PT409';
  END IF;
END;
$$;


ALTER FUNCTION "public"."admin_replace_listing_category"("_category_id" "uuid", "_replacement_category_id" "uuid", "_expected_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_resolve_report"("_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text IN ('admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.reports
  SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = _id;
END $$;


ALTER FUNCTION "public"."admin_resolve_report"("_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_demo_role"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'demo';
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'revoke_demo_role', 'user', _user_id::text);
END $$;


ALTER FUNCTION "public"."admin_revoke_demo_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_moderator_role"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'moderator';
END $$;


ALTER FUNCTION "public"."admin_revoke_moderator_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_role"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  admin_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count <= 1 THEN
    RAISE EXCEPTION 'Kan ikke fjerne siste administrator';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin';
END;
$$;


ALTER FUNCTION "public"."admin_revoke_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_listings"("_query" "text" DEFAULT ''::"text", "_status" "text" DEFAULT NULL::"text", "_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "kaupet_code" character, "title" "text", "status" "public"."listing_status", "seller_id" "uuid", "seller_name" "text", "created_at" timestamp with time zone, "hidden_from_home" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT l.id, l.kaupet_code, l.title, l.status, l.seller_id, p.display_name, l.created_at, l.hidden_from_home
  FROM public.listings l
  LEFT JOIN public.profiles p ON p.id = l.seller_id
  WHERE (_query = '' OR l.title ILIKE '%' || _query || '%' OR l.kaupet_code = _query)
    AND (_status IS NULL OR l.status::text = _status)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;


ALTER FUNCTION "public"."admin_search_listings"("_query" "text", "_status" "text", "_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_listing_home_visibility"("_id" "uuid", "_hidden" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.listings SET hidden_from_home = _hidden WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (
    auth.uid(),
    CASE WHEN _hidden THEN 'hide_listing_from_home' ELSE 'show_listing_on_home' END,
    'listing',
    _id::text
  );
END $$;


ALTER FUNCTION "public"."admin_set_listing_home_visibility"("_id" "uuid", "_hidden" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unban_user"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.user_bans WHERE user_id = _user_id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'unban_user', 'user', _user_id::text);
END $$;


ALTER FUNCTION "public"."admin_unban_user"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_upload_listing_image"("_listing_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.listings l
    where l.id = _listing_id
      and l.seller_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."can_upload_listing_image"("_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_account_deletion"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE _uid uuid := auth.uid(); _request public.account_deletions%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text, 0));
  SELECT * INTO _request FROM public.account_deletions WHERE user_id = _uid AND scheduled_purge_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.listings l
  SET status = CASE WHEN s.value->>'status' = 'active' AND (public.is_user_banned(_uid) OR public.is_user_suspended(_uid))
      THEN 'disabled'::public.listing_status
    WHEN s.value->>'status' = 'active' AND l.expires_at <= now()
      THEN 'expired'::public.listing_status ELSE (s.value->>'status')::public.listing_status END
  FROM jsonb_array_elements(_request.listing_states) s(value)
  WHERE l.id = (s.value->>'id')::uuid AND l.seller_id = _uid AND l.status = 'archived';

  DELETE FROM public.account_deletions WHERE user_id = _uid;
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."cancel_account_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_endpoint_rate_limit"("_bucket" "text", "_key_hash" "text", "_limit" integer, "_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_attempts integer;
  window_interval interval;
BEGIN
  IF length(_key_hash) <> 64 OR _limit <= 0 OR _window_seconds <= 0 THEN
    RAISE EXCEPTION 'Invalid rate-limit input';
  END IF;
  window_interval := make_interval(secs => _window_seconds);

  INSERT INTO public.endpoint_rate_limits AS limits
    (bucket, key_hash, window_started_at, attempts)
  VALUES (_bucket, _key_hash, now(), 1)
  ON CONFLICT (bucket, key_hash) DO UPDATE SET
    attempts = CASE
      WHEN limits.window_started_at < now() - window_interval THEN 1
      ELSE limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at < now() - window_interval THEN now()
      ELSE limits.window_started_at
    END
  RETURNING attempts INTO current_attempts;

  RETURN current_attempts <= _limit;
END;
$$;


ALTER FUNCTION "public"."check_endpoint_rate_limit"("_bucket" "text", "_key_hash" "text", "_limit" integer, "_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_rate_limit"("_bucket" "text", "_user_id" "uuid", "_limit" integer, "_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF _user_id IS NULL OR length(_bucket) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Invalid user rate-limit input';
  END IF;

  RETURN public.check_endpoint_rate_limit(
    _bucket,
    encode(sha256(convert_to(_user_id::text, 'UTF8')), 'hex'),
    _limit,
    _window_seconds
  );
END;
$$;


ALTER FUNCTION "public"."check_user_rate_limit"("_bucket" "text", "_user_id" "uuid", "_limit" integer, "_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_orphan_standard_uploads"("_limit" integer) RETURNS TABLE("id" bigint, "bucket" "text", "object_key" "text", "attempts" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE _row public.standard_upload_objects%ROWTYPE;
BEGIN
  -- ponytail: én referansesjekk per gammel kandidat; materialiser referansestier hvis oppryddingen blir treg.
  DELETE FROM public.standard_upload_objects
  WHERE standard_upload_objects.id IN (
    SELECT o.id FROM public.standard_upload_objects o
    WHERE o.state = 'deleted'
      AND o.claimed_at < now() - interval '7 days'
      AND NOT public.standard_upload_is_referenced(o.bucket, o.object_key)
    ORDER BY o.claimed_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT 100
  );

  FOR _row IN
    SELECT * FROM public.standard_upload_objects o
    WHERE o.created_at < now() - interval '24 hours'
      AND o.attempts < 10
      AND (o.state = 'ready' OR (o.state = 'deleting' AND o.claimed_at < now() - interval '15 minutes'))
      AND NOT public.standard_upload_is_referenced(o.bucket, o.object_key)
    ORDER BY o.created_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(_limit, 0), 100)
  LOOP
    IF NOT public.standard_upload_is_referenced(_row.bucket, _row.object_key) THEN
      UPDATE public.standard_upload_objects
      SET state = 'deleting', claimed_at = now()
      WHERE standard_upload_objects.id = _row.id;
      id := _row.id; bucket := _row.bucket; object_key := _row.object_key; attempts := _row.attempts;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."claim_orphan_standard_uploads"("_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."conversations_enforce_block"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE b.scope = 'all'
      AND (
        (b.blocker_id = NEW.buyer_id AND b.blocked_id = NEW.seller_id)
        OR (b.blocker_id = NEW.seller_id AND b.blocked_id = NEW.buyer_id)
      )
  ) THEN
    RAISE EXCEPTION 'Samtalen kan ikke opprettes fordi en av brukerne har blokkert den andre'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."conversations_enforce_block"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."conversations_enforce_moderation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.is_user_banned(NEW.buyer_id) OR public.is_user_suspended(NEW.buyer_id) THEN
    RAISE EXCEPTION 'Du kan ikke starte nye samtaler så lenge kontoen er sperret eller svartelistet'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."conversations_enforce_moderation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_r2_cleanup"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _url text := (SELECT value FROM public.app_settings WHERE key = 'r2_cleanup_url');
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'r2_cleanup_secret');
  _stale_count integer;
  _oldest timestamptz;
  _exhausted_count integer;
  _exhausted_oldest timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.r2_delete_queue) THEN
    RETURN;
  END IF;
  IF _url IS NULL THEN
    RAISE WARNING 'r2-opprydning hoppet over: app_settings-raden "r2_cleanup_url" er ikke satt';
    RETURN;
  END IF;
  IF _secret IS NULL THEN
    -- Uten hemmeligheten ville kallet blitt avvist med 401, og pg_net
    -- svelger det svaret — køen ville vokst i det stille uten noe signal.
    -- Post ikke i det hele tatt, og varsle i loggen i stedet.
    RAISE WARNING 'r2-opprydning hoppet over: app_settings-raden "r2_cleanup_secret" er ikke satt';
    RETURN;
  END IF;
  -- Rader med attempts = 0 er aldri forsøkt. Da har endepunktet ikke svart
  -- 200 i det hele tatt — manglende worker-secret gir 401, Cloudflare Access
  -- gir en innloggingsside (pg_net følger 302 og lagrer den som 200), feil
  -- r2_cleanup_url gir 404 — og pg_net svelger alle uten spor. Jobben går
  -- hver time, så en urørt rad eldre enn seks timer betyr at kallet ikke
  -- kommer fram, ikke at én rad er vanskelig. Rader som HAR vært forsøkt har
  -- attempts > 0 og last_error, og er synlige i tabellen uten dette varselet.
  SELECT count(*), min(requested_at) INTO _stale_count, _oldest
  FROM public.r2_delete_queue
  WHERE attempts = 0 AND requested_at < now() - interval '6 hours';
  IF _stale_count > 0 THEN
    RAISE WARNING 'r2-opprydning: % rad(er) i r2_delete_queue er aldri forsøkt, eldste fra %. Endepunktet svarer sannsynligvis ikke 200 — sjekk worker-secreten R2_CLEANUP_SECRET, app_settings-raden r2_cleanup_url, og om miljøet ligger bak en Cloudflare Access-policy på /api/public/*.', _stale_count, _oldest;
  END IF;
  -- Rader med attempts >= 10 er derimot faktisk forsøkt og feiler
  -- permanent. De faller ut av spørringen i /api/public/r2/cleanup.ts
  -- (attempts < MAX_ATTEMPTS) og slettes bevisst ikke — se kommentaren der.
  -- Terskelen 10 er duplisert i MAX_ATTEMPTS i
  -- src/routes/api/public/r2/cleanup.ts; oppdater begge steder samtidig.
  SELECT count(*), min(requested_at) INTO _exhausted_count, _exhausted_oldest
  FROM public.r2_delete_queue
  WHERE attempts >= 10;
  IF _exhausted_count > 0 THEN
    RAISE WARNING 'r2-opprydning: % rad(er) i r2_delete_queue har brukt opp alle forsøkene, eldste fra %. Slettingen feiler permanent — se last_error i public.r2_delete_queue for manuell oppfølging.', _exhausted_count, _exhausted_oldest;
  END IF;
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-R2-Cleanup-Secret', _secret
    ),
    body := '{}'::jsonb
  );
END;
$$;


ALTER FUNCTION "public"."dispatch_r2_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_conversation_read_status_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only last_message_at, read status and trash status may be updated by participants';
  END IF;

  IF _uid = OLD.buyer_id THEN
    IF NEW.seller_last_read_at IS DISTINCT FROM OLD.seller_last_read_at THEN
      RAISE EXCEPTION 'Buyer cannot update seller_last_read_at';
    END IF;
    IF NEW.seller_deleted_at IS DISTINCT FROM OLD.seller_deleted_at THEN
      RAISE EXCEPTION 'Buyer cannot update seller_deleted_at';
    END IF;
    IF NEW.buyer_deleted_at IS DISTINCT FROM OLD.buyer_deleted_at THEN
      IF OLD.buyer_deleted_at IS NULL AND NEW.buyer_deleted_at IS NOT NULL THEN
        NEW.buyer_deleted_at := statement_timestamp();
      ELSIF OLD.buyer_deleted_at IS NOT NULL AND NEW.buyer_deleted_at IS NULL THEN
        IF OLD.buyer_deleted_at < statement_timestamp() - interval '14 days' THEN
          RAISE EXCEPTION 'Conversation can no longer be restored';
        END IF;
      ELSE
        RAISE EXCEPTION 'buyer_deleted_at cannot be changed once set; restore the conversation first';
      END IF;
    END IF;
  ELSIF _uid = OLD.seller_id THEN
    IF NEW.buyer_last_read_at IS DISTINCT FROM OLD.buyer_last_read_at THEN
      RAISE EXCEPTION 'Seller cannot update buyer_last_read_at';
    END IF;
    IF NEW.buyer_deleted_at IS DISTINCT FROM OLD.buyer_deleted_at THEN
      RAISE EXCEPTION 'Seller cannot update buyer_deleted_at';
    END IF;
    IF NEW.seller_deleted_at IS DISTINCT FROM OLD.seller_deleted_at THEN
      IF OLD.seller_deleted_at IS NULL AND NEW.seller_deleted_at IS NOT NULL THEN
        NEW.seller_deleted_at := statement_timestamp();
      ELSIF OLD.seller_deleted_at IS NOT NULL AND NEW.seller_deleted_at IS NULL THEN
        IF OLD.seller_deleted_at < statement_timestamp() - interval '14 days' THEN
          RAISE EXCEPTION 'Conversation can no longer be restored';
        END IF;
      ELSE
        RAISE EXCEPTION 'seller_deleted_at cannot be changed once set; restore the conversation first';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_conversation_read_status_only"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_last_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.role <> 'admin'
    OR (TG_OP = 'UPDATE' AND NEW.role = 'admin' AND NEW.user_id = OLD.user_id)
    OR auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.user_roles:admin'));
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.role = 'admin' AND r.id <> OLD.id
      AND NOT EXISTS (SELECT 1 FROM public.account_deletions d WHERE d.user_id = r.user_id)
  ) THEN
    RAISE EXCEPTION 'Kan ikke fjerne siste administrator';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION "public"."enforce_last_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_last_admin_account_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'admin')
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.user_roles:admin'));
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.role = 'admin' AND r.user_id <> NEW.user_id
      AND NOT EXISTS (SELECT 1 FROM public.account_deletions d WHERE d.user_id = r.user_id)
  ) THEN
    RAISE EXCEPTION 'Kan ikke slette kontoen til siste administrator';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_last_admin_account_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_message_soft_delete_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (to_jsonb(NEW) - 'deleted_at') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at') THEN
    RAISE EXCEPTION 'Only deleted_at may be updated on messages';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'deleted_at cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_message_soft_delete_only"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_r2_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.r2_delete_queue (bucket, prefix) VALUES (TG_ARGV[0], OLD.id || '/');
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."enqueue_r2_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_r2_delete_for_purged_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.r2_delete_queue (bucket, prefix) VALUES ('BILDER', NEW.id || '/');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_r2_delete_for_purged_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_old_listings"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _count integer;
BEGIN
  WITH updated AS (
    UPDATE public.listings
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM updated;
  RETURN _count;
END;
$$;


ALTER FUNCTION "public"."expire_old_listings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_orphan_standard_upload"("_id" bigint, "_deleted" boolean, "_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF _deleted THEN
    UPDATE public.standard_upload_objects
    SET state = 'deleted', claimed_at = now(), last_error = NULL
    WHERE id = _id AND state = 'deleting';
  ELSE
    UPDATE public.standard_upload_objects
    SET claimed_at = now(), attempts = attempts + 1, last_error = left(_error, 1000)
    WHERE id = _id AND state = 'deleting';
  END IF;
END;
$$;


ALTER FUNCTION "public"."finish_orphan_standard_upload"("_id" bigint, "_deleted" boolean, "_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fuzz_listing_location"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _cell_lat constant double precision := 400.0 / 111320.0;
  _cell_lng double precision;
BEGIN
  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    NEW.display_lat := NULL;
    NEW.display_lng := NULL;
    RETURN NEW;
  END IF;

  NEW.display_lat := round(NEW.lat / _cell_lat) * _cell_lat;
  -- Derive the longitude cell width from the quantized latitude so raw latitude
  -- cannot leak through tiny changes in display_lng.
  _cell_lng := 400.0 / (111320.0 * GREATEST(cos(radians(NEW.display_lat)), 0.01));
  NEW.display_lng := round(NEW.lng / _cell_lng) * _cell_lng;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fuzz_listing_location"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_kaupet_code"() RETURNS character
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _code char(8);
  _attempt int := 0;
BEGIN
  LOOP
    _attempt := _attempt + 1;
    -- 8 random digits, zero-padded
    _code := lpad(((random() * 100000000)::bigint % 100000000)::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.listings WHERE kaupet_code = _code);
    IF _attempt > 20 THEN
      RAISE EXCEPTION 'Kunne ikke generere unik annonsekode etter 20 forsøk';
    END IF;
  END LOOP;
  RETURN _code;
END;
$$;


ALTER FUNCTION "public"."generate_kaupet_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_standard_upload_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  _bucket text;
  _key text;
  _keys text[] := ARRAY[]::text[];
  _match text[];
  _state text;
BEGIN
  IF TG_TABLE_NAME = 'listing_images' THEN
    _bucket := 'BILDER';
    _key := NEW.storage_path;
    _keys := ARRAY[_key, regexp_replace(_key, '(\.(jpg|png|webp|jxl))$', '-thumb\1')];
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    _bucket := 'BILDER';
    _match := regexp_match(NEW.avatar_url, '/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl))$');
    IF _match IS NOT NULL THEN _keys := ARRAY[_match[1]]; END IF;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    _bucket := 'VEDLEGG'; _key := NEW.attachment_path;
    IF _key IS NOT NULL THEN _keys := ARRAY[_key]; END IF;
  END IF;

  IF cardinality(_keys) > 0 THEN
    FOR _state IN
      SELECT state FROM public.standard_upload_objects
      WHERE bucket = _bucket AND object_key = ANY(_keys)
      ORDER BY object_key FOR UPDATE
    LOOP
      IF _state <> 'ready' THEN RAISE EXCEPTION 'R2-objektet er under opprydding'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."guard_standard_upload_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'avatar_url') ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_blocked_between"("_a" "uuid", "_b" "uuid", "_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE
      (
        (b.blocker_id = _a AND b.blocked_id = _b)
        OR (b.blocker_id = _b AND b.blocked_id = _a)
      )
      AND (
        b.scope = 'all'
        OR (b.scope = 'conversation' AND b.conversation_id = _conversation_id)
      )
  );
$$;


ALTER FUNCTION "public"."is_blocked_between"("_a" "uuid", "_b" "uuid", "_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_ip_banned"("_ip" "inet") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_bans
    WHERE ip_address = _ip AND (expires_at IS NULL OR expires_at > now())
  );
$$;


ALTER FUNCTION "public"."is_ip_banned"("_ip" "inet") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_banned"("_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_bans WHERE user_id = _uid);
$$;


ALTER FUNCTION "public"."is_user_banned"("_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_deletion_pending"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_deletions WHERE user_id = _user_id);
$$;


ALTER FUNCTION "public"."is_user_deletion_pending"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_suspended"("_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_suspensions
    WHERE user_id = _uid AND expires_at > now()
  );
$$;


ALTER FUNCTION "public"."is_user_suspended"("_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listing_attribute_format_rules"("_category_id" "uuid", "_extra_dates" "jsonb") RETURNS TABLE("key" "text", "type" "text", "label_nb" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH RECURSIVE chain AS (
    SELECT c.id, c.parent_id, 0 AS depth FROM categories c WHERE c.id = _category_id
    UNION ALL
    SELECT c.id, c.parent_id, chain.depth + 1
    FROM categories c JOIN chain ON c.id = chain.parent_id
    WHERE chain.depth < 20
  ),
  filters AS (
    SELECT DISTINCT ON (f.key) f.key, f.type, f.label_nb
    FROM category_filters f JOIN chain ON chain.id = f.category_id
    ORDER BY f.key, chain.depth
  )
  SELECT key, type, label_nb FROM filters
  UNION ALL
  SELECT e.key, 'date', e.value FROM jsonb_each_text(_extra_dates) e
  WHERE NOT EXISTS (SELECT 1 FROM filters WHERE filters.key = e.key)
$$;


ALTER FUNCTION "public"."listing_attribute_format_rules"("_category_id" "uuid", "_extra_dates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listing_is_public"("_status" "public"."listing_status", "_sold_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT _status = 'active'::public.listing_status
    OR (_status = 'sold'::public.listing_status AND _sold_at > now() - interval '30 days');
$$;


ALTER FUNCTION "public"."listing_is_public"("_status" "public"."listing_status", "_sold_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listing_matches_attribute_filters"("_attributes" "jsonb", "_filters" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_each(COALESCE(_filters, '{}'::jsonb)) AS entry(key, filter)
    WHERE NOT CASE filter->>'kind'
      WHEN 'select' THEN
        COALESCE(_attributes @> jsonb_build_object(key, filter->'value'), false)
      WHEN 'boolean' THEN
        COALESCE(_attributes @> jsonb_build_object(key, filter->'value'), false)
      WHEN 'multiselect' THEN
        COALESCE(
          CASE jsonb_typeof(_attributes -> key)
            WHEN 'array' THEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(_attributes -> key) AS listing_value(value)
              WHERE listing_value.value = ANY (
                ARRAY(SELECT jsonb_array_elements_text(COALESCE(filter->'values', '[]'::jsonb)))
              )
            )
            ELSE _attributes->>key = ANY (
              ARRAY(SELECT jsonb_array_elements_text(COALESCE(filter->'values', '[]'::jsonb)))
            )
          END,
          false
        )
      WHEN 'range' THEN
        jsonb_typeof(_attributes->key) = 'number'
        AND (NOT (filter ? 'min') OR (_attributes->key) >= (filter->'min'))
        AND (NOT (filter ? 'max') OR (_attributes->key) <= (filter->'max'))
      WHEN 'text' THEN
        COALESCE(_attributes->>key ILIKE '%' || (filter->>'value') || '%', false)
      WHEN 'date_min' THEN
        COALESCE(_attributes->>key >= filter->>'value', false)
      WHEN 'exclude' THEN
        _attributes->key IS NULL
        OR NOT COALESCE(
          _attributes->>key = ANY (
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(filter->'values', '[]'::jsonb)))
          ),
          false
        )
      ELSE true
    END
  );
$$;


ALTER FUNCTION "public"."listing_matches_attribute_filters"("_attributes" "jsonb", "_filters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listing_precise_location"("_listing_id" "uuid") RETURNS TABLE("lat" double precision, "lng" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT l.lat, l.lng
  FROM public.listings l
  WHERE l.id = _listing_id
    AND l.seller_id = auth.uid();
$$;


ALTER FUNCTION "public"."listing_precise_location"("_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listings_enforce_moderation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (public.is_user_banned(NEW.seller_id) OR public.is_user_suspended(NEW.seller_id))
     AND (
     TG_OP = 'INSERT'
       OR (NEW.status = 'active' AND OLD.status IS DISTINCT FROM NEW.status
         -- Preserve admin_enable_listing's authenticated admin-only override.
         AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')))
     ) THEN
    RAISE EXCEPTION 'Brukeren kan ikke publisere annonser'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."listings_enforce_moderation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listings_search_vector_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  attribute_text text;
  option_labels text;
BEGIN
  SELECT string_agg(value, ' ') INTO attribute_text
  FROM jsonb_each_text(coalesce(NEW.attributes, '{}'::jsonb)) AS a(key, value);

  WITH RECURSIVE category_ancestors AS (
    SELECT id, parent_id FROM public.categories WHERE id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id
    FROM public.categories c
    JOIN category_ancestors a ON c.id = a.parent_id
  )
  SELECT string_agg(opt->>'label_nb', ' ') INTO option_labels
  FROM jsonb_each_text(coalesce(NEW.attributes, '{}'::jsonb)) AS a(key, value)
  JOIN public.category_filters cf ON cf.key = a.key
    AND cf.category_id IN (SELECT id FROM category_ancestors)
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(cf.options, '[]'::jsonb)) opt
  WHERE opt->>'value' = a.value
    OR (jsonb_typeof(NEW.attributes->a.key) = 'array'
      AND NEW.attributes->a.key ? (opt->>'value'));

  NEW.search_vector :=
    setweight(to_tsvector('norwegian', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('norwegian', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('norwegian', coalesce(NEW.city, '')), 'C') ||
    setweight(to_tsvector('norwegian', coalesce(attribute_text, '')), 'C') ||
    setweight(to_tsvector('norwegian', coalesce(option_labels, '')), 'C');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."listings_search_vector_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listings_set_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' THEN
      IF TG_OP = 'UPDATE' AND OLD.status = 'archived' AND EXISTS (
        SELECT 1
        FROM public.account_deletions d
        CROSS JOIN LATERAL jsonb_array_elements(d.listing_states) s(value)
        WHERE d.user_id = auth.uid() AND d.user_id = NEW.seller_id
          AND d.scheduled_purge_at > now()
          AND s.value->>'id' = NEW.id::text AND s.value->>'status' = 'active'
      ) THEN
        NEW.published_at := OLD.published_at;
        NEW.expires_at := OLD.expires_at;
      ELSE
        NEW.published_at := now();
        NEW.expires_at := now() + interval '30 days';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."listings_set_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listings_set_sold_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE _restored_sold_at timestamptz;
BEGIN
  IF NEW.status IS DISTINCT FROM 'sold' THEN
    NEW.sold_at := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sold' THEN
    -- Only the protected deletion snapshot can supply the original sale time.
    IF TG_OP = 'UPDATE' AND OLD.status = 'archived' THEN
      SELECT (s.value->>'sold_at')::timestamptz INTO _restored_sold_at
      FROM public.account_deletions d
      CROSS JOIN LATERAL jsonb_array_elements(d.listing_states) s(value)
      WHERE d.user_id = auth.uid() AND d.user_id = NEW.seller_id
        AND d.scheduled_purge_at > now()
        AND s.value->>'id' = NEW.id::text AND s.value->>'status' = 'sold';
    END IF;
    NEW.sold_at := COALESCE(_restored_sold_at, CASE WHEN auth.uid() IS NULL THEN COALESCE(NEW.sold_at, now()) ELSE now() END);
  ELSIF auth.uid() IS NOT NULL THEN
    NEW.sold_at := OLD.sold_at;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."listings_set_sold_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "price_nok" integer,
    "is_free" boolean DEFAULT false NOT NULL,
    "category_id" "uuid",
    "condition" "public"."listing_condition",
    "postal_code" "text",
    "city" "text",
    "lat" double precision,
    "lng" double precision,
    "status" "public"."listing_status" DEFAULT 'draft'::"public"."listing_status" NOT NULL,
    "search_vector" "tsvector",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "kaupet_code" character(8) DEFAULT "public"."generate_kaupet_code"() NOT NULL,
    "display_lat" double precision,
    "display_lng" double precision,
    "counted_category_id" "uuid",
    "counted_lexemes" "text"[],
    "can_ship" boolean,
    "counted_keyword_category_id" "uuid",
    "counted_keywords" "text"[],
    "attributes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "subtitle" "text",
    "known_issues" "text",
    "no_known_issues" boolean DEFAULT false NOT NULL,
    "maintenance_history" "text",
    "draft_expiry_notified_at" timestamp with time zone,
    "hidden_from_home" boolean DEFAULT false NOT NULL,
    "show_visiting_address" boolean DEFAULT false NOT NULL,
    "sold_at" timestamp with time zone,
    CONSTRAINT "listings_active_price_required" CHECK ((("status" <> 'active'::"public"."listing_status") OR "is_free" OR ("price_nok" IS NOT NULL))),
    CONSTRAINT "listings_kaupet_code_format" CHECK (("kaupet_code" ~ '^[0-9]{8}$'::"text"))
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_listing_draft_for_user"("_listing_id" "uuid", "_user_id" "uuid") RETURNS "public"."listings"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _current public.listings%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _current FROM public.listings WHERE id = _listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Annonsen finnes ikke'; END IF;
  IF _current.seller_id IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Du har ikke tilgang til denne annonsen' USING ERRCODE = '42501';
  END IF;
  RETURN _current;
END;
$$;


ALTER FUNCTION "public"."lock_listing_draft_for_user"("_listing_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."messages_bump_conversation_last_message_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id
    AND last_message_at < NEW.created_at;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."messages_bump_conversation_last_message_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."messages_enforce_block"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _other uuid;
BEGIN
  SELECT CASE WHEN c.buyer_id = NEW.sender_id THEN c.seller_id ELSE c.buyer_id END
    INTO _other
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF _other IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_blocked_between(NEW.sender_id, _other, NEW.conversation_id) THEN
    RAISE EXCEPTION 'Meldingen kan ikke sendes fordi samtalen er blokkert'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."messages_enforce_block"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."messages_enforce_moderation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.is_user_banned(NEW.sender_id) OR public.is_user_suspended(NEW.sender_id) THEN
    RAISE EXCEPTION 'Du kan ikke sende meldinger så lenge kontoen er sperret eller svartelistet'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."messages_enforce_moderation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_listing_counts"() RETURNS TABLE("listing_id" "uuid", "view_count" bigint, "favorite_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT l.id, 0::bigint, (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id)
  FROM public.listings l
  WHERE l.seller_id = auth.uid();
$$;


ALTER FUNCTION "public"."my_listing_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_moderation_status"() RETURNS TABLE("is_banned" boolean, "ban_reason" "text", "is_suspended" boolean, "suspension_reason" "text", "suspension_expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_bans WHERE user_id = auth.uid()),
    (SELECT reason FROM public.user_bans WHERE user_id = auth.uid()),
    EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now()),
    (SELECT reason FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now() ORDER BY expires_at DESC LIMIT 1),
    (SELECT expires_at FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now() ORDER BY expires_at DESC LIMIT 1)
$$;


ALTER FUNCTION "public"."my_moderation_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preserve_listing_updated_at_on_search_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF to_jsonb(NEW) - 'search_vector' - 'updated_at'
     = to_jsonb(OLD) - 'search_vector' - 'updated_at' THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."preserve_listing_updated_at_on_search_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_listing_ownership_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'Listing ownership cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_listing_ownership_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_listing_draft"("_listing_id" "uuid", "_user_id" "uuid", "_fields" "jsonb", "_images" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _current public.listings%ROWTYPE;
  _next public.listings%ROWTYPE;
BEGIN
  _current := public.lock_listing_draft_for_user(_listing_id, _user_id);
  -- A late retry cannot touch images or fields once another request published.
  IF _current.status = 'active' THEN
    RETURN jsonb_build_object('id', _current.id, 'kaupet_code', _current.kaupet_code, 'already_published', true);
  END IF;
  IF _current.status <> 'draft' THEN RAISE EXCEPTION 'Utkastet kan ikke publiseres i denne tilstanden'; END IF;
  _next := jsonb_populate_record(_current, _fields);
  PERFORM public.sync_listing_images(_listing_id, _images);

  UPDATE public.listings SET
    title = _next.title, subtitle = _next.subtitle, description = _next.description,
    category_id = _next.category_id, condition = _next.condition, is_free = _next.is_free,
    price_nok = _next.price_nok, postal_code = _next.postal_code, city = _next.city,
    lat = _next.lat, lng = _next.lng, can_ship = _next.can_ship,
    known_issues = _next.known_issues, no_known_issues = _next.no_known_issues,
    maintenance_history = _next.maintenance_history, attributes = _next.attributes,
    status = 'active'
    WHERE id = _listing_id;
  RETURN jsonb_build_object('id', _current.id, 'kaupet_code', _current.kaupet_code, 'already_published', false);
END;
$$;


ALTER FUNCTION "public"."publish_listing_draft"("_listing_id" "uuid", "_user_id" "uuid", "_fields" "jsonb", "_images" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_endpoint_rate_limits"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM public.endpoint_rate_limits
  WHERE window_started_at < now() - interval '1 day';
$$;


ALTER FUNCTION "public"."purge_endpoint_rate_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_accounts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _count integer := 0;
  _row record;
BEGIN
  FOR _row IN
    SELECT user_id FROM public.account_deletions WHERE scheduled_purge_at <= now()
  LOOP
    DELETE FROM public.listings WHERE seller_id = _row.user_id;

    UPDATE public.profiles
    SET display_name = 'Slettet bruker',
        avatar_url = NULL,
        deleted_at = now(),
        updated_at = now()
    WHERE id = _row.user_id;

    DELETE FROM auth.users WHERE id = _row.user_id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;


ALTER FUNCTION "public"."purge_expired_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_personal_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  sell_warned integer;
  sell_deleted integer;
BEGIN
  WITH warned AS (
    UPDATE public.listings
    SET draft_expiry_notified_at = now()
    WHERE status = 'draft'
      AND updated_at < now() - interval '83 days'
      AND draft_expiry_notified_at IS NULL
    RETURNING seller_id, title
  ), notices AS (
    INSERT INTO public.system_messages (recipient_id, body)
    SELECT seller_id,
      'Utkastet «' || left(title, 80) || '» slettes om 7 dager hvis du ikke åpner og lagrer det på nytt.'
    FROM warned
    RETURNING 1
  )
  SELECT count(*) INTO sell_warned FROM notices;

  DELETE FROM public.listings
  WHERE status = 'draft'
    AND updated_at < now() - interval '90 days'
    AND draft_expiry_notified_at <= now() - interval '7 days';
  GET DIAGNOSTICS sell_deleted = ROW_COUNT;

  DELETE FROM public.error_log WHERE created_at < now() - interval '90 days';
  DELETE FROM public.admin_moderation_log WHERE created_at < now() - interval '3 years';
  DELETE FROM public.reports WHERE resolved_at < now() - interval '3 years';
  DELETE FROM public.system_messages
    WHERE (read_at IS NOT NULL AND created_at < now() - interval '1 year')
       OR created_at < now() - interval '2 years';

  RETURN jsonb_build_object('sell_drafts_warned', sell_warned, 'sell_drafts_deleted', sell_deleted);
END;
$$;


ALTER FUNCTION "public"."purge_expired_personal_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_listing_status_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.listing_status_history (listing_id, status, changed_at)
    VALUES (NEW.id, NEW.status, COALESCE(NEW.published_at, NEW.created_at));
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.listing_status_history (listing_id, status, changed_at)
    VALUES (NEW.id, NEW.status, now());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_listing_status_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_listing_search_vector_after_category_move"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  WITH RECURSIVE descendants AS (
    SELECT NEW.id AS id
    UNION ALL
    SELECT c.id FROM public.categories c JOIN descendants d ON c.parent_id = d.id
  )
  UPDATE public.listings
  SET search_vector = search_vector
  WHERE category_id IN (SELECT id FROM descendants);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."refresh_listing_search_vector_after_category_move"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_listing_search_vector_after_filter_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE'
    AND (OLD.category_id IS DISTINCT FROM NEW.category_id OR OLD.key IS DISTINCT FROM NEW.key)
  ) THEN
    WITH RECURSIVE descendants AS (
      SELECT id FROM public.categories WHERE id = OLD.category_id
      UNION ALL
      SELECT c.id FROM public.categories c JOIN descendants d ON c.parent_id = d.id
    )
    UPDATE public.listings
    SET search_vector = search_vector
    WHERE attributes ? OLD.key
      AND category_id IN (SELECT id FROM descendants);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    WITH RECURSIVE descendants AS (
      SELECT id FROM public.categories WHERE id = NEW.category_id
      UNION ALL
      SELECT c.id FROM public.categories c JOIN descendants d ON c.parent_id = d.id
    )
    UPDATE public.listings
    SET search_vector = search_vector
    WHERE attributes ? NEW.key
      AND category_id IN (SELECT id FROM descendants);
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."refresh_listing_search_vector_after_filter_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_standard_upload_object"("_bucket" "text", "_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.standard_upload_objects (bucket, object_key)
  VALUES (_bucket, _key)
  ON CONFLICT (bucket, object_key) DO UPDATE
    SET created_at = clock_timestamp()
    WHERE standard_upload_objects.state = 'ready';
  IF NOT FOUND THEN RAISE EXCEPTION 'R2-objektet er under opprydding'; END IF;
END;
$$;


ALTER FUNCTION "public"."register_standard_upload_object"("_bucket" "text", "_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_account_deletion"("_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _actual_email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _actual_email FROM auth.users WHERE id = _uid;
  IF _actual_email IS NULL OR lower(_actual_email) <> lower(trim(_email)) THEN
    RAISE EXCEPTION 'E-postadressen stemmer ikke';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text, 0));
  INSERT INTO public.account_deletions (user_id, confirmation_email, listing_states)
  VALUES (
    _uid, _actual_email,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'status', status, 'sold_at', sold_at)) FROM public.listings WHERE seller_id = _uid), '[]'::jsonb)
  )
  -- A repeated request keeps the original snapshot and only adds rows created since then.
  ON CONFLICT (user_id) DO UPDATE
    SET requested_at = now(), scheduled_purge_at = now() + interval '7 days', confirmation_email = EXCLUDED.confirmation_email,
      listing_states = account_deletions.listing_states || COALESCE((
        SELECT jsonb_agg(n.value) FROM jsonb_array_elements(EXCLUDED.listing_states) n(value)
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(account_deletions.listing_states) o(value) WHERE o.value->>'id' = n.value->>'id')
      ), '[]'::jsonb);

  -- Administrator blocks (disabled) stay untouched so cancellation can never lift them.
  UPDATE public.listings
  SET status = 'archived'
  WHERE seller_id = _uid AND status NOT IN ('archived', 'disabled');
END;
$$;


ALTER FUNCTION "public"."request_account_deletion"("_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_standard_upload_quota"("_user_id" "uuid", "_bytes" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  reserved boolean;
BEGIN
  IF _user_id IS NULL OR _bytes IS NULL OR _bytes < 1 OR _bytes > 5242880 THEN
    RETURN false;
  END IF;

  INSERT INTO public.standard_upload_quotas AS quota
    (user_id, window_started_at, object_count, total_bytes)
  VALUES (_user_id, now(), 1, _bytes)
  ON CONFLICT (user_id) DO UPDATE SET
    window_started_at = CASE
      WHEN quota.window_started_at <= now() - interval '24 hours' THEN now()
      ELSE quota.window_started_at
    END,
    object_count = CASE
      WHEN quota.window_started_at <= now() - interval '24 hours' THEN 1
      ELSE quota.object_count + 1
    END,
    total_bytes = CASE
      WHEN quota.window_started_at <= now() - interval '24 hours' THEN _bytes
      ELSE quota.total_bytes + _bytes
    END
  WHERE quota.window_started_at <= now() - interval '24 hours'
     OR (quota.object_count < 400 AND quota.total_bytes + _bytes <= 419430400)
  RETURNING true INTO reserved;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."reserve_standard_upload_quota"("_user_id" "uuid", "_bytes" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_listings_page"("_include_groups" "jsonb" DEFAULT '[]'::"jsonb", "_exclude_any_terms" "text"[] DEFAULT NULL::"text"[], "_exclude_all_groups" "jsonb" DEFAULT '[]'::"jsonb", "_category_ids" "uuid"[] DEFAULT NULL::"uuid"[], "_conditions" "public"."listing_condition"[] DEFAULT NULL::"public"."listing_condition"[], "_include_free" boolean DEFAULT true, "_min_price" integer DEFAULT NULL::integer, "_max_price" integer DEFAULT NULL::integer, "_attribute_filters" "jsonb" DEFAULT '{}'::"jsonb", "_center_lat" double precision DEFAULT NULL::double precision, "_center_lng" double precision DEFAULT NULL::double precision, "_radius_km" double precision DEFAULT 10, "_sort" "text" DEFAULT 'new'::"text", "_limit" integer DEFAULT 20, "_offset" integer DEFAULT 0, "_include_recently_sold" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "kaupet_code" character, "title" "text", "subtitle" "text", "price_nok" integer, "is_free" boolean, "city" "text", "display_lat" double precision, "display_lng" double precision, "created_at" timestamp with time zone, "attributes" "jsonb", "category_slug" "text", "cover_path" "text", "relevance" real, "total_count" bigint, "sold_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
BEGIN
  -- Funksjonen er anonymt kallbar og hvert ord prøves mot hver aktiv annonse,
  -- så antall ikke-blanke ord (inkludering og ekskludering samlet) begrenses.
  IF (
    SELECT count(*) FROM (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(_include_groups, '[]'::jsonb)) AS g(value)
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(g.value->'terms', '[]'::jsonb)) AS t(term)
      WHERE btrim(t.term) <> ''
      UNION ALL
      SELECT 1 FROM unnest(_exclude_any_terms) AS x(term) WHERE btrim(x.term) <> ''
      UNION ALL
      SELECT 1
      FROM jsonb_array_elements(COALESCE(_exclude_all_groups, '[]'::jsonb)) AS g(value)
      CROSS JOIN LATERAL jsonb_array_elements_text(g.value) AS t(term)
      WHERE btrim(t.term) <> ''
    ) AS all_terms
  ) > 20 THEN
    RAISE EXCEPTION 'For mange søkeord (maks 20)' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH raw_terms AS (
    -- Ikke-blanke ord. kind: inc = inkluderingsgruppe (mode all/any),
    -- exa = ekskluder ved ett treff, exg = ekskluder bare ved treff på hele
    -- gruppen. Grupper uten ord får ingen rader og ignoreres dermed.
    SELECT 'inc'::text AS kind, g.ord AS grp, g.value->>'mode' AS mode, btrim(t.term) AS term
    FROM jsonb_array_elements(COALESCE(_include_groups, '[]'::jsonb)) WITH ORDINALITY AS g(value, ord)
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(g.value->'terms', '[]'::jsonb)) AS t(term)
    UNION ALL
    SELECT 'exa', 0, NULL, btrim(x.term) FROM unnest(_exclude_any_terms) AS x(term)
    UNION ALL
    SELECT 'exg', g.ord, NULL, btrim(t.term)
    FROM jsonb_array_elements(COALESCE(_exclude_all_groups, '[]'::jsonb)) WITH ORDINALITY AS g(value, ord)
    CROSS JOIN LATERAL jsonb_array_elements_text(g.value) AS t(term)
  ), terms AS (
    SELECT kind, grp, mode, term,
      websearch_to_tsquery('norwegian', term) AS tsq,
      '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pattern
    FROM raw_terms
    WHERE term <> ''
  ), rank_query AS (
    SELECT websearch_to_tsquery('norwegian', string_agg(DISTINCT term, ' or ')) AS q
    FROM terms WHERE kind = 'inc'
  ), matching AS (
    SELECT
      l.id, l.kaupet_code, l.title, l.subtitle, l.price_nok, l.is_free, l.city,
      l.display_lat, l.display_lng, l.created_at, l.attributes, l.sold_at,
      c.slug AS category_slug,
      COALESCE(ts_rank(l.search_vector, (SELECT q FROM rank_query)), 0)::real AS relevance
    FROM public.listings l
    LEFT JOIN public.categories c ON c.id = l.category_id
    WHERE (
      l.status = 'active'
      OR (
        _include_recently_sold
        AND l.status = 'sold'
        AND l.sold_at > now() - interval '2 days'
      )
    )
      -- Hver inkluderingsgruppe må oppfylles: «all» krever alle ordene,
      -- ellers holder ett.
      AND (
        NOT EXISTS (SELECT 1 FROM terms WHERE kind = 'inc')
        OR NOT EXISTS (
          SELECT 1
          FROM (SELECT DISTINCT grp, mode FROM terms WHERE kind = 'inc') AS gr
          WHERE NOT CASE WHEN gr.mode = 'all' THEN
            NOT EXISTS (
              SELECT 1 FROM terms t
              WHERE t.kind = 'inc' AND t.grp = gr.grp
                AND NOT (l.search_vector @@ t.tsq OR l.title ILIKE t.pattern)
            )
          ELSE
            EXISTS (
              SELECT 1 FROM terms t
              WHERE t.kind = 'inc' AND t.grp = gr.grp
                AND (l.search_vector @@ t.tsq OR l.title ILIKE t.pattern)
            )
          END
        )
      )
      -- Ett treff på et av ekskluderingsordene skjuler annonsen.
      AND (
        NOT EXISTS (SELECT 1 FROM terms WHERE kind = 'exa')
        OR NOT EXISTS (
          SELECT 1 FROM terms t
          WHERE t.kind = 'exa' AND (l.search_vector @@ t.tsq OR l.title ILIKE t.pattern)
        )
      )
      -- En ekskluderingsgruppe skjuler bare annonser som treffer alle ordene.
      AND (
        NOT EXISTS (SELECT 1 FROM terms WHERE kind = 'exg')
        OR NOT EXISTS (
          SELECT 1
          FROM (SELECT DISTINCT grp FROM terms WHERE kind = 'exg') AS gr
          WHERE NOT EXISTS (
            SELECT 1 FROM terms t
            WHERE t.kind = 'exg' AND t.grp = gr.grp
              AND NOT (l.search_vector @@ t.tsq OR l.title ILIKE t.pattern)
          )
        )
      )
      AND (_category_ids IS NULL OR l.category_id = ANY(_category_ids))
      AND (_conditions IS NULL OR l.condition = ANY(_conditions))
      AND (_include_free OR NOT l.is_free)
      AND (_min_price IS NULL OR (_include_free AND l.is_free) OR l.price_nok >= _min_price)
      AND (_max_price IS NULL OR (_include_free AND l.is_free) OR l.price_nok <= _max_price)
      -- Funksjonskallet er dyrt per rad (SET search_path); hopp over det uten filter.
      AND (
        _attribute_filters IS NULL
        OR _attribute_filters = '{}'::jsonb
        OR public.listing_matches_attribute_filters(l.attributes, _attribute_filters)
      )
      -- Radius (1-100 km) fra senterpunktet, målt mot det avrundede
      -- visningspunktet. Annonser uten visningspunkt faller bort.
      AND (
        _center_lat IS NULL
        OR _center_lng IS NULL
        OR (
          l.display_lat IS NOT NULL
          AND l.display_lng IS NOT NULL
          AND 6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(_center_lat)) * cos(radians(l.display_lat)) *
              cos(radians(l.display_lng) - radians(_center_lng)) +
              sin(radians(_center_lat)) * sin(radians(l.display_lat))
            ))
          ) <= LEAST(GREATEST(COALESCE(_radius_km, 10), 1), 100)
        )
      )
  ), counted AS (
    SELECT matching.*, count(*) OVER () AS total_count FROM matching
  )
  SELECT
    counted.id, counted.kaupet_code, counted.title, counted.subtitle, counted.price_nok,
    counted.is_free, counted.city, counted.display_lat, counted.display_lng, counted.created_at,
    counted.attributes, counted.category_slug,
    (
      SELECT image.storage_path FROM public.listing_images image
      WHERE image.listing_id = counted.id ORDER BY image.sort_order LIMIT 1
    ) AS cover_path,
    counted.relevance, counted.total_count, counted.sold_at
  FROM counted
  -- created_at og id som siste ledd gir samme rekkefølge mellom sidene når
  -- sorteringsverdiene er like (uendret datasett). Ukjent _sort gir «new».
  ORDER BY
    CASE WHEN _sort = 'relevance' THEN counted.relevance END DESC NULLS LAST,
    CASE WHEN _sort = 'price_asc' THEN counted.price_nok END ASC NULLS LAST,
    CASE WHEN _sort = 'price_desc' THEN counted.price_nok END DESC NULLS LAST,
    counted.created_at DESC,
    counted.id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END
$$;


ALTER FUNCTION "public"."search_listings_page"("_include_groups" "jsonb", "_exclude_any_terms" "text"[], "_exclude_all_groups" "jsonb", "_category_ids" "uuid"[], "_conditions" "public"."listing_condition"[], "_include_free" boolean, "_min_price" integer, "_max_price" integer, "_attribute_filters" "jsonb", "_center_lat" double precision, "_center_lng" double precision, "_radius_km" double precision, "_sort" "text", "_limit" integer, "_offset" integer, "_include_recently_sold" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "attachment_path" "text",
    "client_id" "uuid",
    CONSTRAINT "messages_body_length" CHECK (("length"("body") <= 4000))
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_message_rate_limited"("_conversation_id" "uuid", "_sender_id" "uuid", "_body" "text", "_attachment_path" "text", "_client_id" "uuid") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  inserted_message public.messages;
  recent_count integer;
  other_party_id uuid;
BEGIN
  IF _sender_id IS NULL OR _client_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  IF length(_body) > 4000 OR (btrim(_body) = '' AND _attachment_path IS NULL) THEN
    RAISE EXCEPTION 'invalid_message';
  END IF;

  SELECT * INTO inserted_message
  FROM public.messages
  WHERE sender_id = _sender_id AND client_id = _client_id;
  IF FOUND THEN
    RETURN inserted_message;
  END IF;

  SELECT CASE WHEN c.buyer_id = _sender_id THEN c.seller_id ELSE c.buyer_id END
    INTO other_party_id
  FROM public.conversations c
  WHERE c.id = _conversation_id
    AND (c.buyer_id = _sender_id OR c.seller_id = _sender_id);

  IF other_party_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF public.is_blocked_between(_sender_id, other_party_id, _conversation_id) THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = 'check_violation';
  END IF;

  IF _attachment_path IS NOT NULL THEN
    IF split_part(_attachment_path, '/', 1) <> _conversation_id::text
       OR _attachment_path !~* (
         '^' || _conversation_id::text ||
         '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$'
       )
    THEN
      RAISE EXCEPTION 'invalid_attachment';
    END IF;
  END IF;

  -- Serialize sends from one account so concurrent requests cannot race past
  -- the two count checks.
  PERFORM pg_advisory_xact_lock(hashtextextended(_sender_id::text, 0));

  SELECT * INTO inserted_message
  FROM public.messages
  WHERE sender_id = _sender_id AND client_id = _client_id;
  IF FOUND THEN
    RETURN inserted_message;
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.messages
  WHERE sender_id = _sender_id
    AND created_at >= now() - interval '10 seconds';
  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.messages
  WHERE sender_id = _sender_id
    AND created_at >= now() - interval '1 hour';
  IF recent_count >= 100 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.messages (
    conversation_id,
    sender_id,
    body,
    attachment_path,
    client_id
  ) VALUES (
    _conversation_id,
    _sender_id,
    btrim(_body),
    _attachment_path,
    _client_id
  )
  RETURNING * INTO inserted_message;

  RETURN inserted_message;
END;
$_$;


ALTER FUNCTION "public"."send_message_rate_limited"("_conversation_id" "uuid", "_sender_id" "uuid", "_body" "text", "_attachment_path" "text", "_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_message_reaction"("_message_id" "uuid", "_emoji" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _conversation_id uuid;
  _other uuid;
  _changes integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF public.is_user_banned(_uid) OR public.is_user_suspended(_uid) THEN
    RAISE EXCEPTION 'Du kan ikke reagere på meldinger så lenge kontoen er sperret eller svartelistet'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.id, CASE WHEN c.buyer_id = _uid THEN c.seller_id ELSE c.buyer_id END
    INTO _conversation_id, _other
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.id = _message_id
    AND m.deleted_at IS NULL
    AND (c.buyer_id = _uid OR c.seller_id = _uid);

  IF _conversation_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF public.is_blocked_between(_uid, _other, _conversation_id) THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.message_reaction_rate_limits AS r (user_id, window_start, changes)
  VALUES (_uid, now(), 1)
  ON CONFLICT (user_id) DO UPDATE SET
    window_start = CASE WHEN r.window_start <= now() - interval '1 minute'
      THEN now() ELSE r.window_start END,
    changes = CASE WHEN r.window_start <= now() - interval '1 minute'
      THEN 1 ELSE r.changes + 1 END
  RETURNING changes INTO _changes;
  IF _changes > 20 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.message_reactions (message_id, user_id, conversation_id, emoji)
  VALUES (_message_id, _uid, _conversation_id, _emoji)
  ON CONFLICT (message_id, user_id)
  DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();
END;
$$;


ALTER FUNCTION "public"."set_message_reaction"("_message_id" "uuid", "_emoji" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."standard_upload_is_referenced"("_bucket" "text", "_key" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  SELECT CASE
    WHEN _bucket = 'BILDER' THEN
      EXISTS (
        SELECT 1 FROM public.listing_images
        WHERE listing_id = split_part(_key, '/', 1)::uuid AND storage_path = _key
      )
      OR EXISTS (
        SELECT 1 FROM public.listing_images
        WHERE listing_id = split_part(_key, '/', 1)::uuid
          AND storage_path = regexp_replace(_key, '-thumb(\.(jpg|png|webp|jxl))$', '\1')
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = split_part(_key, '/', 1)::uuid
          AND right(avatar_url, length(_key) + 1) = '/' || _key
      )
    WHEN _bucket = 'VEDLEGG' THEN
      EXISTS (
        SELECT 1 FROM public.messages
        WHERE conversation_id = split_part(_key, '/', 1)::uuid AND attachment_path = _key
      )
    ELSE false
  END
$_$;


ALTER FUNCTION "public"."standard_upload_is_referenced"("_bucket" "text", "_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_listing_report"("_listing_id" "uuid", "_reason" "text", "_comment" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.check_user_rate_limit('report_submission', auth.uid(), 8, 3600) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  INSERT INTO public.reports(listing_id, reporter_id, reason, comment)
  VALUES (_listing_id, auth.uid(), _reason, _comment);
END $$;


ALTER FUNCTION "public"."submit_listing_report"("_listing_id" "uuid", "_reason" "text", "_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_user_report"("_reported_user_id" "uuid", "_reason" "text", "_comment" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() = _reported_user_id THEN RAISE EXCEPTION 'Cannot report yourself'; END IF;
  IF NOT public.check_user_rate_limit('report_submission', auth.uid(), 8, 3600) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  INSERT INTO public.reports(reporter_id, reported_user_id, reason, comment)
  VALUES (auth.uid(), _reported_user_id, _reason, _comment);
END $$;


ALTER FUNCTION "public"."submit_user_report"("_reported_user_id" "uuid", "_reason" "text", "_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_draft_listing_images"("_listing_id" "uuid", "_user_id" "uuid", "_images" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _current public.listings%ROWTYPE;
BEGIN
  _current := public.lock_listing_draft_for_user(_listing_id, _user_id);
  -- Publisert i mellomtiden (og ev. solgt, arkivert osv. etterpå): publiseringen
  -- eier bildene nå, så en sen autolagring er en stille no-op.
  IF _current.status <> 'draft' THEN
    RETURN jsonb_build_object('already_published', true);
  END IF;
  PERFORM public.sync_listing_images(_listing_id, _images);
  RETURN jsonb_build_object('already_published', false);
END;
$$;


ALTER FUNCTION "public"."sync_draft_listing_images"("_listing_id" "uuid", "_user_id" "uuid", "_images" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_listing_images"("_listing_id" "uuid", "_images" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server access required' USING ERRCODE = '42501';
  END IF;
  IF _images IS NULL OR jsonb_typeof(_images) <> 'array' OR jsonb_array_length(_images) > 100 THEN
    RAISE EXCEPTION 'Ugyldig bildeliste';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(_images) AS i(id uuid, storage_path text, sort_order integer)
    WHERE i.id IS NULL OR i.storage_path IS NULL OR i.sort_order IS NULL OR i.sort_order NOT BETWEEN 0 AND 99)
    OR (SELECT count(*) <> count(DISTINCT id) FROM jsonb_to_recordset(_images) AS i(id uuid)) THEN
    RAISE EXCEPTION 'Ugyldig bildeliste';
  END IF;
  IF EXISTS (SELECT 1 FROM public.listing_images old
    JOIN jsonb_to_recordset(_images) AS i(id uuid, storage_path text) ON old.id = i.id
    WHERE old.listing_id <> _listing_id OR old.storage_path <> i.storage_path) THEN
    RAISE EXCEPTION 'Ugyldig bildereferanse';
  END IF;

  DELETE FROM public.listing_images old WHERE old.listing_id = _listing_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(_images) AS i(id uuid) WHERE i.id = old.id);
  UPDATE public.listing_images old SET sort_order = i.sort_order, caption = i.caption
    FROM jsonb_to_recordset(_images) AS i(id uuid, sort_order integer, caption text)
    WHERE old.listing_id = _listing_id AND old.id = i.id;
  -- INSERT triggers enforce paths, upload cleanup locks and the 100-image limit.
  -- Existing rows use UPDATE so a retry at that limit never runs INSERT triggers.
  INSERT INTO public.listing_images (id, listing_id, storage_path, sort_order, caption, ai_generated)
    SELECT i.id, _listing_id, i.storage_path, i.sort_order, i.caption, coalesce(i.ai_generated, false)
    FROM jsonb_to_recordset(_images)
      AS i(id uuid, storage_path text, sort_order integer, caption text, ai_generated boolean)
    WHERE NOT EXISTS (SELECT 1 FROM public.listing_images old WHERE old.id = i.id);
  -- Unreferenced files remain in standard_upload_objects for the guarded cleanup job.
END;
$$;


ALTER FUNCTION "public"."sync_listing_images"("_listing_id" "uuid", "_images" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_listing_images"("_listing_id" "uuid", "_images" "jsonb") IS 'Intern hjelper: forutsetter at kalleren har låst annonsen med lock_listing_draft_for_user og sjekket status. Kall sync_draft_listing_images eller publish_listing_draft i stedet.';



CREATE OR REPLACE FUNCTION "public"."validate_listing_attribute_formats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  _extra_dates jsonb := COALESCE(TG_ARGV[0], '{}')::jsonb;
  _fresh boolean := TG_OP = 'INSERT' OR OLD.status = 'draft';
  _rule record;
  _value jsonb;
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  FOR _rule IN
    SELECT n.key, n.type, n.label_nb
    FROM listing_attribute_format_rules(NEW.category_id, _extra_dates) n
    WHERE n.type IN ('number', 'range', 'date')
      AND (
        _fresh
        OR NEW.attributes -> n.key IS DISTINCT FROM OLD.attributes -> n.key
        OR (
          NEW.category_id IS DISTINCT FROM OLD.category_id
          AND n.type IS DISTINCT FROM (
            SELECT o.type FROM listing_attribute_format_rules(OLD.category_id, _extra_dates) o
            WHERE o.key = n.key
          )
        )
      )
    -- Samme rekkefølge som serveren: tallfeil meldes før datofeil.
    ORDER BY n.type = 'date', n.key
  LOOP
    _value := NEW.attributes -> _rule.key;
    CONTINUE WHEN _value IS NULL OR _value = 'null'::jsonb;
    IF _rule.type = 'date' THEN
      CONTINUE WHEN _value = '""'::jsonb;
      IF jsonb_typeof(_value) <> 'string'
        OR (_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'
        OR NOT pg_input_is_valid(_value #>> '{}', 'date') THEN
        RAISE EXCEPTION '% må være en gyldig dato.', _rule.label_nb
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF jsonb_typeof(_value) <> 'number' THEN
      RAISE EXCEPTION '% må være et tall.', _rule.label_nb
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."validate_listing_attribute_formats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_listing_image_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  image_count integer;
BEGIN
  IF NEW.storage_path !~* (
       '^' || NEW.listing_id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$'
     )
  THEN
    RAISE EXCEPTION 'invalid_listing_image';
  END IF;

  IF auth.role() <> 'service_role' AND NOT EXISTS (
       SELECT 1
       FROM public.listings l
       WHERE l.id = NEW.listing_id
         AND l.seller_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'invalid_listing_image';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.listing_id::text, 1));
    SELECT count(*) INTO image_count
    FROM public.listing_images
    WHERE listing_id = NEW.listing_id;
    IF image_count >= 100 THEN
      RAISE EXCEPTION 'listing_image_limit';
    END IF;
  END IF;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."validate_listing_image_reference"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_deletions" (
    "user_id" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_purge_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "confirmation_email" "text" NOT NULL,
    "listing_states" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."account_deletions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_moderation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_moderation_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name_nb" "text" NOT NULL,
    "parent_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "icon" "text",
    "color" "text",
    "heading_font" "text",
    "search_examples" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title_example" "text",
    "search_synonyms" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


COMMENT ON COLUMN "public"."categories"."search_synonyms" IS 'Alternative søkeord for kategorivelgeren (aldri vist i UI). Vedlikeholdes i /admin/kategorier.';



CREATE TABLE IF NOT EXISTS "public"."category_filters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label_nb" "text" NOT NULL,
    "type" "text" NOT NULL,
    "unit" "text",
    "options" "jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_primary" boolean DEFAULT true NOT NULL,
    "depends_on_key" "text",
    "depends_on_value" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "depends_on_not_value" "text",
    "is_optional" boolean DEFAULT false NOT NULL,
    CONSTRAINT "category_filters_type_check" CHECK (("type" = ANY (ARRAY['select'::"text", 'multiselect'::"text", 'number'::"text", 'range'::"text", 'boolean'::"text", 'text'::"text", 'parent_select'::"text", 'child_select'::"text", 'date'::"text"])))
);


ALTER TABLE "public"."category_filters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_flows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "field_groups" "text"[] DEFAULT '{title-photos,category-attributes,condition,price,description-keywords,delivery-location,review-publish}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "category_flows_field_groups_required" CHECK (("field_groups" @> ARRAY['photos'::"text", 'title'::"text", 'category-attributes'::"text", 'description-keywords'::"text", 'review-publish'::"text"]))
);


ALTER TABLE "public"."category_flows" OWNER TO "postgres";


COMMENT ON CONSTRAINT "category_flows_field_groups_required" ON "public"."category_flows" IS 'Feltgruppene enhver flyt må inneholde. Kun atomiske nøkler — de sammensatte (title-photos, delivery-location) ble skrevet om i 20260909140000.';



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid",
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "buyer_last_read_at" timestamp with time zone,
    "seller_last_read_at" timestamp with time zone,
    "buyer_deleted_at" timestamp with time zone,
    "seller_deleted_at" timestamp with time zone,
    CONSTRAINT "conversations_has_listing" CHECK (("listing_id" IS NOT NULL))
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."conversations"."buyer_deleted_at" IS 'When the buyer moved the conversation to trash. Restorable for 14 days; retained afterwards because the seller still owns the shared conversation.';



COMMENT ON COLUMN "public"."conversations"."seller_deleted_at" IS 'When the seller moved the conversation to trash. Restorable for 14 days; retained afterwards because the buyer still owns the shared conversation.';



CREATE TABLE IF NOT EXISTS "public"."endpoint_rate_limits" (
    "bucket" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "endpoint_rate_limits_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "endpoint_rate_limits_bucket_check" CHECK ((("length"("bucket") >= 1) AND ("length"("bucket") <= 64))),
    CONSTRAINT "endpoint_rate_limits_key_hash_check" CHECK (("length"("key_hash") = 64))
);


ALTER TABLE "public"."endpoint_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."error_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "function_name" "text" NOT NULL,
    "error_message" "text" NOT NULL,
    "error_code" "text",
    "context" "jsonb",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."error_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ip_bans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ip_address" "inet" NOT NULL,
    "reason" "text" NOT NULL,
    "banned_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."ip_bans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "caption" "text",
    "source_url" "text",
    "ai_generated" boolean DEFAULT false NOT NULL,
    CONSTRAINT "listing_images_caption_length" CHECK ((("caption" IS NULL) OR ("length"("caption") <= 140)))
);


ALTER TABLE "public"."listing_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "status" "public"."listing_status" NOT NULL,
    "changed_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."listing_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reaction_rate_limits" (
    "user_id" "uuid" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "changes" integer NOT NULL
);


ALTER TABLE "public"."message_reaction_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "emoji" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_reactions_emoji_check" CHECK (("emoji" = ANY (ARRAY['👍'::"text", '❤️'::"text", '😂'::"text", '😮'::"text", '😢'::"text", '🙏'::"text"])))
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "profiles_display_name_length" CHECK (("length"("display_name") <= 80))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."r2_delete_queue" (
    "id" bigint NOT NULL,
    "bucket" "text" NOT NULL,
    "prefix" "text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    CONSTRAINT "r2_delete_queue_bucket_check" CHECK (("bucket" = ANY (ARRAY['BILDER'::"text", 'VEDLEGG'::"text"]))),
    CONSTRAINT "r2_delete_queue_prefix_check" CHECK (("prefix" <> ''::"text"))
);


ALTER TABLE "public"."r2_delete_queue" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."r2_delete_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."r2_delete_queue_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."r2_delete_queue_id_seq" OWNED BY "public"."r2_delete_queue"."id";



CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid",
    "reporter_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "comment" "text",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "reported_user_id" "uuid",
    CONSTRAINT "reports_target_check" CHECK ((("listing_id" IS NOT NULL) OR ("reported_user_id" IS NOT NULL)))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "default_search_examples" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "site_settings_singleton" CHECK ("id")
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."standard_upload_objects" (
    "id" bigint NOT NULL,
    "bucket" "text" NOT NULL,
    "object_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "state" "text" DEFAULT 'ready'::"text" NOT NULL,
    "claimed_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    CONSTRAINT "standard_upload_objects_bucket_check" CHECK (("bucket" = ANY (ARRAY['BILDER'::"text", 'VEDLEGG'::"text"]))),
    CONSTRAINT "standard_upload_objects_check" CHECK (((("bucket" = 'BILDER'::"text") AND ("object_key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-thumb)?|avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(logo|contact)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|jxl)$'::"text")) OR (("bucket" = 'VEDLEGG'::"text") AND ("object_key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$'::"text")))),
    CONSTRAINT "standard_upload_objects_state_check" CHECK (("state" = ANY (ARRAY['ready'::"text", 'deleting'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."standard_upload_objects" OWNER TO "postgres";


COMMENT ON TABLE "public"."standard_upload_objects" IS 'Eksaktregister og 7-dagers tombstones for standard R2-opplastinger; attempts >= 10 beholdes som oppryddingsavvik og kan inspiseres her.';



ALTER TABLE "public"."standard_upload_objects" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."standard_upload_objects_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."standard_upload_quotas" (
    "user_id" "uuid" NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "object_count" integer DEFAULT 0 NOT NULL,
    "total_bytes" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "standard_upload_quotas_object_count_check" CHECK (("object_count" >= 0)),
    CONSTRAINT "standard_upload_quotas_total_bytes_check" CHECK (("total_bytes" >= 0))
);


ALTER TABLE "public"."standard_upload_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."system_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_bans" (
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "banned_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_bans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "scope" "public"."block_scope" NOT NULL,
    "conversation_id" "uuid",
    "listing_id" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_blocks_check" CHECK (("blocker_id" <> "blocked_id")),
    CONSTRAINT "user_blocks_check1" CHECK (((("scope" = 'all'::"public"."block_scope") AND ("conversation_id" IS NULL)) OR (("scope" = 'conversation'::"public"."block_scope") AND ("conversation_id" IS NOT NULL))))
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_suspensions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "suspended_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."user_suspensions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."r2_delete_queue" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."r2_delete_queue_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."account_deletions"
    ADD CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."admin_moderation_log"
    ADD CONSTRAINT "admin_moderation_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."category_filters"
    ADD CONSTRAINT "category_filters_category_id_key_key" UNIQUE ("category_id", "key");



ALTER TABLE ONLY "public"."category_filters"
    ADD CONSTRAINT "category_filters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_flows"
    ADD CONSTRAINT "category_flows_category_id_key" UNIQUE ("category_id");



ALTER TABLE ONLY "public"."category_flows"
    ADD CONSTRAINT "category_flows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_listing_id_buyer_id_key" UNIQUE ("listing_id", "buyer_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."endpoint_rate_limits"
    ADD CONSTRAINT "endpoint_rate_limits_pkey" PRIMARY KEY ("bucket", "key_hash");



ALTER TABLE ONLY "public"."error_log"
    ADD CONSTRAINT "error_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id", "listing_id");



ALTER TABLE ONLY "public"."ip_bans"
    ADD CONSTRAINT "ip_bans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_images"
    ADD CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_status_history"
    ADD CONSTRAINT "listing_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."listings"
    ADD CONSTRAINT "listings_description_max_length" CHECK (("char_length"("description") <= 4000)) NOT VALID;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_kaupet_code_unique" UNIQUE ("kaupet_code");



ALTER TABLE "public"."listings"
    ADD CONSTRAINT "listings_known_issues_max_length" CHECK ((("known_issues" IS NULL) OR ("char_length"("known_issues") <= 2000))) NOT VALID;



ALTER TABLE "public"."listings"
    ADD CONSTRAINT "listings_maintenance_history_max_length" CHECK ((("maintenance_history" IS NULL) OR ("char_length"("maintenance_history") <= 2000))) NOT VALID;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."listings"
    ADD CONSTRAINT "listings_price_nok_range" CHECK ((("price_nok" IS NULL) OR (("price_nok" >= 0) AND ("price_nok" <= 10000000)))) NOT VALID;



ALTER TABLE "public"."listings"
    ADD CONSTRAINT "listings_public_content_required" CHECK ((("status" <> ALL (ARRAY['active'::"public"."listing_status", 'sold'::"public"."listing_status"])) OR (((COALESCE("char_length"("btrim"("title", U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'::"text")), 0) >= 5) AND (COALESCE("char_length"("btrim"("title", U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'::"text")), 0) <= 120)) AND ((COALESCE("char_length"("btrim"("description", U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'::"text")), 0) >= 20) AND (COALESCE("char_length"("btrim"("description", U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'::"text")), 0) <= 4000))))) NOT VALID;



ALTER TABLE "public"."listings"
    ADD CONSTRAINT "listings_public_price_required" CHECK ((("status" <> ALL (ARRAY['active'::"public"."listing_status", 'sold'::"public"."listing_status"])) OR "is_free" OR ("price_nok" IS NOT NULL))) NOT VALID;



ALTER TABLE "public"."listings"
    ADD CONSTRAINT "listings_subtitle_max_length" CHECK ((("subtitle" IS NULL) OR ("char_length"("subtitle") <= 80))) NOT VALID;



ALTER TABLE "public"."listings"
    ADD CONSTRAINT "listings_title_max_length" CHECK (("char_length"("title") <= 120)) NOT VALID;



ALTER TABLE ONLY "public"."message_reaction_rate_limits"
    ADD CONSTRAINT "message_reaction_rate_limits_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_client_id_key" UNIQUE ("sender_id", "client_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."r2_delete_queue"
    ADD CONSTRAINT "r2_delete_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."standard_upload_objects"
    ADD CONSTRAINT "standard_upload_objects_bucket_object_key_key" UNIQUE ("bucket", "object_key");



ALTER TABLE ONLY "public"."standard_upload_objects"
    ADD CONSTRAINT "standard_upload_objects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."standard_upload_quotas"
    ADD CONSTRAINT "standard_upload_quotas_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."system_messages"
    ADD CONSTRAINT "system_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."user_suspensions"
    ADD CONSTRAINT "user_suspensions_pkey" PRIMARY KEY ("id");



CREATE INDEX "admin_moderation_log_created_idx" ON "public"."admin_moderation_log" USING "btree" ("created_at" DESC);



CREATE INDEX "category_filters_category_idx" ON "public"."category_filters" USING "btree" ("category_id", "sort_order");



CREATE INDEX "category_flows_category_idx" ON "public"."category_flows" USING "btree" ("category_id");



CREATE INDEX "conversations_buyer_idx" ON "public"."conversations" USING "btree" ("buyer_id", "last_message_at" DESC);



CREATE INDEX "conversations_buyer_trash_idx" ON "public"."conversations" USING "btree" ("buyer_id", "buyer_deleted_at" DESC) WHERE ("buyer_deleted_at" IS NOT NULL);



CREATE INDEX "conversations_seller_idx" ON "public"."conversations" USING "btree" ("seller_id", "last_message_at" DESC);



CREATE INDEX "conversations_seller_trash_idx" ON "public"."conversations" USING "btree" ("seller_id", "seller_deleted_at" DESC) WHERE ("seller_deleted_at" IS NOT NULL);



CREATE INDEX "endpoint_rate_limits_window_started_at_idx" ON "public"."endpoint_rate_limits" USING "btree" ("window_started_at");



CREATE INDEX "error_log_created_idx" ON "public"."error_log" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "ip_bans_ip_unique" ON "public"."ip_bans" USING "btree" ("ip_address");



CREATE INDEX "listing_images_listing_idx" ON "public"."listing_images" USING "btree" ("listing_id", "sort_order");



CREATE INDEX "listing_status_history_listing_changed_idx" ON "public"."listing_status_history" USING "btree" ("listing_id", "changed_at" DESC);



CREATE INDEX "listings_active_created_at_idx" ON "public"."listings" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "listings_active_lat_idx" ON "public"."listings" USING "btree" ("lat") WHERE (("status" = 'active'::"public"."listing_status") AND ("lat" IS NOT NULL));



CREATE INDEX "listings_attributes_idx" ON "public"."listings" USING "gin" ("attributes");



CREATE INDEX "listings_category_idx" ON "public"."listings" USING "btree" ("category_id");



CREATE INDEX "listings_seller_idx" ON "public"."listings" USING "btree" ("seller_id");



CREATE INDEX "listings_status_idx" ON "public"."listings" USING "btree" ("status", "published_at" DESC);



CREATE INDEX "message_reactions_conversation_idx" ON "public"."message_reactions" USING "btree" ("conversation_id");



CREATE INDEX "messages_conversation_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "messages_sender_created_at_idx" ON "public"."messages" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "r2_delete_queue_pending_idx" ON "public"."r2_delete_queue" USING "btree" ("requested_at");



CREATE INDEX "standard_upload_objects_cleanup_idx" ON "public"."standard_upload_objects" USING "btree" ("created_at", "id") WHERE ("state" = ANY (ARRAY['ready'::"text", 'deleting'::"text"]));



CREATE INDEX "standard_upload_objects_tombstone_idx" ON "public"."standard_upload_objects" USING "btree" ("claimed_at", "id") WHERE ("state" = ANY (ARRAY['deleting'::"text", 'deleted'::"text"]));



CREATE INDEX "system_messages_recipient_idx" ON "public"."system_messages" USING "btree" ("recipient_id", "created_at" DESC);



CREATE UNIQUE INDEX "user_blocks_all_unique" ON "public"."user_blocks" USING "btree" ("blocker_id", "blocked_id") WHERE ("scope" = 'all'::"public"."block_scope");



CREATE INDEX "user_blocks_blocked_idx" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE INDEX "user_blocks_blocker_idx" ON "public"."user_blocks" USING "btree" ("blocker_id");



CREATE UNIQUE INDEX "user_blocks_conv_unique" ON "public"."user_blocks" USING "btree" ("blocker_id", "conversation_id") WHERE ("scope" = 'conversation'::"public"."block_scope");



CREATE INDEX "user_suspensions_user_active_idx" ON "public"."user_suspensions" USING "btree" ("user_id", "expires_at");



CREATE OR REPLACE TRIGGER "account_deletions_enforce_last_admin" BEFORE INSERT ON "public"."account_deletions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_last_admin_account_deletion"();



CREATE OR REPLACE TRIGGER "app_settings_set_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "categories_refresh_listing_search_after_move" AFTER UPDATE OF "parent_id" ON "public"."categories" FOR EACH ROW WHEN (("old"."parent_id" IS DISTINCT FROM "new"."parent_id")) EXECUTE FUNCTION "public"."refresh_listing_search_vector_after_category_move"();



CREATE OR REPLACE TRIGGER "categories_set_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "category_filters_refresh_listing_search_delete" AFTER DELETE ON "public"."category_filters" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_listing_search_vector_after_filter_change"();



CREATE OR REPLACE TRIGGER "category_filters_refresh_listing_search_insert" AFTER INSERT ON "public"."category_filters" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_listing_search_vector_after_filter_change"();



CREATE OR REPLACE TRIGGER "category_filters_refresh_listing_search_update" AFTER UPDATE OF "category_id", "key", "options" ON "public"."category_filters" FOR EACH ROW WHEN ((("old"."category_id" IS DISTINCT FROM "new"."category_id") OR ("old"."key" IS DISTINCT FROM "new"."key") OR ("old"."options" IS DISTINCT FROM "new"."options"))) EXECUTE FUNCTION "public"."refresh_listing_search_vector_after_filter_change"();



CREATE OR REPLACE TRIGGER "category_filters_set_updated_at" BEFORE UPDATE ON "public"."category_filters" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "category_flows_set_updated_at" BEFORE UPDATE ON "public"."category_flows" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "conversations_enforce_block_trigger" BEFORE INSERT ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."conversations_enforce_block"();



CREATE OR REPLACE TRIGGER "conversations_enforce_moderation_trg" BEFORE INSERT ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."conversations_enforce_moderation"();



CREATE OR REPLACE TRIGGER "conversations_enforce_read_status_only" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_conversation_read_status_only"();



CREATE OR REPLACE TRIGGER "enqueue_r2_delete_after_conversation_delete" AFTER DELETE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_r2_delete"('VEDLEGG');



CREATE OR REPLACE TRIGGER "enqueue_r2_delete_after_listing_delete" AFTER DELETE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_r2_delete"('BILDER');



CREATE OR REPLACE TRIGGER "enqueue_r2_delete_after_profile_purge" AFTER UPDATE OF "deleted_at" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_r2_delete_for_purged_profile"();



CREATE OR REPLACE TRIGGER "listing_images_guard_standard_upload" BEFORE INSERT OR UPDATE OF "storage_path" ON "public"."listing_images" FOR EACH ROW EXECUTE FUNCTION "public"."guard_standard_upload_reference"();



CREATE OR REPLACE TRIGGER "listing_images_validate_reference" BEFORE INSERT OR UPDATE OF "listing_id", "storage_path" ON "public"."listing_images" FOR EACH ROW EXECUTE FUNCTION "public"."validate_listing_image_reference"();



CREATE OR REPLACE TRIGGER "listings_enforce_moderation_on_publish_trg" BEFORE UPDATE OF "status" ON "public"."listings" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") AND ("new"."status" = 'active'::"public"."listing_status"))) EXECUTE FUNCTION "public"."listings_enforce_moderation"();



CREATE OR REPLACE TRIGGER "listings_enforce_moderation_trg" BEFORE INSERT ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."listings_enforce_moderation"();



CREATE OR REPLACE TRIGGER "listings_fuzz_location" BEFORE INSERT OR UPDATE OF "lat", "lng" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."fuzz_listing_location"();



CREATE OR REPLACE TRIGGER "listings_prevent_ownership_change" BEFORE UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_listing_ownership_change"();



CREATE OR REPLACE TRIGGER "listings_record_status_history" AFTER INSERT OR UPDATE OF "status" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."record_listing_status_history"();



CREATE OR REPLACE TRIGGER "listings_search_vector_update" BEFORE INSERT OR UPDATE OF "title", "description", "city", "category_id", "attributes", "search_vector" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."listings_search_vector_trigger"();



CREATE OR REPLACE TRIGGER "listings_set_expiry_trigger" BEFORE INSERT OR UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."listings_set_expiry"();



CREATE OR REPLACE TRIGGER "listings_set_sold_at_trg" BEFORE INSERT OR UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."listings_set_sold_at"();



CREATE OR REPLACE TRIGGER "listings_set_updated_at" BEFORE UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "listings_validate_attribute_formats" BEFORE INSERT OR UPDATE OF "attributes", "category_id", "status" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_listing_attribute_formats"();



CREATE OR REPLACE TRIGGER "messages_bump_conversation_last_message_at_trg" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_bump_conversation_last_message_at"();



CREATE OR REPLACE TRIGGER "messages_enforce_block_trigger" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_enforce_block"();



CREATE OR REPLACE TRIGGER "messages_enforce_moderation_trg" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."messages_enforce_moderation"();



CREATE OR REPLACE TRIGGER "messages_enforce_soft_delete_only" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_message_soft_delete_only"();



CREATE OR REPLACE TRIGGER "messages_guard_standard_upload" BEFORE INSERT OR UPDATE OF "attachment_path" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."guard_standard_upload_reference"();



CREATE OR REPLACE TRIGGER "profiles_guard_standard_upload" BEFORE INSERT OR UPDATE OF "avatar_url" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_standard_upload_reference"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_roles_enforce_last_admin" BEFORE DELETE OR UPDATE OF "role", "user_id" ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_last_admin"();



CREATE OR REPLACE TRIGGER "zzz_listings_preserve_search_refresh_updated_at" BEFORE UPDATE OF "search_vector" ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."preserve_listing_updated_at_on_search_refresh"();



ALTER TABLE ONLY "public"."account_deletions"
    ADD CONSTRAINT "account_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."category_filters"
    ADD CONSTRAINT "category_filters_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_flows"
    ADD CONSTRAINT "category_flows_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_images"
    ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_status_history"
    ADD CONSTRAINT "listing_status_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."standard_upload_quotas"
    ADD CONSTRAINT "standard_upload_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_messages"
    ADD CONSTRAINT "system_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Active listings are viewable by everyone" ON "public"."listings" FOR SELECT USING (("public"."listing_is_public"("status", "sold_at") OR ("auth"."uid"() = "seller_id")));



CREATE POLICY "Admins and moderators can insert system messages" ON "public"."system_messages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role")::"text" = ANY (ARRAY['admin'::"text", 'moderator'::"text"]))))));



CREATE POLICY "Admins and moderators can update reports" ON "public"."reports" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role")::"text" = ANY (ARRAY['admin'::"text", 'moderator'::"text"]))))));



CREATE POLICY "Admins and moderators can view reports" ON "public"."reports" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role")::"text" = ANY (ARRAY['admin'::"text", 'moderator'::"text"]))))));



CREATE POLICY "Admins and moderators read moderation log" ON "public"."admin_moderation_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role")::"text" = ANY (ARRAY['admin'::"text", 'moderator'::"text"]))))));



CREATE POLICY "Admins can delete categories" ON "public"."categories" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete category filters" ON "public"."category_filters" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete category flows" ON "public"."category_flows" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert categories" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert category filters" ON "public"."category_filters" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert category flows" ON "public"."category_flows" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage roles" ON "public"."user_roles" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update categories" ON "public"."categories" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update category filters" ON "public"."category_filters" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update category flows" ON "public"."category_flows" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update reports" ON "public"."reports" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update site settings" ON "public"."site_settings" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all listings" ON "public"."listings" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view reports" ON "public"."reports" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage ip_bans" ON "public"."ip_bans" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage user_bans" ON "public"."user_bans" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage user_suspensions" ON "public"."user_suspensions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Authenticated users can submit reports" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "Buyers can start conversations" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "buyer_id") AND ("auth"."uid"() <> "seller_id") AND (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "conversations"."listing_id") AND ("l"."seller_id" = "conversations"."seller_id") AND ("l"."status" = 'active'::"public"."listing_status"))))));



CREATE POLICY "Categories are viewable by everyone" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Category filters are viewable by everyone" ON "public"."category_filters" FOR SELECT USING (true);



CREATE POLICY "Category flows are viewable by everyone" ON "public"."category_flows" FOR SELECT USING (true);



CREATE POLICY "Listing images viewable for active or owner" ON "public"."listing_images" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "listing_images"."listing_id") AND ("public"."listing_is_public"("l"."status", "l"."sold_at") OR ("l"."seller_id" = "auth"."uid"()))))));



CREATE POLICY "Owners can manage listing images" ON "public"."listing_images" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "listing_images"."listing_id") AND ("l"."seller_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "listing_images"."listing_id") AND ("l"."seller_id" = "auth"."uid"())))));



CREATE POLICY "Participants can send messages" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("c"."buyer_id" = "auth"."uid"()) OR ("c"."seller_id" = "auth"."uid"())))))));



CREATE POLICY "Participants can update conversations" ON "public"."conversations" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id"))) WITH CHECK ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));



CREATE POLICY "Participants can view conversations" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));



CREATE POLICY "Participants can view message reactions" ON "public"."message_reactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE ("c"."id" = "message_reactions"."conversation_id"))));



CREATE POLICY "Participants can view messages" ON "public"."messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("c"."buyer_id" = "auth"."uid"()) OR ("c"."seller_id" = "auth"."uid"()))))));



CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING ((("deleted_at" IS NULL) OR ("auth"."uid"() = "id")));



CREATE POLICY "Senders can soft-delete their own messages" ON "public"."messages" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "sender_id")) WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Site settings are viewable by everyone" ON "public"."site_settings" FOR SELECT USING (true);



CREATE POLICY "Users can delete their own listings" ON "public"."listings" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "seller_id"));



CREATE POLICY "Users can insert their own listings" ON "public"."listings" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "seller_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can manage their own favorites" ON "public"."favorites" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "favorites"."listing_id") AND ("l"."seller_id" = "auth"."uid"())))))));



CREATE POLICY "Users can mark their system messages as read" ON "public"."system_messages" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users can update their own listings" ON "public"."listings" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "seller_id") AND ("status" <> 'disabled'::"public"."listing_status"))) WITH CHECK ((("auth"."uid"() = "seller_id") AND ("status" <> 'disabled'::"public"."listing_status")));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Users can view their own system messages" ON "public"."system_messages" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users delete own blocks" ON "public"."user_blocks" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users delete own deletion request" ON "public"."account_deletions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own blocks" ON "public"."user_blocks" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users see own ban" ON "public"."user_bans" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see own suspensions" ON "public"."user_suspensions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view own blocks" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users view own deletion request" ON "public"."account_deletions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."account_deletions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_moderation_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_filters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_flows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."endpoint_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."error_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ip_bans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reaction_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."r2_delete_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."standard_upload_objects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."standard_upload_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_bans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_suspensions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_ban_user"("_user_id" "uuid", "_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_ban_user"("_user_id" "uuid", "_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_ban_user"("_user_id" "uuid", "_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_delete_listing"("_id" "uuid", "_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_listing"("_id" "uuid", "_message" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_delete_listing"("_id" "uuid", "_message" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_disable_listing"("_id" "uuid", "_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_disable_listing"("_id" "uuid", "_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_disable_listing"("_id" "uuid", "_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_disable_listing_with_message"("_id" "uuid", "_reason" "text", "_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_disable_listing_with_message"("_id" "uuid", "_reason" "text", "_message" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_disable_listing_with_message"("_id" "uuid", "_reason" "text", "_message" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_enable_listing"("_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_enable_listing"("_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_enable_listing"("_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_export_user_data"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_export_user_data"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_export_user_data"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_find_users_by_email"("_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_find_users_by_email"("_query" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_find_users_by_email"("_query" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_grant_demo_role"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_grant_demo_role"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_grant_demo_role"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_grant_moderator_role"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_grant_moderator_role"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_grant_moderator_role"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_grant_role"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_grant_role"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_grant_role"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_list_bans"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_bans"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_list_bans"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_list_reports"("_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_reports"("_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_list_reports"("_limit" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_replace_listing_category"("_category_id" "uuid", "_replacement_category_id" "uuid", "_expected_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_replace_listing_category"("_category_id" "uuid", "_replacement_category_id" "uuid", "_expected_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_resolve_report"("_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_resolve_report"("_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_resolve_report"("_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_revoke_demo_role"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_demo_role"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_revoke_demo_role"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_revoke_moderator_role"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_moderator_role"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_revoke_moderator_role"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_revoke_role"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_role"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_revoke_role"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_search_listings"("_query" "text", "_status" "text", "_limit" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."admin_set_listing_home_visibility"("_id" "uuid", "_hidden" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_listing_home_visibility"("_id" "uuid", "_hidden" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_unban_user"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_unban_user"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_unban_user"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."can_upload_listing_image"("_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_upload_listing_image"("_listing_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_account_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_account_deletion"() TO "service_role";
GRANT ALL ON FUNCTION "public"."cancel_account_deletion"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_endpoint_rate_limit"("_bucket" "text", "_key_hash" "text", "_limit" integer, "_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_endpoint_rate_limit"("_bucket" "text", "_key_hash" "text", "_limit" integer, "_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_user_rate_limit"("_bucket" "text", "_user_id" "uuid", "_limit" integer, "_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_user_rate_limit"("_bucket" "text", "_user_id" "uuid", "_limit" integer, "_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_orphan_standard_uploads"("_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_orphan_standard_uploads"("_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."conversations_enforce_block"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversations_enforce_block"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."conversations_enforce_moderation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversations_enforce_moderation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_r2_cleanup"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_conversation_read_status_only"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_conversation_read_status_only"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_last_admin"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_last_admin_account_deletion"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_message_soft_delete_only"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_message_soft_delete_only"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_old_listings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_old_listings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_orphan_standard_upload"("_id" bigint, "_deleted" boolean, "_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_orphan_standard_upload"("_id" bigint, "_deleted" boolean, "_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fuzz_listing_location"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fuzz_listing_location"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_kaupet_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_kaupet_code"() TO "service_role";
GRANT ALL ON FUNCTION "public"."generate_kaupet_code"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."guard_standard_upload_reference"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_blocked_between"("_a" "uuid", "_b" "uuid", "_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_blocked_between"("_a" "uuid", "_b" "uuid", "_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_ip_banned"("_ip" "inet") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_ip_banned"("_ip" "inet") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_user_banned"("_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_banned"("_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_user_deletion_pending"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_deletion_pending"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_user_deletion_pending"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_user_suspended"("_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_suspended"("_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."listing_attribute_format_rules"("_category_id" "uuid", "_extra_dates" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."listing_is_public"("_status" "public"."listing_status", "_sold_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listing_is_public"("_status" "public"."listing_status", "_sold_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."listing_is_public"("_status" "public"."listing_status", "_sold_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."listing_is_public"("_status" "public"."listing_status", "_sold_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."listing_matches_attribute_filters"("_attributes" "jsonb", "_filters" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listing_matches_attribute_filters"("_attributes" "jsonb", "_filters" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."listing_matches_attribute_filters"("_attributes" "jsonb", "_filters" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."listing_matches_attribute_filters"("_attributes" "jsonb", "_filters" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."listing_precise_location"("_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listing_precise_location"("_listing_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."listings_enforce_moderation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."listings_search_vector_trigger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listings_search_vector_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."listings_set_expiry"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."listings_set_sold_at"() FROM PUBLIC;



GRANT DELETE ON TABLE "public"."listings" TO "anon";
GRANT DELETE ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("id") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("seller_id") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("seller_id") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("title"),UPDATE("title") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("title") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("description"),UPDATE("description") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("description") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("price_nok"),UPDATE("price_nok") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("price_nok") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("is_free"),UPDATE("is_free") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("is_free") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("category_id") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("category_id") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("condition") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("condition") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("postal_code"),UPDATE("postal_code") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("postal_code") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("city"),UPDATE("city") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("city") ON TABLE "public"."listings" TO "anon";



GRANT UPDATE("lat") ON TABLE "public"."listings" TO "authenticated";



GRANT UPDATE("lng") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("status") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("search_vector") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("search_vector") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("published_at") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("published_at") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("expires_at") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("expires_at") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("kaupet_code") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("kaupet_code") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("display_lat") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("display_lat") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("display_lng") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("display_lng") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("counted_category_id") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("counted_category_id") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("counted_lexemes") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("counted_lexemes") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("can_ship") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("can_ship") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("counted_keyword_category_id") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("counted_keyword_category_id") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("counted_keywords") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("counted_keywords") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("attributes") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("attributes") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("subtitle"),UPDATE("subtitle") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("subtitle") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("known_issues"),UPDATE("known_issues") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("known_issues") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("no_known_issues"),UPDATE("no_known_issues") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("no_known_issues") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("maintenance_history"),UPDATE("maintenance_history") ON TABLE "public"."listings" TO "authenticated";
GRANT SELECT("maintenance_history") ON TABLE "public"."listings" TO "anon";



GRANT SELECT("draft_expiry_notified_at") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("draft_expiry_notified_at") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("hidden_from_home") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("hidden_from_home") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("show_visiting_address") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("show_visiting_address") ON TABLE "public"."listings" TO "authenticated";



GRANT SELECT("sold_at") ON TABLE "public"."listings" TO "anon";
GRANT SELECT("sold_at") ON TABLE "public"."listings" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."lock_listing_draft_for_user"("_listing_id" "uuid", "_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lock_listing_draft_for_user"("_listing_id" "uuid", "_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."messages_bump_conversation_last_message_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."messages_bump_conversation_last_message_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."messages_enforce_block"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."messages_enforce_block"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."messages_enforce_moderation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."messages_enforce_moderation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_listing_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_listing_counts"() TO "service_role";
GRANT ALL ON FUNCTION "public"."my_listing_counts"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."my_moderation_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_moderation_status"() TO "service_role";
GRANT ALL ON FUNCTION "public"."my_moderation_status"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."prevent_listing_ownership_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."publish_listing_draft"("_listing_id" "uuid", "_user_id" "uuid", "_fields" "jsonb", "_images" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_listing_draft"("_listing_id" "uuid", "_user_id" "uuid", "_fields" "jsonb", "_images" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_endpoint_rate_limits"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_endpoint_rate_limits"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_expired_accounts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_accounts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_expired_personal_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_personal_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_listing_status_history"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."refresh_listing_search_vector_after_category_move"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."register_standard_upload_object"("_bucket" "text", "_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_standard_upload_object"("_bucket" "text", "_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_account_deletion"("_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_account_deletion"("_email" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."request_account_deletion"("_email" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reserve_standard_upload_quota"("_user_id" "uuid", "_bytes" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_standard_upload_quota"("_user_id" "uuid", "_bytes" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_listings_page"("_include_groups" "jsonb", "_exclude_any_terms" "text"[], "_exclude_all_groups" "jsonb", "_category_ids" "uuid"[], "_conditions" "public"."listing_condition"[], "_include_free" boolean, "_min_price" integer, "_max_price" integer, "_attribute_filters" "jsonb", "_center_lat" double precision, "_center_lng" double precision, "_radius_km" double precision, "_sort" "text", "_limit" integer, "_offset" integer, "_include_recently_sold" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_listings_page"("_include_groups" "jsonb", "_exclude_any_terms" "text"[], "_exclude_all_groups" "jsonb", "_category_ids" "uuid"[], "_conditions" "public"."listing_condition"[], "_include_free" boolean, "_min_price" integer, "_max_price" integer, "_attribute_filters" "jsonb", "_center_lat" double precision, "_center_lng" double precision, "_radius_km" double precision, "_sort" "text", "_limit" integer, "_offset" integer, "_include_recently_sold" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."search_listings_page"("_include_groups" "jsonb", "_exclude_any_terms" "text"[], "_exclude_all_groups" "jsonb", "_category_ids" "uuid"[], "_conditions" "public"."listing_condition"[], "_include_free" boolean, "_min_price" integer, "_max_price" integer, "_attribute_filters" "jsonb", "_center_lat" double precision, "_center_lng" double precision, "_radius_km" double precision, "_sort" "text", "_limit" integer, "_offset" integer, "_include_recently_sold" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_listings_page"("_include_groups" "jsonb", "_exclude_any_terms" "text"[], "_exclude_all_groups" "jsonb", "_category_ids" "uuid"[], "_conditions" "public"."listing_condition"[], "_include_free" boolean, "_min_price" integer, "_max_price" integer, "_attribute_filters" "jsonb", "_center_lat" double precision, "_center_lng" double precision, "_radius_km" double precision, "_sort" "text", "_limit" integer, "_offset" integer, "_include_recently_sold" boolean) TO "service_role";



GRANT SELECT,DELETE ON TABLE "public"."messages" TO "anon";
GRANT SELECT,DELETE ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT UPDATE("deleted_at") ON TABLE "public"."messages" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."send_message_rate_limited"("_conversation_id" "uuid", "_sender_id" "uuid", "_body" "text", "_attachment_path" "text", "_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_message_rate_limited"("_conversation_id" "uuid", "_sender_id" "uuid", "_body" "text", "_attachment_path" "text", "_client_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_message_reaction"("_message_id" "uuid", "_emoji" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_message_reaction"("_message_id" "uuid", "_emoji" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."standard_upload_is_referenced"("_bucket" "text", "_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."standard_upload_is_referenced"("_bucket" "text", "_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_listing_report"("_listing_id" "uuid", "_reason" "text", "_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_listing_report"("_listing_id" "uuid", "_reason" "text", "_comment" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."submit_listing_report"("_listing_id" "uuid", "_reason" "text", "_comment" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_user_report"("_reported_user_id" "uuid", "_reason" "text", "_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_user_report"("_reported_user_id" "uuid", "_reason" "text", "_comment" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."submit_user_report"("_reported_user_id" "uuid", "_reason" "text", "_comment" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sync_draft_listing_images"("_listing_id" "uuid", "_user_id" "uuid", "_images" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_draft_listing_images"("_listing_id" "uuid", "_user_id" "uuid", "_images" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_listing_images"("_listing_id" "uuid", "_images" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_listing_images"("_listing_id" "uuid", "_images" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_listing_attribute_formats"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."validate_listing_image_reference"() FROM PUBLIC;



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."account_deletions" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."account_deletions" TO "authenticated";
GRANT ALL ON TABLE "public"."account_deletions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."admin_moderation_log" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."admin_moderation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_moderation_log" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."categories" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."category_filters" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."category_filters" TO "authenticated";
GRANT ALL ON TABLE "public"."category_filters" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."category_flows" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."category_flows" TO "authenticated";
GRANT ALL ON TABLE "public"."category_flows" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."conversations" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."endpoint_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."error_log" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."favorites" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."ip_bans" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."ip_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."ip_bans" TO "service_role";



GRANT SELECT,DELETE ON TABLE "public"."listing_images" TO "anon";
GRANT SELECT,DELETE ON TABLE "public"."listing_images" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_images" TO "service_role";



GRANT INSERT("listing_id") ON TABLE "public"."listing_images" TO "authenticated";



GRANT INSERT("storage_path") ON TABLE "public"."listing_images" TO "authenticated";



GRANT INSERT("sort_order"),UPDATE("sort_order") ON TABLE "public"."listing_images" TO "authenticated";



GRANT INSERT("caption"),UPDATE("caption") ON TABLE "public"."listing_images" TO "authenticated";



GRANT INSERT("ai_generated") ON TABLE "public"."listing_images" TO "authenticated";



GRANT ALL ON TABLE "public"."listing_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."message_reaction_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";
GRANT SELECT ON TABLE "public"."message_reactions" TO "authenticated";



GRANT SELECT,DELETE ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,DELETE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."r2_delete_queue" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."r2_delete_queue_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."r2_delete_queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."r2_delete_queue_id_seq" TO "service_role";



GRANT SELECT,DELETE,UPDATE ON TABLE "public"."reports" TO "anon";
GRANT SELECT,DELETE,UPDATE ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."site_settings" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";



GRANT ALL ON TABLE "public"."standard_upload_objects" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."standard_upload_objects_id_seq" TO "anon";
GRANT UPDATE ON SEQUENCE "public"."standard_upload_objects_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."standard_upload_objects_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."standard_upload_quotas" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."system_messages" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."system_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."system_messages" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_bans" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_bans" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_blocks" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_roles" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_suspensions" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_suspensions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_suspensions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- Singleton-raden for site_settings.
INSERT INTO public.site_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

SELECT cron.schedule('endpoint-rate-limit-retention-daily', '45 3 * * *', 'SELECT public.purge_endpoint_rate_limits();');
SELECT cron.schedule('expire-old-listings-hourly', '0 * * * *', 'SELECT public.expire_old_listings();');
SELECT cron.schedule('privacy-retention-daily', '30 3 * * *', 'SELECT public.purge_expired_personal_data();');
SELECT cron.schedule('purge-expired-accounts-daily', '0 3 * * *', 'SELECT public.purge_expired_accounts();');
SELECT cron.schedule('r2-cleanup-hourly', '15 * * * *', 'SELECT public.dispatch_r2_cleanup();');

-- RLS styrer radene; klientrollene trenger ikke vedlikeholdsrettigheter på tabeller.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM PUBLIC, anon, authenticated;
