// kaupet_open: native-appene og push-varsler er ikke tilgjengelige.
export function nativePushSupported(): boolean {
  return false;
}
export async function getNativePermissionState(): Promise<NotificationPermission | "unsupported"> {
  return "unsupported";
}
export async function subscribeNative(): Promise<void> {
  throw new Error("Push-varsler er ikke tilgjengelige.");
}
export async function unsubscribeNative(): Promise<void> {
  throw new Error("Push-varsler er ikke tilgjengelige.");
}
export async function getCurrentNativeToken(): Promise<string | null> {
  return null;
}
export async function autoRestoreNativePush(): Promise<void> {}
export async function initNativePushNavigation(_navigate: (url: string) => void): Promise<void> {}
export async function initNativePushForeground(_navigate: (url: string) => void): Promise<void> {}
