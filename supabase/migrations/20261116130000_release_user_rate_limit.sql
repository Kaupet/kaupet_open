-- check_user_rate_limit teller forsøket før skrivingen. Feiler skrivingen
-- etterpå, skal ikke forsøket bruke av kvoten: ellers låser autolagringens
-- gjentatte, mislykkede utkastopprettelser brukeren ute fra å publisere.

CREATE FUNCTION public.release_user_rate_limit(
  _bucket text,
  _user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR length(_bucket) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Invalid user rate-limit input';
  END IF;

  UPDATE public.endpoint_rate_limits
  SET attempts = attempts - 1
  WHERE bucket = _bucket
    AND key_hash = encode(sha256(convert_to(_user_id::text, 'UTF8')), 'hex')
    AND attempts > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.release_user_rate_limit(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_user_rate_limit(text, uuid)
  TO service_role;
