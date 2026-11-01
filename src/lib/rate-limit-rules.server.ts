// kaupet_open: egne standardterskler for assertNotRateLimited og
// assertUserNotRateLimited. Erstatter src/lib/rate-limit-rules.server.ts med
// samme API. Juster dem etter trafikken på din installasjon.

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
  geocoding: { limit: 50, windowSeconds: 60 },
  listing_creation: { limit: 10, windowSeconds: 3600 },
  standard_upload: { limit: 50, windowSeconds: 60 },
};

// Tersklene databasefunksjonene håndhever selv. Kilden er basismigrasjonen
// (supabase/migrations); RLS-testene leser dem herfra.
export const DB_RATE_LIMITS = {
  messagesPer10Seconds: 10,
  messagesPerHour: 100,
  reactionChangesPerMinute: 20,
  reportsPerHour: 8,
  uploadObjectsPerDay: 400,
  uploadBytesPerDay: 419430400,
};
