// kaupet_open-stub. Bedriftskontoer finnes ikke i kaupet_open.
export type BusinessPlan = "proff_basis" | "proff";

export function hasEffectiveProffAccess(_organization: unknown, _now?: number): boolean {
  return false;
}
