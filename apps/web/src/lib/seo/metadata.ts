import type { Metadata } from "next";

import { siteDescription, siteName } from "@/lib/copy/site-copy";

const DEFAULT_SITE_URL = "https://covidflow.org";

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return configured || DEFAULT_SITE_URL;
}

type PageMetadataInput = {
  title: string;
  description?: string;
  path: string;
  type?: "website" | "article";
};

export function buildPageMetadata({
  title,
  description = siteDescription,
  path,
  type = "website",
}: PageMetadataInput): Metadata {
  const siteUrl = getSiteUrl();
  const canonical = `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type,
      siteName,
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${siteName}`,
      description,
    },
  };
}

export const rootOpenGraph: Metadata["openGraph"] = {
  type: "website",
  siteName,
  title: siteName,
  description: siteDescription,
  locale: "en_US",
};
