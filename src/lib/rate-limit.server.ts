import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { RATE_LIMIT_RULES, type RateLimitRule } from "@/lib/rate-limit-rules.server";
import { ClientError, toClientError } from "@/lib/to-client-error";
import { hashRequestIp } from "@/lib/request-ip.server";

const DEFAULT_MESSAGE = "For mange forespørsler. Prøv igjen senere.";

function ruleFor(bucket: string): RateLimitRule {
  const rule = RATE_LIMIT_RULES[bucket];
  if (!rule) throw new Error(`Ingen rate limit-regel for «${bucket}»`);
  return rule;
}

/** Throws if the calling IP has exceeded the rule for `bucket` in
 * rate-limit-rules.server.ts. Backed by check_endpoint_rate_limit. */
export async function assertNotRateLimited(
  bucket: string,
  message = DEFAULT_MESSAGE,
): Promise<void> {
  const { limit, windowSeconds } = ruleFor(bucket);
  const supabaseAdmin = await getSupabaseAdmin();
  const keyHash = await hashRequestIp();
  const { data: allowed, error } = await supabaseAdmin.rpc("check_endpoint_rate_limit", {
    _bucket: bucket,
    _key_hash: keyHash,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    throw await toClientError("database", error);
  }
  if (!allowed) throw new ClientError(message, 429);
}

/** Same database-backed limiter, keyed by the authenticated user rather than
 * the request IP. Use this for authenticated writes. */
export async function assertUserNotRateLimited(
  userId: string,
  bucket: string,
  message = DEFAULT_MESSAGE,
): Promise<void> {
  const { limit, windowSeconds } = ruleFor(bucket);
  const supabaseAdmin = await getSupabaseAdmin();
  const { data: allowed, error } = await supabaseAdmin.rpc("check_user_rate_limit", {
    _bucket: bucket,
    _user_id: userId,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    throw await toClientError("database", error);
  }
  if (!allowed) throw new ClientError(message, 429);
}
