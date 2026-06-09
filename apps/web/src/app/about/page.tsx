import { AboutContent } from "@/components/about/about-content";
import { AboutHero } from "@/components/about/about-hero";
import { AppShell } from "@/components/layout/app-shell";
import { siteDescription } from "@/lib/copy/site-copy";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "About",
  description: siteDescription,
  path: "/about",
});

export default function AboutPage() {
  return (
    <AppShell variant="flush" className="max-w-none px-0 py-0">
      <AboutHero />
      <AboutContent />
    </AppShell>
  );
}
