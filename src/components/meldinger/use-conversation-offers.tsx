// kaupet_open-stub. Bud og reservasjon finnes ikke i kaupet_open.
import type { JSX, RefObject } from "react";

import type { Message } from "@/components/meldinger/message-list";

export type OfferListing = {
  id: string;
  status: string;
  is_free: boolean;
  category_id: string | null;
  reserved_until: string | null;
  holdsReservation: boolean;
};

type Params = {
  conversationId: string;
  userId: string | undefined;
  buyerId: string | undefined;
  isSeller: boolean;
  otherName: string;
  listing: OfferListing | null;
  priceNok: number | null;
  canAct: boolean;
  sold: boolean;
  desktop: boolean;
  pollMs: number | false;
  confettiCanvasRef: RefObject<HTMLCanvasElement | null>;
  onOpenActions: (message: Message) => void;
};

export function useConversationOffers(_params: Params) {
  return {
    renderOffer: (_message: Message): JSX.Element | null => null,
    sheets: <></>,
    banner: null as JSX.Element | null,
    canOffer: false,
    startOffer: () => {},
    agreed: false,
  };
}
