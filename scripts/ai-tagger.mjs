import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { inferTopics, makeSlug, slugify, uniq } from "./obsidian-metadata.mjs";

const root = fileURLToPath(new URL("../src/content/entries", import.meta.url));
const files = (await fs.readdir(root)).filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));

const rules = [
  { pattern: /温泉|泉|湯|onsen/i, scope: "title", type: "onsen", tags: ["温泉"], ai_tags: ["onsen_record"] },
  { pattern: /酒店|旅馆|住宿|hotel/i, scope: "title", type: "hotel", tags: ["酒店"], ai_tags: ["stay_record"] },
  { pattern: /机场|航空|航班|机型|airport|aviation/i, scope: "title", type: "aviation", tags: ["航空"], ai_tags: ["transit_record"] },
  { pattern: /城市|街区|车站|city/i, scope: "title", type: "city", tags: ["城市观察"], ai_tags: ["city_observation"] },
  { pattern: /北海道|札幌|函馆|小樽/i, tags: ["北海道"], ai_tags: ["hokkaido"] },
  { pattern: /东京|羽田|成田|新宿|涩谷/i, tags: ["东京"], ai_tags: ["tokyo_area"] },
  { pattern: /冬|雪|winter/i, season: "winter", ai_tags: ["winter_travel"] },
  { pattern: /春|樱|spring/i, season: "spring", ai_tags: ["spring_travel"] },
  { pattern: /秋|红叶|autumn|fall/i, season: "autumn", ai_tags: ["autumn_travel"] },
  { pattern: /夏|祭|summer/i, season: "summer", ai_tags: ["summer_travel"] }
];

function inferSummary(content) {
  const text = content
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 96) || "待补充摘要。";
}

function normalizeDate(value) {
  if (!(value instanceof Date)) return value;
  return value.toISOString().slice(0, 10);
}

let changed = 0;

for (const file of files) {
  const fullPath = path.join(root, file);
  const source = await fs.readFile(fullPath, "utf8");
  const parsed = matter(source);
  const titleText = `${parsed.data.title ?? ""}`;
  const contextText = `${parsed.data.title ?? ""}\n${parsed.data.summary ?? ""}`;
  const next = { ...parsed.data };
  const filenameSlug = slugify(path.basename(file, path.extname(file)));

  next.tags = Array.isArray(next.tags) ? next.tags : [];
  next.ai_tags = Array.isArray(next.ai_tags) ? next.ai_tags : [];
  next.slug = makeSlug({
    existingSlug: next.slug ?? filenameSlug,
    title: next.title,
    filename: file,
    relativePath: file,
    content: parsed.content
  });

  if (!next.summary) next.summary = inferSummary(parsed.content);
  if (!next.country) next.country = "Japan";
  if (!next.season) next.season = "unknown";
  next.date = normalizeDate(next.date);
  next.visited_date = normalizeDate(next.visited_date);

  for (const rule of rules) {
    const haystack = rule.scope === "title" ? titleText : contextText;
    if (!rule.pattern.test(haystack)) continue;
    if (!next.type && rule.type) next.type = rule.type;
    if (rule.season && next.season === "unknown") next.season = rule.season;
    next.tags = uniq([...next.tags, ...(rule.tags ?? [])]);
    next.ai_tags = uniq([...next.ai_tags, ...(rule.ai_tags ?? [])]);
  }

  if (!next.type) next.type = "travel";
  next.topics = uniq([...(Array.isArray(next.topics) ? next.topics : []), ...inferTopics(next.tags, next.type)]);

  const output = matter.stringify(parsed.content.trimStart(), next, {
    lineWidth: 100
  });

  if (output !== source) {
    await fs.writeFile(fullPath, output);
    changed += 1;
    console.log(`Updated ${file}`);
  }
}

console.log(changed ? `Updated ${changed} files.` : "No changes needed.");
