// Maps raw API category strings to canonical full names with gender suffix.
// Falls back to normalizeCategory() for unknown patterns, then "Unknown".

const CATEGORY_MAP: Record<string, string> = {
  // Already-canonical strings — must map to themselves so canonicalizeCategory
  // doesn't re-process them through normalizeCategory (which strips gender suffixes)
  "Elite Male": "Elite Male",             "Elite Female": "Elite Female",
  "Open 19-34 Male": "Open 19-34 Male",   "Open 19-34 Female": "Open 19-34 Female",
  "Junior Male": "Elite Male",            "Junior Female": "Elite Female",
  "Cadete Male": "Elite Male",            "Cadete Female": "Elite Female",
  "Masters A Male": "Masters A Male",     "Masters A Female": "Masters A Female",
  "Masters B Male": "Masters B Male",     "Masters B Female": "Masters B Female",
  "Masters C Male": "Masters C Male",     "Masters C Female": "Masters C Female",
  "Masters D Male": "Masters D Male",     "Masters D Female": "Masters D Female",
  "Masters E Male": "Masters E Male",     "Masters E Female": "Masters E Female",
  "Masters F Male": "Masters F Male",     "Masters F Female": "Masters F Female",
  "Masters F": "Masters F",
  "E-Bike": "E-Bike",
  "Paracycling": "Paracycling",
  // Elite Male
  "ELITES M": "Elite Male", "M ELITES": "Elite Male", "Elite M.": "Elite Male",
  "Elite Masc": "Elite Male", "M Elite": "Elite Male",
  "M SUB23": "Elite Male",
  "Elites M": "Elite Male", "Sub 23 M": "Elite Male",
  // Elite Female
  "ELITES F": "Elite Female", "F ELITES": "Elite Female", "Elite F.": "Elite Female",
  "Elites Fem": "Elite Female", "F Elite": "Elite Female",
  "F SUB23": "Elite Female",
  "Elites F": "Elite Female", "Sub 23 F": "Elite Female",
  // Open 19-34
  "M 19-34": "Open 19-34 Male",
  "F 19-34": "Open 19-34 Female",
  // En-dash (U+2013) variants
  "M19–34": "Open 19-34 Male",  "F 19–34": "Open 19-34 Female",
  "M35–39": "Masters A Male",   "F35–39": "Masters A Female",
  "M40–44": "Masters B Male",   "F40–44": "Masters B Female",
  "M45–49": "Masters B Male",   "F45–49": "Masters B Female",
  "M50–54": "Masters C Male",   "F50–54": "Masters C Female",
  "M55–59": "Masters C Male",   "F55–59": "Masters C Female",
  "M60–64": "Masters D Male",   "F60–64": "Masters D Female",
  "M70-74": "Masters E Male",  "M75-79": "Masters E Male",
  "M65- 69": "Masters D Male",
  // Junior / Cadete Male
  "M JUN": "Elite Male", "M Junior": "Elite Male",
  "Junior M.": "Elite Male", "Juniores Masc": "Elite Male",
  "Juniores M": "Elite Male",
  // Junior / Cadete Female
  "F JUN": "Elite Female", "Junior F.": "Elite Female",
  "Juniores F": "Elite Female",
  // Cadete Male
  "M Cadete": "Elite Male", "Cadete Masc": "Elite Male",
  // Masters A Male
  "MASTERS A": "Masters A Male", "M Masters A": "Masters A Male",
  "Master A": "Masters A Male", "MasterA Masc": "Masters A Male",
  "MASTER 30": "Masters A Male", "MASTER 35": "Masters A Male", "M 35-39": "Masters A Male",
  "Masters 30 M": "Masters A Male", "Masters 35 M": "Masters A Male",
  // Masters B Male
  "MASTERS B": "Masters B Male", "M Masters B": "Masters B Male",
  "Master B": "Masters B Male", "MasterB Masc": "Masters B Male",
  "MASTER 40": "Masters B Male", "M 40-44": "Masters B Male",
  "MASTER 45": "Masters B Male", "M 45-49": "Masters B Male",
  "Masters 40 M": "Masters B Male", "Masters 45 M": "Masters B Male",
  // Masters C Male
  "MASTERS C": "Masters C Male", "M Masters C": "Masters C Male",
  "Master C": "Masters C Male", "MasterC Masc": "Masters C Male",
  "MASTER 50": "Masters C Male", "M 50-54": "Masters C Male",
  "MASTER 55": "Masters C Male", "M 55-59": "Masters C Male",
  "Masters 50 M": "Masters C Male", "Masters 55 M": "Masters C Male",
  // Masters D Male
  "MASTERS D": "Masters D Male", "M Masters D": "Masters D Male",
  "Master D": "Masters D Male", "MasterDM": "Masters D Male",
  "MASTER 60": "Masters D Male", "M 60-64": "Masters D Male",
  "MASTER 65": "Masters D Male", "M 65-69": "Masters D Male",
  "Masters 60 M": "Masters D Male", "Masters 65 M": "Masters D Male",
  // Masters E Male
  "MASTERS E": "Masters E Male", "M Master E": "Masters E Male",
  "Master E": "Masters E Male", "MasterEM": "Masters E Male",
  "MASTER 70": "Masters E Male", "M 70-74": "Masters E Male", "M 75-79": "Masters E Male",
  "Masters 70 M": "Masters E Male", "Masters 75 M": "Masters E Male",
  // Masters A Female
  "MASTERS A FEM": "Masters A Female", "F MASTERS A": "Masters A Female",
  "F Masters A": "Masters A Female", "Master A Fem": "Masters A Female",
  "F MASTER 30": "Masters A Female", "F MASTER 35": "Masters A Female", "F 35-39": "Masters A Female",
  "Masters 30 F": "Masters A Female", "Masters 35 F": "Masters A Female",
  // Masters B Female
  "MASTERS B FEM": "Masters B Female", "F MASTERS B": "Masters B Female",
  "F Mastres B": "Masters B Female", "Master B Fem": "Masters B Female",
  "F MASTER 40": "Masters B Female", "F 40-44": "Masters B Female",
  "F MASTER 45": "Masters B Female", "F 45-49": "Masters B Female",
  "Masters 40 F": "Masters B Female", "Masters 45 F": "Masters B Female",
  // Masters C Female
  "MASTERS C FEM": "Masters C Female", "F MASTERS C": "Masters C Female",
  "F Masters C": "Masters C Female", "Master C Fem": "Masters C Female",
  "F MASTER 50": "Masters C Female", "F 50-54": "Masters C Female",
  "F MASTER 55": "Masters C Female", "F 55-59": "Masters C Female",
  "Masters 50 F": "Masters C Female", "Masters 55 F": "Masters C Female",
  // Masters D Female
  "MASTERS D FEM": "Masters D Female", "F MASTERS D": "Masters D Female",
  "F MASTER D": "Masters D Female", "F 60-64": "Masters D Female",
  "Masters 60 F": "Masters D Female", "Masters 65 F": "Masters D Female",
  // E-Bike
  "EBIKE": "E-Bike", "E-BIKE": "E-Bike", "E-Bikes": "E-Bike",
  // Paracycling
  "PARACICLISMO": "Paracycling", "PARACICLISTA": "Paracycling", "PARACLISMO": "Paracycling",
  // Unknown / misc
  "": "Unknown", "Sem Escalão": "Unknown",
  "MASTERS F": "Masters F Male", "MASTERS F ": "Masters F Male",
};

function normalizeCategory(cat: string): string {
  const s = cat.toLowerCase().replace(/[^a-z0-9]/g, '').replace('mastres', 'masters');

  // Masters F (80+) — must precede isFemale: the trailing 'F' is the age grade, not gender
  if (/^masters?f$/.test(s)) return 'Masters F';

  const isFemale = /\bf\b|fem|fem$|^f/.test(cat.toLowerCase());
  const suffix = isFemale ? ' Female' : ' Male';

  if (/sub23/.test(s)) return `Sub 23${suffix}`;
  if (/junior|juniore|cadete|juv/.test(s) || /^[mf]?jun$/.test(s)) return `Elite${suffix}`;
  if (/elite/.test(s)) return `Elite${suffix}`;
  if (s === 'm1934' || s === 'f1934' || /^[mf]19\d\d/.test(s)) return `Open 19-34${suffix}`;
  if (/masters?a/.test(s) || /master[23]/.test(s) || /masters[23]\d/.test(s) || /^[mf]3[0-9]/.test(s)) return `Masters A${suffix}`;
  if (/masters?b/.test(s) || /master4/.test(s) || /masters4\d/.test(s) || /^[mf]4/.test(s)) return `Masters B${suffix}`;
  if (/masters?c/.test(s) || /master5/.test(s) || /masters5\d/.test(s) || /^[mf]5/.test(s)) return `Masters C${suffix}`;
  if (/masters?d/.test(s) || /master6/.test(s) || /masters6\d/.test(s) || /^[mf]6/.test(s)) return `Masters D${suffix}`;
  if (/masters?e/.test(s) || /master[67]/.test(s) || /^[mf]7/.test(s)) return `Masters E${suffix}`;
  if (/masters?f/.test(s) || /master8/.test(s) || /^[mf]8/.test(s)) return `Masters F${suffix}`;
  if (/ebike|e.?bike|electrica/.test(s)) return 'E-Bike';
  if (/para/.test(s)) return 'Paracycling';

  return cat.trim();
}

export function canonicalizeCategory(raw: string): string {
  if (raw in CATEGORY_MAP) return CATEGORY_MAP[raw]!;
  const fallback = normalizeCategory(raw);
  return fallback !== raw ? fallback : "Unknown";
}

/** Returns true if the raw category string represents a female category. */
export function isFemaleCategory(raw: string): boolean {
  return canonicalizeCategory(raw).endsWith("Female");
}
