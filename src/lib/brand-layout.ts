// kaupet_open: stilsettet fra oppstartsveiviseren (VITE_OPEN_LAYOUT), satt som
// data-layout på <html> og stylet i src/brand.css. Ukjent verdi gir «hvit».
import { LAYOUTS, type LayoutId } from "../features/setup/layouts";

const layout = import.meta.env.VITE_OPEN_LAYOUT as string | undefined;

export const BRAND_LAYOUT: LayoutId = LAYOUTS.find((l) => l.id === layout)?.id ?? "hvit";
