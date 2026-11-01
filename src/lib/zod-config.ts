import { z } from "zod";

// Zod 4 probes `new Function("")` when it builds an object schema, to decide
// whether to JIT-compile the parser. Our CSP forbids eval, so the probe is
// reported as a CSP violation (and logged as a console error in Firefox) even
// though Zod catches the throw. The flag is read at schema construction, so
// this module must be imported before anything that defines a schema — keep
// it the first import in every entry (router.tsx, start.ts, server.ts).
z.config({ jitless: true });
