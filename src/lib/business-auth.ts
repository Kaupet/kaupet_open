// kaupet_open: innlogging går til den private markedsplassen uten bedriftsoppslag.
export async function hasBusinessAccount(_userId: string): Promise<boolean> {
  return false;
}
export async function verifiedAccountDestination(
  _userId: string,
): Promise<"/" | "/bedrift" | "/bedrift/velg-plan"> {
  return "/";
}
