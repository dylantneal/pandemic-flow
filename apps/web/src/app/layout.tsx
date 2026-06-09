import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import { StructuredData } from "@/components/seo/structured-data";
import { nwssOfficialName, siteDescription, siteName } from "@/lib/copy/site-copy";
import { getSiteUrl, rootOpenGraph } from "@/lib/seo/metadata";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  openGraph: rootOpenGraph,
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  description: siteDescription,
  url: getSiteUrl(),
};

const datasetStructuredData = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: `${siteName} Illinois wastewater activity indices`,
  description: siteDescription,
  url: getSiteUrl(),
  isAccessibleForFree: true,
  creator: {
    "@type": "Organization",
    name: siteName,
  },
  distribution: {
    "@type": "DataDownload",
    contentUrl: "https://www.cdc.gov/nwss/",
    encodingFormat: "application/json",
  },
  keywords: ["COVID-19", "wastewater surveillance", "Illinois", "NWSS"],
  temporalCoverage: "2021/..",
  variableMeasured: "SARS-CoV-2 RNA activity index",
  license: "https://www.usa.gov/government-works",
  citation: nwssOfficialName,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <StructuredData data={websiteStructuredData} />
        <StructuredData data={datasetStructuredData} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
