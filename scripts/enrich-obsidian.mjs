import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  contentHash,
  defaultStoryRoot,
  formatDate,
  ignoredDirs,
  inferAiTags,
  inferSeason,
  inferSummary,
  inferTags,
  inferTopics,
  inferType,
  makeSlug,
  shouldPublish,
  uniq
} from "./obsidian-metadata.mjs";

const sourceRoot = process.env.OBSIDIAN_STORY_DIR ?? process.env.OBSIDIAN_BLOG_DIR ?? defaultStoryRoot;
const onlyFile = process.env.OBSIDIAN_FILE;

async function collectMarkdownFiles(dir, relativeDir = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      files.push(...(await collectMarkdownFiles(fullPath, relativePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({ fullPath, relativePath, filename: entry.name });
    }
  }

  return files;
}

const sourceFiles = (await collectMarkdownFiles(sourceRoot)).filter((file) => {
  if (!onlyFile) return true;
  return file.relativePath === onlyFile || file.filename === onlyFile || file.filename === `${onlyFile}.md`;
});

let changed = 0;
let skipped = 0;

for (const sourceFile of sourceFiles) {
  const source = await fs.readFile(sourceFile.fullPath, "utf8");
  const parsed = matter(source);

  if (!shouldPublish(parsed.data)) {
    skipped += 1;
    continue;
  }

  const title = parsed.data.title ?? path.basename(sourceFile.filename, path.extname(sourceFile.filename));
  const stats = await fs.stat(sourceFile.fullPath);
  const slug = makeSlug({
    existingSlug: parsed.data.slug,
    title,
    filename: sourceFile.filename,
    relativePath: sourceFile.relativePath,
    content: parsed.content
  });
  const type = parsed.data.type ?? inferType(sourceFile.relativePath, title, parsed.content);
  const inferredTags = inferTags(sourceFile.relativePath, title, parsed.content, type);
  const nextTags = uniq([...(Array.isArray(parsed.data.tags) ? parsed.data.tags : []), ...inferredTags]);
  const nextTopics = uniq([
    ...(Array.isArray(parsed.data.topics) ? parsed.data.topics : []),
    ...inferTopics(nextTags, type)
  ]);
  const nextAiTags = uniq([
    ...(Array.isArray(parsed.data.ai_tags) ? parsed.data.ai_tags : []),
    ...inferAiTags(nextTags, type)
  ]);

  const nextData = {
    ...parsed.data,
    title,
    slug,
    date: parsed.data.date ?? formatDate(stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime),
    type,
    topics: nextTopics,
    summary: parsed.data.summary ?? inferSummary(parsed.content),
    country: parsed.data.country ?? "Japan",
    tags: nextTags,
    ai_tags: nextAiTags,
    season: parsed.data.season ?? inferSeason(parsed.content),
    ai_enriched: {
      ...(typeof parsed.data.ai_enriched === "object" && parsed.data.ai_enriched ? parsed.data.ai_enriched : {}),
      content_hash: contentHash(parsed.content, 16),
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

console.log(
  changed
    ? `Enriched ${changed} Obsidian story files. Skipped ${skipped}.`
    : `No Obsidian changes needed. Skipped ${skipped}.`
);
