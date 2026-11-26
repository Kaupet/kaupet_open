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

/** Refunds one attempt counted by assertUserNotRateLimited when the write it
 * guarded failed, so failed writes do not use up the quota. Refunds are capped
 * by the `<bucket>_refund` rule, so a client repeating failing writes is still
 * throttled; without that rule nothing is refunded. Best effort: a failed
 * refund must not hide the original error. */
export async function releaseUserRateLimit(userId: string, bucket: string): Promise<void> {
  try {
    ruleFor(bucket);
    const refundBucket = `${bucket}_refund`;
    const { limit, windowSeconds } = ruleFor(refundBucket);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: allowed, error: capError } = await supabaseAdmin.rpc("check_user_rate_limit", {
      _bucket: refundBucket,
      _user_id: userId,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (capError) {
      console.error("release_user_rate_limit", capError.message);
      return;
    }
    if (!allowed) return;
    const { error } = await supabaseAdmin.rpc("release_user_rate_limit", {
      _bucket: bucket,
      _user_id: userId,
    });
    if (error) console.error("release_user_rate_limit", error.message);
  } catch (error) {
    console.error("release_user_rate_limit", error);
  }
}
