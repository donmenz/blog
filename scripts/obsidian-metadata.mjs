import crypto from "node:crypto";
import path from "node:path";

export const defaultVaultRoot = "/Users/donmen/obsidian/blog";
export const defaultStoryRoot = path.join(defaultVaultRoot, "story");
export const ignoredDirs = new Set([".obsidian", "image", "images", "attachments", "附件", "draft"]);

export const typeLabels = {
  travel: "杂记",
  onsen: "温泉",
  hotel: "酒店",
  city: "城市",
  aviation: "交通",
  japan_life: "日本生活"
};

export function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

export function slugify(value) {
  return `${value ?? ""}`
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}^[\]`]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function contentHash(content, length = 8) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, length);
}

export function makeSlug({ existingSlug, title, filename, relativePath, content }) {
  if (existingSlug) return slugify(existingSlug);

  const base =
    slugify(title) ||
    slugify(path.basename(filename ?? "", path.extname(filename ?? ""))) ||
    slugify(path.basename(relativePath ?? "", path.extname(relativePath ?? "")));

  if (base) return base;
  return `entry-${contentHash(`${relativePath ?? ""}\n${content ?? ""}`)}`;
}

export function inferType(relativePath, title, content) {
  const haystack = `${relativePath}\n${title}\n${content.slice(0, 500)}`.toLowerCase();
  if (/温泉|onsen|泉|湯/.test(haystack)) return "onsen";
  if (/机场|航空|航班|机型|airport|aviation/.test(haystack)) return "aviation";
  if (/iphone|trade in|转运|信用卡|银行|返现/.test(haystack)) return "japan_life";
  if (/jr|周游券|pass|乐享|klook|agoda|公交|地铁|车程|交通/.test(haystack)) return "travel";
  if (/hotel|酒店|旅馆|住宿/.test(haystack)) return "hotel";
  if (/城市|街区|city|海士町|大阪|天桥立/.test(haystack)) return "city";
  return "travel";
}

export function inferTags(relativePath, title, content, type) {
  const haystack = `${relativePath}\n${title}\n${content.slice(0, 1000)}`;
  const tags = new Set(["日本旅行"]);

  if (type === "hotel") tags.add("酒店");
  if (type === "onsen") tags.add("温泉");
  if (type === "aviation") tags.add("航空");
  if (type === "city") tags.add("城市观察");
  if (type === "japan_life") tags.add("日本生活");

  if (/北海道|札幌|函馆|小樽/.test(haystack)) tags.add("北海道");
  if (/大阪|关西|天桥立|京都/.test(haystack)) tags.add("关西");
  if (/东京|羽田|成田|新宿|涩谷/.test(haystack)) tags.add("东京");
  if (/JR|周游券|PASS|pass|乐享|Klook|Agoda|公交|地铁/i.test(haystack)) tags.add("交通");
  if (/JR|周游券|PASS|pass/i.test(haystack)) tags.add("JR Pass");
  if (/折扣|优惠|返现|白嫖|套利|代金券/.test(haystack)) tags.add("优惠攻略");

  return [...tags];
}

export function inferTopics(tags, type) {
  const topics = new Set();
  if (typeLabels[type]) topics.add(typeLabels[type]);

  const topicTags = {
    温泉: "温泉",
    酒店: "酒店",
    航空: "交通",
    交通: "交通",
    "JR Pass": "交通",
    城市观察: "城市",
    日本生活: "杂记"
  };

  for (const tag of tags) {
    if (topicTags[tag]) topics.add(topicTags[tag]);
  }

  return [...topics];
}

export function inferAiTags(tags, type) {
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

export function inferSummary(content) {
  const text = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 120) || "待补充摘要。";
}

export function inferSeason(content) {
  if (/冬|雪|winter/i.test(content)) return "winter";
  if (/春|樱|spring/i.test(content)) return "spring";
  if (/秋|红叶|autumn|fall/i.test(content)) return "autumn";
  if (/夏|祭|summer/i.test(content)) return "summer";
  return "unknown";
}

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function normalizeObsidianMarkdown(content) {
  return content.replace(/```table-of-contents\s*```/g, "").trimStart();
}

export function shouldPublish(data) {
  return data.published !== false && data.draft !== true;
}
