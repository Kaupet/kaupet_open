// kaupet_open-stub. Push-varsler finnes ikke i kaupet_open; «ikke støttet» skjuler
// alle push-hint og -knapper i kjernen. Samme API som src/hooks/use-push-status.ts.
export type PushStatus = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribedHere: boolean;
  prefs: {
    web_push_messages: boolean;
    web_push_saved_searches: boolean;
    web_push_price_drops: boolean;
  };
  loading: boolean;
  messagesActive: boolean;
  savedSearchesActive: boolean;
  priceDropsActive: boolean;
  enableOnThisDevice: (kind?: "messages" | "saved_searches" | "price_drops") => Promise<void>;
  refresh: () => void;
};

const UNSUPPORTED: PushStatus = {
  supported: false,
  permission: "unsupported",
  subscribedHere: false,
  prefs: { web_push_messages: false, web_push_saved_searches: false, web_push_price_drops: false },
  loading: false,
  messagesActive: false,
  savedSearchesActive: false,
  priceDropsActive: false,
  enableOnThisDevice: async () => {
    throw new Error("Push-varsler er ikke med i denne versjonen.");
  },
  refresh: () => {},
};

export function usePushStatus(): PushStatus {
  return UNSUPPORTED;
}
