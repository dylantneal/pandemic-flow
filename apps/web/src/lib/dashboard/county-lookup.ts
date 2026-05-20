/** Illinois county FIPS lookup (102 counties). */
export type CountyEntry = { fips: string; name: string; slug: string };

export const IL_COUNTIES: readonly CountyEntry[] = [
  { fips: "17001", name: "Adams", slug: "adams" },
  { fips: "17003", name: "Alexander", slug: "alexander" },
  { fips: "17005", name: "Bond", slug: "bond" },
  { fips: "17007", name: "Boone", slug: "boone" },
  { fips: "17009", name: "Brown", slug: "brown" },
  { fips: "17011", name: "Bureau", slug: "bureau" },
  { fips: "17013", name: "Calhoun", slug: "calhoun" },
  { fips: "17015", name: "Carroll", slug: "carroll" },
  { fips: "17017", name: "Cass", slug: "cass" },
  { fips: "17019", name: "Champaign", slug: "champaign" },
  { fips: "17021", name: "Christian", slug: "christian" },
  { fips: "17023", name: "Clark", slug: "clark" },
  { fips: "17025", name: "Clay", slug: "clay" },
  { fips: "17027", name: "Clinton", slug: "clinton" },
  { fips: "17029", name: "Coles", slug: "coles" },
  { fips: "17031", name: "Cook", slug: "cook" },
  { fips: "17033", name: "Crawford", slug: "crawford" },
  { fips: "17035", name: "Cumberland", slug: "cumberland" },
  { fips: "17039", name: "De Witt", slug: "dewitt" },
  { fips: "17037", name: "DeKalb", slug: "dekalb" },
  { fips: "17041", name: "Douglas", slug: "douglas" },
  { fips: "17043", name: "DuPage", slug: "dupage" },
  { fips: "17045", name: "Edgar", slug: "edgar" },
  { fips: "17047", name: "Edwards", slug: "edwards" },
  { fips: "17049", name: "Effingham", slug: "effingham" },
  { fips: "17051", name: "Fayette", slug: "fayette" },
  { fips: "17053", name: "Ford", slug: "ford" },
  { fips: "17055", name: "Franklin", slug: "franklin" },
  { fips: "17057", name: "Fulton", slug: "fulton" },
  { fips: "17059", name: "Gallatin", slug: "gallatin" },
  { fips: "17061", name: "Greene", slug: "greene" },
  { fips: "17063", name: "Grundy", slug: "grundy" },
  { fips: "17065", name: "Hamilton", slug: "hamilton" },
  { fips: "17067", name: "Hancock", slug: "hancock" },
  { fips: "17069", name: "Hardin", slug: "hardin" },
  { fips: "17071", name: "Henderson", slug: "henderson" },
  { fips: "17073", name: "Henry", slug: "henry" },
  { fips: "17075", name: "Iroquois", slug: "iroquois" },
  { fips: "17077", name: "Jackson", slug: "jackson" },
  { fips: "17079", name: "Jasper", slug: "jasper" },
  { fips: "17081", name: "Jefferson", slug: "jefferson" },
  { fips: "17083", name: "Jersey", slug: "jersey" },
  { fips: "17085", name: "Jo Daviess", slug: "jodaviess" },
  { fips: "17087", name: "Johnson", slug: "johnson" },
  { fips: "17089", name: "Kane", slug: "kane" },
  { fips: "17091", name: "Kankakee", slug: "kankakee" },
  { fips: "17093", name: "Kendall", slug: "kendall" },
  { fips: "17095", name: "Knox", slug: "knox" },
  { fips: "17097", name: "Lake", slug: "lake" },
  { fips: "17099", name: "LaSalle", slug: "lasalle" },
  { fips: "17101", name: "Lawrence", slug: "lawrence" },
  { fips: "17103", name: "Lee", slug: "lee" },
  { fips: "17105", name: "Livingston", slug: "livingston" },
  { fips: "17107", name: "Logan", slug: "logan" },
  { fips: "17115", name: "Macon", slug: "macon" },
  { fips: "17117", name: "Macoupin", slug: "macoupin" },
  { fips: "17119", name: "Madison", slug: "madison" },
  { fips: "17121", name: "Marion", slug: "marion" },
  { fips: "17123", name: "Marshall", slug: "marshall" },
  { fips: "17125", name: "Mason", slug: "mason" },
  { fips: "17127", name: "Massac", slug: "massac" },
  { fips: "17109", name: "McDonough", slug: "mcdonough" },
  { fips: "17111", name: "McHenry", slug: "mchenry" },
  { fips: "17113", name: "McLean", slug: "mclean" },
  { fips: "17129", name: "Menard", slug: "menard" },
  { fips: "17131", name: "Mercer", slug: "mercer" },
  { fips: "17133", name: "Monroe", slug: "monroe" },
  { fips: "17135", name: "Montgomery", slug: "montgomery" },
  { fips: "17137", name: "Morgan", slug: "morgan" },
  { fips: "17139", name: "Moultrie", slug: "moultrie" },
  { fips: "17141", name: "Ogle", slug: "ogle" },
  { fips: "17143", name: "Peoria", slug: "peoria" },
  { fips: "17145", name: "Perry", slug: "perry" },
  { fips: "17147", name: "Piatt", slug: "piatt" },
  { fips: "17149", name: "Pike", slug: "pike" },
  { fips: "17151", name: "Pope", slug: "pope" },
  { fips: "17153", name: "Pulaski", slug: "pulaski" },
  { fips: "17155", name: "Putnam", slug: "putnam" },
  { fips: "17157", name: "Randolph", slug: "randolph" },
  { fips: "17159", name: "Richland", slug: "richland" },
  { fips: "17161", name: "Rock Island", slug: "rockisland" },
  { fips: "17165", name: "Saline", slug: "saline" },
  { fips: "17167", name: "Sangamon", slug: "sangamon" },
  { fips: "17169", name: "Schuyler", slug: "schuyler" },
  { fips: "17171", name: "Scott", slug: "scott" },
  { fips: "17173", name: "Shelby", slug: "shelby" },
  { fips: "17163", name: "St. Clair", slug: "stclair" },
  { fips: "17175", name: "Stark", slug: "stark" },
  { fips: "17177", name: "Stephenson", slug: "stephenson" },
  { fips: "17179", name: "Tazewell", slug: "tazewell" },
  { fips: "17181", name: "Union", slug: "union" },
  { fips: "17183", name: "Vermilion", slug: "vermilion" },
  { fips: "17185", name: "Wabash", slug: "wabash" },
  { fips: "17187", name: "Warren", slug: "warren" },
  { fips: "17189", name: "Washington", slug: "washington" },
  { fips: "17191", name: "Wayne", slug: "wayne" },
  { fips: "17193", name: "White", slug: "white" },
  { fips: "17195", name: "Whiteside", slug: "whiteside" },
  { fips: "17197", name: "Will", slug: "will" },
  { fips: "17199", name: "Williamson", slug: "williamson" },
  { fips: "17201", name: "Winnebago", slug: "winnebago" },
  { fips: "17203", name: "Woodford", slug: "woodford" },
] as const;

export function normalizeCountyName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .replace(/county$/i, "");
}

function buildNameMap(): Map<string, CountyEntry> {
  const map = new Map<string, CountyEntry>();
  for (const entry of IL_COUNTIES) {
    map.set(normalizeCountyName(entry.name), entry);
    map.set(entry.slug, entry);
    map.set(entry.fips, entry);
  }
  // CDC / NWSS spelling variants
  const variants: Record<string, string> = {
    dupage: "dupage",
    dewitt: "dewitt",
    stclair: "stclair",
    mcdonough: "mcdonough",
    mchenry: "mchenry",
    mclean: "mclean",
    lasalle: "lasalle",
    jodaviess: "jodaviess",
    rockisland: "rockisland",
    macon: "macon",
    macoupin: "macoupin",
  };
  for (const [variant, slug] of Object.entries(variants)) {
    const entry = IL_COUNTIES.find((c) => c.slug === slug);
    if (entry) map.set(variant, entry);
  }
  return map;
}

export const COUNTY_BY_NAME = buildNameMap();

export const COUNTY_BY_FIPS = new Map<string, CountyEntry>(
  IL_COUNTIES.map((c) => [c.fips, c]),
);

export function resolveCountyName(raw: string): CountyEntry | null {
  const key = normalizeCountyName(raw);
  return COUNTY_BY_NAME.get(key) ?? null;
}
