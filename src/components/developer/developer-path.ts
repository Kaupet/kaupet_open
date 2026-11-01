/** Sidene under /developer viser utviklerlogoen og -navigasjonen i headeren. */
export function isDeveloperPath(pathname: string) {
  return pathname === "/developer" || pathname.startsWith("/developer/");
}
