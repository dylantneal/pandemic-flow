import { describe, expect, it } from "vitest";

import { metadata as aboutMetadata } from "@/app/about/page";
import { metadata as cookMetadata } from "@/app/cook-county/page";
import { metadata as illinoisMetadata } from "@/app/illinois/page";
import { metadata as methodsMetadata } from "@/app/methods/page";
import { metadata as homeMetadata } from "@/app/page";

type RouteMetadata = {
  title?: unknown;
  description?: unknown;
  alternates?: { canonical?: unknown };
  openGraph?: { title?: unknown; description?: unknown; url?: unknown };
  twitter?: { card?: unknown; title?: unknown; description?: unknown };
};

function assertRouteMetadata(
  route: string,
  metadata: RouteMetadata,
  expectedTitle: string,
) {
  expect(metadata.title, `${route} title`).toBe(expectedTitle);
  expect(metadata.description, `${route} description`).toBeTruthy();
  expect(metadata.alternates?.canonical, `${route} canonical`).toBeTruthy();
  expect(metadata.openGraph?.title, `${route} openGraph title`).toBeTruthy();
  expect(metadata.openGraph?.description, `${route} openGraph description`).toBeTruthy();
  expect(metadata.openGraph?.url, `${route} openGraph url`).toBeTruthy();
  expect(metadata.twitter?.card, `${route} twitter card`).toBe("summary_large_image");
}

describe("public route metadata smoke", () => {
  it("covers key dashboard routes", () => {
    assertRouteMetadata("/", homeMetadata as RouteMetadata, "Overview");
    assertRouteMetadata(
      "/illinois",
      illinoisMetadata as RouteMetadata,
      "Illinois",
    );
    assertRouteMetadata(
      "/cook-county",
      cookMetadata as RouteMetadata,
      "Cook County",
    );
    assertRouteMetadata("/methods", methodsMetadata as RouteMetadata, "Methods");
    assertRouteMetadata("/about", aboutMetadata as RouteMetadata, "About");
  });
});
