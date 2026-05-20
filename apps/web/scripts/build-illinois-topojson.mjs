/**
 * Filters U.S. counties TopoJSON to Illinois (state FIPS 17) only.
 * Run from repo root: node apps/web/scripts/build-illinois-topojson.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(
  __dirname,
  "../src/lib/dashboard/data/illinois-counties.topo.json",
);
const SOURCE_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

const IL_STATE_FIPS = "17";

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${res.status}`);
  }
  const topo = await res.json();

  const objects = topo.objects;
  const countyKey = Object.keys(objects).find((k) =>
    k.toLowerCase().includes("count"),
  );
  if (!countyKey) {
    throw new Error("Could not find counties object in TopoJSON");
  }

  const geometries = objects[countyKey].geometries;
  const ilGeometries = geometries.filter((g) => {
    const id = String(g.id ?? "");
    return id.startsWith(IL_STATE_FIPS);
  });

  if (ilGeometries.length !== 102) {
    console.warn(
      `Expected 102 IL counties, got ${ilGeometries.length}. Writing anyway.`,
    );
  }

  const filtered = {
    type: "Topology",
    objects: {
      counties: {
        type: "GeometryCollection",
        geometries: ilGeometries,
      },
    },
    arcs: topo.arcs,
    transform: topo.transform,
    bbox: topo.bbox,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(filtered));
  console.log(`Wrote ${ilGeometries.length} counties to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
