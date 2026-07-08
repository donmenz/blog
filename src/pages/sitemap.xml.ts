import { collectTags, entrySlug, getPublishedEntries, typeLabels } from "../lib/entries";

const site = "https://tsu.wang";

function url(path: string) {
  return new URL(path, site).toString();
}

function item(path: string, lastmod?: Date) {
  return `  <url>
    <loc>${url(path)}</loc>${lastmod ? `
    <lastmod>${lastmod.toISOString()}</lastmod>` : ""}
  </url>`;
}

export async function GET() {
  const entries = await getPublishedEntries();
  const tags = collectTags(entries);
  const latestDate = entries[0]?.data.date;
  const urls = [
    item("/", latestDate),
    item("/search/"),
    item("/rss.xml", latestDate),
    ...Object.keys(typeLabels).map((type) => item(`/type/${type}/`, latestDate)),
    ...tags.map(({ tag }) => item(`/tags/${encodeURIComponent(tag)}/`, latestDate)),
    ...entries.map((entry) => item(`/entries/${entrySlug(entry)}/`, entry.data.date))
  ];

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
