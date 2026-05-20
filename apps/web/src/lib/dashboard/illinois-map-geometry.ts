import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { geoAlbers, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";

import {
  aggregateSitesToCounties,
  toMapAggregate,
  type CountyMapAggregate,
} from "@/lib/dashboard/county-aggregate";
import { COUNTY_BY_FIPS } from "@/lib/dashboard/county-lookup";
import type { SiteMetricRow } from "@/lib/dashboard/types";

export type CountyMapFeature = {
  fips: string;
  name: string;
  d: string;
  aggregate: CountyMapAggregate | null;
};

const WIDTH = 520;
const HEIGHT = 620;

async function loadTopology(): Promise<Topology> {
  const filePath = join(
    process.cwd(),
    "public/data/illinois-counties.topo.json",
  );
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as Topology;
}

export async function buildIllinoisCountyMapFeatures(
  sites: SiteMetricRow[],
): Promise<{
  features: CountyMapFeature[];
  width: number;
  height: number;
}> {
  const topo = await loadTopology();
  const collection = feature(
    topo,
    topo.objects.counties as Parameters<typeof feature>[1],
  ) as FeatureCollection<Geometry>;

  const projection = geoAlbers().fitSize([WIDTH, HEIGHT], collection);
  const pathGen = geoPath(projection);

  const aggregates = aggregateSitesToCounties(sites);

  const features: CountyMapFeature[] = collection.features.map((f) => {
    const fips = String(f.id ?? "");
    const entry = COUNTY_BY_FIPS.get(fips);
    const name = entry?.name ?? fips;
    const agg = aggregates.get(fips);
    const d = pathGen(f as Feature<Geometry>) ?? "";

    return {
      fips,
      name,
      d,
      aggregate: agg ? toMapAggregate(agg) : null,
    };
  });

  return { features, width: WIDTH, height: HEIGHT };
}
