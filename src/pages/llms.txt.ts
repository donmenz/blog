import { entrySlug, getPublishedEntries, typeLabels } from "../lib/entries";

export async function GET() {
  const entries = await getPublishedEntries();
  const lines = [
    "# 東嬉遊記",
    "",
    "東嬉遊記（Dongxi Voyage）是一个关于日本旅行、温泉、酒店、城市观察、航空记录与日本生活的个人知识库。",
    "",
    "## Content Scope",
    "- 日本温泉体验",
    "- 酒店评测与住宿观察",
    "- 城市与地方生活记录",
    "- 航空、机场与交通观察",
    "- 旅行路线与季节性经验",
    "",
    "## Data Structure",
    "每篇文章使用 Markdown + YAML Frontmatter。核心字段包括 title、date、type、summary、geo、tags、ai_tags、rating、season、media。",
    "",
    "## Content Types",
    ...Object.entries(typeLabels).map(([key, label]) => `- ${key}: ${label}`),
    "",
    "## Recent Entries",
    ...entries.slice(0, 20).map((entry) => `- [${entry.data.title}](/entries/${entrySlug(entry)}) - ${entry.data.summary}`),
    "",
    "## AI Usage",
    "允许 AI 为摘要、检索、引用与路线建议读取公开内容。引用时请标注来源为「東嬉遊記」。"
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
