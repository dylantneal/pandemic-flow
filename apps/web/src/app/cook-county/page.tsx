import { AppShell } from "@/components/layout/app-shell";
import { RegionDashboard } from "@/components/dashboard/region-dashboard";
import { COOK_CONFIG } from "@/lib/dashboard/types";
import { buildPageMetadata } from "@/lib/seo/metadata";

/** See REVALIDATE_WEEKLY_SECONDS in lib/supabase/cache-config.ts */
export const revalidate = 3600;

export const metadata = buildPageMetadata({
  title: "Cook County",
  description:
    "Weekly COVID wastewater activity trends for Cook County, Illinois. Metro sewershed indices, site tables, and quality notes.",
  path: "/cook-county",
});

export default function CookCountyPage() {
  return (
    <AppShell>
      <RegionDashboard config={COOK_CONFIG} />
    </AppShell>
  );
}
