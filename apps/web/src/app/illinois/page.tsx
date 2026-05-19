import { AppShell } from "@/components/layout/app-shell";
import { RegionDashboard } from "@/components/dashboard/region-dashboard";
import { ILLINOIS_CONFIG } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Illinois",
  description:
    "Weekly COVID wastewater activity trends for Illinois from CDC NWSS data.",
};

export default function IllinoisPage() {
  return (
    <AppShell>
      <RegionDashboard config={ILLINOIS_CONFIG} />
    </AppShell>
  );
}
