// jsdom (fra v31) beregner CSS-animasjoner, men spiller dem aldri av og sender
// aldri `animationend`. Radix Presence venter på den hendelsen før lukkede
// overlays (f.eks. vaul-skuffen) fjernes fra DOM-en, så uten dette blir de
// liggende i testene. Slå av animasjoner slik jsdom 30 i praksis gjorde.
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = "*, *::before, *::after { animation: none !important; }";
  document.head.append(style);
}
