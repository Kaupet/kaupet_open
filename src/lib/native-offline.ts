// Shows a toast when the device loses or regains connectivity while the app
// is running (web and native). On native, the bundled
// `capacitor-shell/offline.html` handles the case where the app cannot reach
// the web server at launch, and the Android hardware back button is wired up here.

import { toast } from "sonner";
import { hapticImpact, hapticNotification } from "./haptics";
import { isNative } from "./native";
import { SITE_SHORT_NAME } from "@/lib/site";

let initialized = false;

/**
 * Escape hatch for overlays that intentionally don't push history entries
 * (onboarding, `historyBack={false}`) but still want the Android hardware
 * back button to do something other than the default history-back/exitApp
 * fallback. Return `true` to consume the press, `false` to fall through.
 */
let backOverride: (() => boolean) | null = null;
export function setBackOverride(fn: (() => boolean) | null) {
  backOverride = fn;
}

export function initOfflineWatcher(): () => void {
  if (initialized || typeof window === "undefined") {
    return () => {};
  }
  initialized = true;

  let offlineToastId: string | number | undefined;

  const onOffline = () => {
    void hapticNotification("error");
    offlineToastId = toast.error("Ingen internettforbindelse", {
      description: `Vi får ikke kontakt med ${SITE_SHORT_NAME}. Sjekk forbindelsen.`,
      duration: Infinity,
    });
  };

  const onOnline = () => {
    if (offlineToastId !== undefined) {
      toast.dismiss(offlineToastId);
      offlineToastId = undefined;
    }
    void hapticImpact("light");
    toast.success("Tilkoblet igjen");
  };

  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  // Wire up Android hardware back button to navigate router history.
  let appCleanup: (() => void) | undefined;
  void (async () => {
    if (!isNative()) return;
    try {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (backOverride?.()) return;
        // canGoBack reflects WebView history; use window.history.length as
        // additional guard since TanStack Router pushes to browser history.
        if (canGoBack && window.history.length > 1) {
          window.history.back();
        } else {
          void App.exitApp();
        }
      });
      appCleanup = () => {
        void handle.remove();
      };
    } catch {
      /* ignore — App plugin not available */
    }
  })();

  return () => {
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    appCleanup?.();
    initialized = false;
  };
}
