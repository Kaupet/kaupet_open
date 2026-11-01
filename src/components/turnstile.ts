// kaupet_open: ingen ekstern CAPTCHA eller lasting av tredjepartsskript.
import type { Ref } from "react";

export function isTurnstileEnabled() {
  return false;
}

export interface TurnstileInstance {
  render: () => string | null | undefined;
  execute: () => void;
  reset: () => void;
  remove: () => void;
  getResponse: () => string | undefined;
  getResponsePromise: (timeout?: number, retry?: number) => Promise<string>;
  isExpired: () => boolean;
}

export function Turnstile(_props: {
  ref?: Ref<TurnstileInstance>;
  siteKey: string;
  options?: Record<string, unknown>;
  onBeforeInteractive?: () => void;
  onSuccess?: (token: string) => void;
}) {
  return null;
}
