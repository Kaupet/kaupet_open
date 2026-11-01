// kaupet_open: navnet i sidetitler og metadata. Erstatter src/lib/site.ts.
export const SITE_NAME = "kaupet_open";

export const SITE_TITLE = "kaupet_open";

export const SITE_SHORT_NAME = "kaupet_open";

// Valgene fra oppstartsveiviseren; bakes inn ved bygg som VITE_OPEN_LAYOUT.
// `?.` fordi vite.config.ts også laster fila, og der finnes ikke import.meta.env.
export const LEGAL_PAGES = import.meta.env?.VITE_OPEN_LEGAL_PAGES === "true";

export const AUTH_EMAIL = import.meta.env?.VITE_OPEN_EMAIL === "true";

// VITE_SITE_URL settes av veiviseren; uten den brukes adressen siden er åpnet
// på i nettleseren, og lenker på serveren blir relative.
export const SITE_URL = (
  (import.meta.env?.VITE_SITE_URL as string | undefined) ||
  (typeof window === "undefined" ? "" : window.location.origin)
).replace(/\/+$/, "");

export const SITE_DESCRIPTION = "En markedsplass for kjøp og salg av brukte ting.";

export const POWERED_BY = "kaupet_open (AGPL-3.0, https://github.com/Kaupet/kaupet_open)";

// Open sender ingen e-post fra appen; Supabase Auth har egen avsender.
export const EMAIL_FROM = "";

// Kontakten utestengte brukere får; uten VITE_SUPPORT_EMAIL vises ingen.
export const SUPPORT_EMAIL = (import.meta.env?.VITE_SUPPORT_EMAIL as string | undefined) ?? "";

export const PUSH_CONTACT = SITE_URL;

export const SITE_TEST_HOST = "";

export const SITE_SOCIAL_IMAGE = "/favicon.svg";
