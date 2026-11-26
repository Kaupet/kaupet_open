import type { CapacitorConfig } from "@capacitor/cli";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile();

const appId = process.env.CAPACITOR_APP_ID?.trim();
const appName = process.env.CAPACITOR_APP_NAME?.trim();
const appUrl = URL.parse(process.env.CAPACITOR_APP_URL?.trim() ?? "");

if (!appId || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(appId)) {
  throw new Error("Sett CAPACITOR_APP_ID til en app-ID som org.example.marked i .env.");
}
if (!appName) {
  throw new Error("Sett CAPACITOR_APP_NAME til appens visningsnavn i .env.");
}
if (!appUrl || appUrl.protocol !== "https:" || appUrl.href !== `${appUrl.origin}/`) {
  throw new Error("Sett CAPACITOR_APP_URL til tjenestens HTTPS-adresse uten sti i .env.");
}

const config: CapacitorConfig = {
  appId,
  appName,
  webDir: "app-shell",
  // TanStack Start-ruter og serverfunksjoner trenger samme origin.
  server: { url: appUrl.origin, errorPath: "index.html" },
  loggingBehavior: "none",
  zoomEnabled: true,
  includePlugins: [
    "@capacitor/app",
    "@capacitor/camera",
    // Posisjonsfilteret og stedsvelgeren bruker native posisjon i appen.
    "@capacitor/geolocation",
    "@capacitor/haptics",
    "@capacitor/keyboard",
    "@capacitor/screen-orientation",
    "@capacitor/share",
    "@capacitor/splash-screen",
    "@capacitor/status-bar",
  ],
  plugins: { Keyboard: { resizeOnFullScreen: true } },
};

export default config;
