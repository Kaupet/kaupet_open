// kaupet_open: startlayoutene i veiviseren. Stilene ligger i src/brand.css
// under [data-layout=…]; valget lagres som VITE_OPEN_LAYOUT.
export const LAYOUTS = [
  {
    id: "hvit",
    name: "Hvit",
    description: "Hvit og nøytral, uten eksempelinnhold. Et blankt utgangspunkt.",
    examples: false,
  },
  {
    id: "lavendel",
    name: "Lavendel",
    description:
      "Myke lilla flater, runde hjørner og skygger. Med eksempelkategorier og -annonser.",
    examples: true,
  },
  {
    id: "signal",
    name: "Signal",
    description:
      "Svart på hvitt med gult, tykke streker og monospace. Med eksempelkategorier og -annonser.",
    examples: true,
  },
] as const;

export type LayoutId = (typeof LAYOUTS)[number]["id"];
