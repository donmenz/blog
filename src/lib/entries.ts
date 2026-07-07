import { getCollection } from "astro:content";

export const typeLabels: Record<string, string> = {
  travel: "旅行记录",
  onsen: "温泉",
  hotel: "酒店",
  city: "城市观察",
  aviation: "航空",
  japan_life: "日本生活"
};

export async function getPublishedEntries() {
  const entries = await getCollection("entries");
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function entrySlug(entry: Awaited<ReturnType<typeof getPublishedEntries>>[number]) {
  return entry.id.replace(/\.(md|mdx)$/i, "");
}

export function collectTags(entries: Awaited<ReturnType<typeof getPublishedEntries>>) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of [...entry.data.tags, ...entry.data.ai_tags]) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function entryLocation(entry: Awaited<ReturnType<typeof getPublishedEntries>>[number]) {
  return [entry.data.region, entry.data.prefecture, entry.data.city].filter(Boolean).join(" / ");
}
