import { AppShell } from "@/components/layout/app-shell";
import { MethodsArticle } from "@/components/methods/methods-article";
import { siteName } from "@/lib/copy/site-copy";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "Methods",
  description: `How ${siteName} ingests CDC wastewater data, computes activity indices, and interprets trends.`,
  path: "/methods",
});

export default function MethodsPage() {
  return (
    <AppShell>
      <MethodsArticle />
    </AppShell>
  );
}
