"use client";

import { useCallback, useState } from "react";

import { CountyHoverCardContent } from "@/components/dashboard/county-hover-card";
import {
  ACTIVITY_DOMAIN,
  fillForActivity,
  LEGEND_GRADIENT_STOPS,
  NO_DATA_FILL,
} from "@/lib/dashboard/county-color";
import {
  formatActivityIndex,
  trendLabelText,
} from "@/lib/dashboard/format";
import type { CountyMapAggregate } from "@/lib/dashboard/county-aggregate";
import type { CountyMapFeature } from "@/lib/dashboard/illinois-map-geometry";
import { useTouchPrimary } from "@/hooks/use-media-query";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function countyAriaLabel(
  name: string,
  aggregate: CountyMapAggregate | null,
): string {
  if (!aggregate) {
    return `${name} County, no wastewater monitoring data this week`;
  }
  return `${name} County, activity index ${formatActivityIndex(aggregate.activityIndex)}, ${trendLabelText(aggregate.trendLabel)}, ${aggregate.contributingSiteCount} sewersheds reporting`;
}

function CountyPath({
  feature,
  weekStart,
  isActive,
  onActivate,
  touchPrimary,
}: {
  feature: CountyMapFeature;
  weekStart: string | null;
  isActive: boolean;
  onActivate: (fips: string | null) => void;
  touchPrimary: boolean;
}) {
  const fill = fillForActivity(feature.aggregate?.activityIndex ?? null);
  const aria = countyAriaLabel(feature.name, feature.aggregate);

  const pathEl = (
    <path
      d={feature.d}
      fill={fill}
      stroke={isActive ? "var(--primary)" : "var(--border)"}
      strokeWidth={isActive ? 1.5 : 0.35}
      className={cn(
        "cursor-pointer transition-[stroke,stroke-width] outline-none",
        "focus-visible:stroke-[2px] focus-visible:stroke-primary",
      )}
      tabIndex={0}
      role="img"
      aria-label={aria}
      onMouseEnter={() => onActivate(feature.fips)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(feature.fips)}
      onBlur={() => onActivate(null)}
    />
  );

  const card = (
    <CountyHoverCardContent
      countyName={feature.name}
      aggregate={feature.aggregate}
      weekStart={weekStart}
    />
  );

  if (touchPrimary) {
    return (
      <Popover>
        <PopoverTrigger asChild>{pathEl}</PopoverTrigger>
        <PopoverContent side="top" className="w-72">
          {card}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <HoverCard openDelay={80} closeDelay={100}>
      <HoverCardTrigger asChild>{pathEl}</HoverCardTrigger>
      <HoverCardContent side="top" className="w-72">
        {card}
      </HoverCardContent>
    </HoverCard>
  );
}

export function IllinoisCountyMapClient({
  features,
  width,
  height,
  weekStart,
}: {
  features: CountyMapFeature[];
  width: number;
  height: number;
  weekStart: string | null;
}) {
  const touchPrimary = useTouchPrimary();
  const [activeFips, setActiveFips] = useState<string | null>(null);
  const onActivate = useCallback((fips: string | null) => {
    setActiveFips(fips);
  }, []);

  const gradientId = "pfActivityLegend";
  const patternId = "pfNoDataPattern";

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto h-auto max-h-[min(720px,70vh)] w-full max-w-3xl"
        aria-labelledby="il-map-title"
        role="group"
      >
        <title id="il-map-title">
          Illinois counties colored by wastewater activity index
        </title>
        <defs>
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill="oklch(0.94 0.01 75)" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke="oklch(0.88 0.02 75)"
              strokeWidth="2"
            />
          </pattern>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            {LEGEND_GRADIENT_STOPS.map((stop) => (
              <stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
              />
            ))}
          </linearGradient>
        </defs>
        <g>
          {features.map((f) => (
            <CountyPath
              key={f.fips}
              feature={f}
              weekStart={weekStart}
              isActive={activeFips === f.fips}
              onActivate={onActivate}
              touchPrimary={touchPrimary}
            />
          ))}
        </g>
      </svg>

      <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="font-medium text-foreground">Activity index</span>
          <div
            className="h-2.5 w-full rounded-full"
            style={{
              background: `linear-gradient(to right, ${LEGEND_GRADIENT_STOPS.map((s) => s.color).join(", ")})`,
            }}
            aria-hidden
          />
          <div className="flex justify-between tabular-nums">
            <span>{ACTIVITY_DOMAIN.low}</span>
            <span>{ACTIVITY_DOMAIN.mid}</span>
            <span>+{ACTIVITY_DOMAIN.high}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-6 rounded border border-border/80"
            style={{ background: NO_DATA_FILL }}
            aria-hidden
          />
          <span>No NWSS coverage</span>
        </div>
      </div>
    </div>
  );
}
