// kaupet_open-stub. Bedriftskontoer finnes ikke i kaupet_open, så ingen
// bruker har et aktivt medlemskap.
import { createServerFn } from "@tanstack/react-start";

export const getBusinessOrganization = createServerFn({ method: "GET" }).handler(async () => ({
  membership: null as { status: "active" } | null,
  organization: null as { id: string } | null,
  locations: [] as { id: string }[],
  billingProfile: null,
}));
