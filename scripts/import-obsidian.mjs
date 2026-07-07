import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const sourceRoot = process.env.OBSIDIAN_BLOG_DIR ?? "/Users/donmen/obsidian/blog";
const targetRoot = fileURLToPath(new URL("../src/content/entries", import.meta.url));
const ignoredDirs = new Set([".obsidian", "image", "images", "attachments", "附件"]);

function slugifyFilename(value) {
  return value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}^[\]`]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferType(relativeDir, title, content) {
  const haystack = `${relativeDir}\n${title}\n${content.slice(0, 400)}`.toLowerCase();
  if (/温泉|onsen|泉|湯/.test(haystack)) return "onsen";
  if (/机场|航空|航班|机型|airport|aviation/.test(haystack)) return "aviation";
  if (/iphone|trade in|转运|信用卡|银行|返现/.test(haystack)) return "japan_life";
  if (/jr|周游券|pass|乐享|klook|agoda/.test(haystack)) return "travel";
  if (/hotel|酒店|旅馆|住宿/.test(haystack)) return "hotel";
  if (/城市|街区|city|海士町|大阪|天桥立/.test(haystack)) return "city";
  return "travel";
}

function inferTags(relativeDir, title, content, type) {
  const haystack = `${relativeDir}\n${title}\n${content.slice(0, 800)}`;
  const tags = new Set(["日本旅行"]);

  if (type === "hotel") tags.add("酒店");
  if (type === "onsen") tags.add("温泉");
  if (type === "aviation") tags.add("航空");
  if (type === "city") tags.add("城市观察");
  if (type === "japan_life") tags.add("日本生活");

  if (/北海道|札幌|函馆|小樽/.test(haystack)) tags.add("北海道");
  if (/大阪|关西|天桥立|京都/.test(haystack)) tags.add("关西");
  if (/东京|羽田|成田|新宿|涩谷/.test(haystack)) tags.add("东京");
  if (/JR|周游券|PASS|pass|乐享|Klook|Agoda/i.test(haystack)) tags.add("交通");
  if (/JR|周游券|PASS|pass/i.test(haystack)) tags.add("JR Pass");
  if (/折扣|优惠|返现|白嫖|套利|代金券/.test(haystack)) tags.add("优惠攻略");

  return [...tags];
}

function inferAiTags(tags, type) {
  const aiTags = new Set([`${type}_record`]);
  const tagMap = {
    北海道: "hokkaido",
    关西: "kansai",
    东京: "tokyo_area",
    酒店: "stay_record",
    温泉: "onsen_record",
    航空: "aviation_record",
    交通: "transit_record",
    "JR Pass": "rail_pass",
    优惠攻略: "travel_deal"
  };

  for (const tag of tags) {
    if (tagMap[tag]) aiTags.add(tagMap[tag]);
  }

  return [...aiTags];
}

function inferSummary(content) {
  const text = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 120) || "待补充摘要。";
}

function inferSeason(content) {
  if (/冬|雪|winter/i.test(content)) return "winter";
  if (/春|樱|spring/i.test(content)) return "spring";
  if (/秋|红叶|autumn|fall/i.test(content)) return "autumn";
  if (/夏|祭|summer/i.test(content)) return "summer";
  return "unknown";
}

function normalizeObsidianMarkdown(content) {
  return content.replace(/```table-of-contents\s*```/g, "").trimStart();
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

async function collectMarkdownFiles(dir, relativeDir = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const fullPath = path.join(dir, entry.name);
    const nextRelativeDir = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      files.push(...(await collectMarkdownFiles(fullPath, nextRelativeDir)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({ fullPath, relativeDir, filename: entry.name });
    }
  }

  return files;
}

await fs.mkdir(targetRoot, { recursive: true });

const sourceFiles = await collectMarkdownFiles(sourceRoot);
let imported = 0;

for (const sourceFile of sourceFiles) {
  const source = await fs.readFile(sourceFile.fullPath, "utf8");
  const parsed = matter(source);
  const content = normalizeObsidianMarkdown(parsed.content);
  const title = parsed.data.title ?? path.basename(sourceFile.filename, path.extname(sourceFile.filename));
  const stats = await fs.stat(sourceFile.fullPath);
  const type = parsed.data.type ?? inferType(sourceFile.relativeDir, title, content);
  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags
    : inferTags(sourceFile.relativeDir, title, content, type);
  const date = parsed.data.date ?? formatDate(stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime);

  const nextData = {
    title,
    date,
    type,
    summary: parsed.data.summary ?? inferSummary(parsed.content),
    country: parsed.data.country ?? "Japan",
    tags,
    ai_tags: Array.isArray(parsed.data.ai_tags) ? parsed.data.ai_tags : inferAiTags(tags, type),
    season: parsed.data.season ?? inferSeason(content),
    source: "obsidian",
    source_path: path.relative(sourceRoot, sourceFile.fullPath),
    source_updated_at: stats.mtime.toISOString()
  };

  const prefix = sourceFile.relativeDir ? `${slugifyFilename(sourceFile.relativeDir)}-` : "";
  const outputName = `${prefix}${slugifyFilename(title) || "untitled"}.md`;
  const outputPath = path.join(targetRoot, outputName);
  const output = matter.stringify(content, nextData, { lineWidth: 100 });

  await fs.writeFile(outputPath, output);
  imported += 1;
}

console.log(`Imported ${imported} Obsidian files from ${sourceRoot}.`);
