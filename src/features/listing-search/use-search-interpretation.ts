// kaupet_open-stub. Søketolkning finnes ikke i kaupet_open.
import { useState } from "react";

import type { InterpretedCriterion } from "@/features/listing-search/resolve-text-to-filters";

export function useSearchInterpretation() {
  return useState<InterpretedCriterion[]>([]);
}
