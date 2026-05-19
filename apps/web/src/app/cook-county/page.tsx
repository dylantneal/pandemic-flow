import { AppShell } from "@/components/layout/app-shell";
import { RegionDashboard } from "@/components/dashboard/region-dashboard";
import { COOK_CONFIG } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cook County",
  description:
    "Weekly COVID wastewater activity trends for Cook County, Illinois.",
};

export default function CookCountyPage() {
  return (
    <AppShell>
      <RegionDashboard config={COOK_CONFIG} />
    </AppShell>
  );
}
