"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { CountyHoverCardContent } from "@/components/dashboard/county-hover-card";
import {
  ACTIVITY_DOMAIN,
  fillForActivity,
  LEGEND_GRADIENT_STOPS,
  NO_DATA_FILL,
} from "@/lib/dashboard/county-color";
import {
  formatActivityIndex,
  formatWeekDate,
  trendLabelText,
} from "@/lib/dashboard/format";
import type { CountyMapAggregate } from "@/lib/dashboard/county-aggregate";
import type { WeeklyCountySnapshot } from "@/lib/dashboard/illinois-map-geometry";
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

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function countyAriaLabel(
  name: string,
  aggregate: CountyMapAggregate | null,
): string {
  if (!aggregate) {
    return `${name} County, no wastewater monitoring data this week`;
  }
  return `${name} County, activity index ${formatActivityIndex(aggregate.activityIndex)}, ${trendLabelText(aggregate.trendLabel)}, ${aggregate.contributingSiteCount} sewersheds reporting`;
}

// --------------------------------------------------------------------------
// CountyPath
// --------------------------------------------------------------------------

function CountyPath({
  fips,
  name,
  d,
  aggregate,
  weekStart,
  isActive,
  onActivate,
  touchPrimary,
}: {
  fips: string;
  name: string;
  d: string;
  aggregate: CountyMapAggregate | null;
  weekStart: string | null;
  isActive: boolean;
  onActivate: (fips: string | null) => void;
  touchPrimary: boolean;
}) {
  const fill = fillForActivity(aggregate?.activityIndex ?? null);
  const aria = countyAriaLabel(name, aggregate);

  const pathEl = (
    <path
      d={d}
      fill={fill}
      stroke={isActive ? "var(--primary)" : "var(--border)"}
      strokeWidth={isActive ? 1.5 : 0.35}
      className={cn(
        "cursor-pointer transition-[fill,stroke,stroke-width] outline-none",
        "focus-visible:stroke-[2px] focus-visible:stroke-primary",
      )}
      style={{ transitionDuration: "180ms" }}
      tabIndex={0}
      role="img"
      aria-label={aria}
      onMouseEnter={() => onActivate(fips)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(fips)}
      onBlur={() => onActivate(null)}
    />
  );

  const card = (
    <CountyHoverCardContent
      countyName={name}
      aggregate={aggregate}
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

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

const AUTO_PLAY_INTERVAL_MS = 500;

export function IllinoisCountyMapClient({
  snapshots,
  pathsByFips,
  width,
  height,
  currentWeek,
}: {
  snapshots: WeeklyCountySnapshot[];
  pathsByFips: Record<string, { name: string; d: string }>;
  width: number;
  height: number;
  /** The "live" week to start on (most recent). */
  currentWeek: string | null;
}) {
  const touchPrimary = useTouchPrimary();

  // Start on the most recent snapshot
  const initialIdx = snapshots.length > 0 ? snapshots.length - 1 : 0;
  const [weekIdx, setWeekIdx] = useState(initialIdx);
  const [playing, setPlaying] = useState(false);
  const [activeFips, setActiveFips] = useState<string | null>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onActivate = useCallback((fips: string | null) => {
    setActiveFips(fips);
  }, []);

  const snapshot = snapshots[weekIdx] ?? null;
  const weekStart = snapshot?.weekStart ?? currentWeek;
  const totalCounties = Object.keys(pathsByFips).length;
  const reportingCount = snapshot?.reportingCount ?? 0;

  // Auto-play
  useEffect(() => {
    if (!playing) {
      if (playRef.current) clearInterval(playRef.current);
      return;
    }
    playRef.current = setInterval(() => {
      setWeekIdx((i) => {
        if (i >= snapshots.length - 1) {
          setPlaying(false);
          return snapshots.length - 1;
        }
        return i + 1;
      });
    }, AUTO_PLAY_INTERVAL_MS);
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, snapshots.length]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPlaying(false);
      setWeekIdx(Number(e.target.value));
    },
    [],
  );

  const step = useCallback(
    (dir: -1 | 1) => {
      setPlaying(false);
      setWeekIdx((i) => Math.max(0, Math.min(snapshots.length - 1, i + dir)));
    },
    [snapshots.length],
  );

  const gradientId = "pfActivityLegend";
  const patternId = "pfNoDataPattern";

  const fipsList = useMemo(() => Object.keys(pathsByFips), [pathsByFips]);

  if (snapshots.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No county data available.
      </p>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* ── Time controls ── */}
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {/* Date label + coverage */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              Week of {weekStart ? formatWeekDate(weekStart) : "—"}
            </span>
            {weekIdx === snapshots.length - 1 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Latest
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {reportingCount} of {totalCounties} counties reporting
          </span>
        </div>

        {/* Slider row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => step(-1)}
            disabled={weekIdx === 0}
            aria-label="Previous week"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>

          <div className="relative flex-1">
            {(() => {
              const pct =
                snapshots.length > 1
                  ? (weekIdx / (snapshots.length - 1)) * 100
                  : 100;
              return (
                <input
                  type="range"
                  min={0}
                  max={snapshots.length - 1}
                  value={weekIdx}
                  onChange={handleSliderChange}
                  aria-label="Select week"
                  aria-valuetext={
                    weekStart ? `Week of ${formatWeekDate(weekStart)}` : undefined
                  }
                  className="map-time-slider w-full"
                  style={{
                    background: `linear-gradient(to right, var(--primary) ${pct}%, var(--border) ${pct}%)`,
                  }}
                />
              );
            })()}
          </div>

          <button
            onClick={() => step(1)}
            disabled={weekIdx === snapshots.length - 1}
            aria-label="Next week"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>

          <button
            onClick={() => {
              if (weekIdx === snapshots.length - 1) setWeekIdx(0);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Pause playback" : "Play through history"}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {playing ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </button>
        </div>

        {/* Week ticks: show first/last label */}
        <div className="flex justify-between text-[10px] text-muted-foreground/70 tabular-nums">
          <span>{snapshots[0] ? formatWeekDate(snapshots[0].weekStart) : ""}</span>
          <span>
            {snapshots[snapshots.length - 1]
              ? formatWeekDate(snapshots[snapshots.length - 1].weekStart)
              : ""}
          </span>
        </div>
      </div>

      {/* ── Map SVG ── */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto h-auto max-h-[min(720px,70vh)] w-full max-w-3xl"
        aria-labelledby="il-map-title"
        role="group"
      >
        <title id="il-map-title" suppressHydrationWarning>
          {`Illinois counties, wastewater activity index${weekStart ? `, week of ${formatWeekDate(weekStart)}` : ""}`}
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
          {fipsList.map((fips) => {
            const { name, d } = pathsByFips[fips]!;
            const aggregate = snapshot?.counties[fips] ?? null;
            return (
              <CountyPath
                key={fips}
                fips={fips}
                name={name}
                d={d}
                aggregate={aggregate}
                weekStart={weekStart}
                isActive={activeFips === fips}
                onActivate={onActivate}
                touchPrimary={touchPrimary}
              />
            );
          })}
        </g>
      </svg>

      {/* ── Legend ── */}
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
