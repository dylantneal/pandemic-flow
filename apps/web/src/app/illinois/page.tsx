import { AppShell } from "@/components/layout/app-shell";
import { RegionDashboard } from "@/components/dashboard/region-dashboard";
import { ILLINOIS_CONFIG } from "@/lib/dashboard/types";
import { buildPageMetadata } from "@/lib/seo/metadata";

/** See REVALIDATE_WEEKLY_SECONDS in lib/supabase/cache-config.ts */
export const revalidate = 3600;

export const metadata = buildPageMetadata({
  title: "Illinois",
  description:
    "Weekly COVID wastewater activity trends for Illinois from CDC NWSS data. County map, historical charts, and quality notes.",
  path: "/illinois",
});

export default function IllinoisPage() {
  return (
    <AppShell>
      <RegionDashboard config={ILLINOIS_CONFIG} />
    </AppShell>
  );
}
