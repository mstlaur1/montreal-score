import type { MetadataRoute } from "next";

const BASE_URL = "https://montrealscore.ashwater.ca";

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ["fr", "en"];
  const pages = ["", "/permits", "/contracts", "/promises", "/about", "/volunteer"];

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const page of pages) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified: new Date(),
        changeFrequency: page === "/about" ? "monthly" : "weekly",
        priority: page === "" ? 1.0 : 0.8,
      });
    }
  }

  return entries;
}
