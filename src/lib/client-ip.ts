/** Klientens IP fra forespørselshodene, eller `null`.
 *
 * Bak Cloudflare setter edge `cf-connecting-ip` og overskriver det klienten
 * selv sendte. Hos andre verter kan klienten sende hodet selv og velge sin
 * egen IP, og dermed omgå IP-utestengelse og rate limiting. Der settes
 * `CLIENT_IP_HEADER` til hodet proxyen foran appen overskriver (f.eks.
 * `x-real-ip`), og bare det hodet leses. */
export function clientIp(headers: Headers): string | null {
  const trusted = process.env.CLIENT_IP_HEADER;
  const value = trusted
    ? headers.get(trusted)
    : (headers.get("cf-connecting-ip") ??
      headers.get("x-forwarded-for") ??
      headers.get("x-real-ip"));
  return value?.split(",")[0]?.trim() || null;
}
