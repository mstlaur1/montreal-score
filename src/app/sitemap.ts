import type { MetadataRoute } from "next";
import { getLastEtlRun } from "@/lib/db";

const BASE_URL = "https://montrealscore.ashwater.ca";

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ["fr", "en"];
  const dataPages = ["/permits", "/contracts", "/promises", "/311"];
  const staticPages = ["", "/about", "/volunteer"];

  const lastEtl = getLastEtlRun("permits");
  const dataModified = lastEtl ? new Date(lastEtl) : new Date();
  const staticModified = new Date("2026-02-09"); // last significant static content update

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const page of staticPages) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified: page === "" ? dataModified : staticModified,
        changeFrequency: page === "" ? "weekly" : "monthly",
        priority: page === "" ? 1.0 : 0.6,
      });
    }
    for (const page of dataPages) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified: dataModified,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  return entries;
}
