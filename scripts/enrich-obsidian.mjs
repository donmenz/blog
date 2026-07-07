import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const sourceRoot = process.env.OBSIDIAN_BLOG_DIR ?? "/Users/donmen/obsidian/blog";
const onlyFile = process.env.OBSIDIAN_FILE;
const ignoredDirs = new Set([".obsidian", "image", "images", "attachments", "附件"]);

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferType(relativeDir, title, content) {
  const haystack = `${relativeDir}\n${title}\n${content.slice(0, 500)}`.toLowerCase();
  if (/温泉|onsen|泉|湯/.test(haystack)) return "onsen";
  if (/机场|航空|航班|机型|airport|aviation/.test(haystack)) return "aviation";
  if (/iphone|trade in|转运|信用卡|银行|返现/.test(haystack)) return "japan_life";
  if (/jr|周游券|pass|乐享|klook|agoda/.test(haystack)) return "travel";
  if (/hotel|酒店|旅馆|住宿/.test(haystack)) return "hotel";
  if (/城市|街区|city|海士町|大阪|天桥立/.test(haystack)) return "city";
  return "travel";
}

function inferTags(relativeDir, title, content, type) {
  const haystack = `${relativeDir}\n${title}\n${content.slice(0, 1000)}`;
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

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function contentHash(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

async function collectMarkdownFiles(dir, relativeDir = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      files.push(...(await collectMarkdownFiles(fullPath, relativePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({ fullPath, relativeDir, relativePath, filename: entry.name });
    }
  }

  return files;
}

const sourceFiles = (await collectMarkdownFiles(sourceRoot)).filter((file) => {
  if (!onlyFile) return true;
  return file.relativePath === onlyFile || file.filename === onlyFile || file.filename === `${onlyFile}.md`;
});

let changed = 0;

for (const sourceFile of sourceFiles) {
  const source = await fs.readFile(sourceFile.fullPath, "utf8");
  const parsed = matter(source);
  const title = parsed.data.title ?? path.basename(sourceFile.filename, path.extname(sourceFile.filename));
  const stats = await fs.stat(sourceFile.fullPath);
  const type = parsed.data.type ?? inferType(sourceFile.relativeDir, title, parsed.content);
  const inferredTags = inferTags(sourceFile.relativeDir, title, parsed.content, type);
  const nextTags = uniq([...(Array.isArray(parsed.data.tags) ? parsed.data.tags : []), ...inferredTags]);
  const nextAiTags = uniq([
    ...(Array.isArray(parsed.data.ai_tags) ? parsed.data.ai_tags : []),
    ...inferAiTags(nextTags, type)
  ]);

  const nextData = {
    ...parsed.data,
    title,
    date: parsed.data.date ?? formatDate(stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime),
    type,
    summary: parsed.data.summary ?? inferSummary(parsed.content),
    country: parsed.data.country ?? "Japan",
    tags: nextTags,
    ai_tags: nextAiTags,
    season: parsed.data.season ?? inferSeason(parsed.content),
    ai_enriched: {
      ...(typeof parsed.data.ai_enriched === "object" && parsed.data.ai_enriched ? parsed.data.ai_enriched : {}),
      content_hash: contentHash(parsed.content),
      updated_at: new Date().toISOString()
    }
  };

  const output = matter.stringify(parsed.content.trimStart(), nextData, { lineWidth: 100 });

  if (output !== source) {
    await fs.writeFile(sourceFile.fullPath, output);
    changed += 1;
    console.log(`Enriched ${sourceFile.relativePath}`);
  }
}

console.log(changed ? `Enriched ${changed} Obsidian files.` : "No Obsidian changes needed.");
