/** Slugifies a string for club/team name lookups. */
export function slugify(input: string, charactersOnly?: boolean): string {
  const base = input
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  if (charactersOnly) {
    return base.replaceAll(/[\W_]+/g, "");
  }
  return base;
}
