import { AppShell } from "@/components/layout/app-shell";
import { MethodsArticle } from "@/components/methods/methods-article";
import { siteName } from "@/lib/copy/site-copy";

export const metadata = {
  title: "Methods",
  description: `How ${siteName} ingests CDC wastewater data, computes activity indices, and interprets trends.`,
};

export default function MethodsPage() {
  return (
    <AppShell>
      <MethodsArticle />
    </AppShell>
  );
}
