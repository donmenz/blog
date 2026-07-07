import { entrySlug, getPublishedEntries } from "../lib/entries";

const site = "https://tsu.wang";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const entries = await getPublishedEntries();
  const items = entries.map((entry) => `
    <item>
      <title>${escapeXml(entry.data.title)}</title>
      <link>${site}/entries/${entrySlug(entry)}</link>
      <guid>${site}/entries/${entrySlug(entry)}</guid>
      <pubDate>${entry.data.date.toUTCString()}</pubDate>
      <description>${escapeXml(entry.data.summary)}</description>
    </item>
  `);

  return new Response(`<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>東嬉遊記</title>
    <link>${site}</link>
    <description>日本旅行、温泉、酒店、城市与航空观察的个人知识数据库。</description>
    ${items.join("\n")}
  </channel>
</rss>`, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" }
  });
}
