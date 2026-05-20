import { AboutContent } from "@/components/about/about-content";
import { AboutHero } from "@/components/about/about-hero";
import { AppShell } from "@/components/layout/app-shell";
import { siteDescription } from "@/lib/copy/site-copy";

export const metadata = {
  title: "About",
  description: siteDescription,
};

export default function AboutPage() {
  return (
    <AppShell variant="flush" className="max-w-none px-0 py-0">
      <AboutHero />
      <AboutContent />
    </AppShell>
  );
}
