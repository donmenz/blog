import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import {
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
  normalizeObsidianMarkdown,
  shouldPublish,
  slugify,
  uniq
} from "./obsidian-metadata.mjs";

const sourceRoot = process.env.OBSIDIAN_STORY_DIR ?? process.env.OBSIDIAN_BLOG_DIR ?? defaultStoryRoot;
const targetRoot = fileURLToPath(new URL("../src/content/entries", import.meta.url));

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
      files.push({ fullPath, relativeDir, relativePath, filename: entry.name });
    }
  }

  return files;
}

async function readExistingObsidianSlugs() {
  const entries = await fs.readdir(targetRoot, { withFileTypes: true }).catch(() => []);
  const bySourcePath = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const fullPath = path.join(targetRoot, entry.name);
    const source = await fs.readFile(fullPath, "utf8");
    const parsed = matter(source);

    if (parsed.data.source !== "obsidian" || !parsed.data.source_path) continue;
    const existingSlug = parsed.data.slug ?? path.basename(entry.name, ".md");
    bySourcePath.set(parsed.data.source_path, slugify(existingSlug));
  }

  return bySourcePath;
}

async function removeStaleEntries(activeOutputNames) {
  const entries = await fs.readdir(targetRoot, { withFileTypes: true }).catch(() => []);
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    if (activeOutputNames.has(entry.name)) continue;

    const fullPath = path.join(targetRoot, entry.name);
    await fs.unlink(fullPath);
    removed += 1;
    console.log(`Removed stale entry ${entry.name}`);
  }

  return removed;
}

await fs.mkdir(targetRoot, { recursive: true });

const existingSlugs = await readExistingObsidianSlugs();
const sourceFiles = await collectMarkdownFiles(sourceRoot);
const usedSlugs = new Set();
const activeOutputNames = new Set();
let imported = 0;
let skipped = 0;
let sourceUpdated = 0;

for (const sourceFile of sourceFiles) {
  const source = await fs.readFile(sourceFile.fullPath, "utf8");
  const parsed = matter(source);

  if (!shouldPublish(parsed.data)) {
    skipped += 1;
    continue;
  }

  const content = normalizeObsidianMarkdown(parsed.content);
  const title = parsed.data.title ?? path.basename(sourceFile.filename, path.extname(sourceFile.filename));
  const stats = await fs.stat(sourceFile.fullPath);
  const sourcePath = path.relative(sourceRoot, sourceFile.fullPath);
  const preservedSlug = parsed.data.slug ?? existingSlugs.get(sourcePath);
  let slug = makeSlug({
    existingSlug: preservedSlug,
    title,
    filename: sourceFile.filename,
    relativePath: sourceFile.relativePath,
    content
  });

  if (usedSlugs.has(slug)) {
    slug = `${slug}-${sourcePath.length.toString(36)}`;
  }
  usedSlugs.add(slug);

  const type = parsed.data.type ?? inferType(sourceFile.relativePath, title, content);
  const inferredTags = inferTags(sourceFile.relativePath, title, content, type);
  const tags = uniq([...(Array.isArray(parsed.data.tags) ? parsed.data.tags : []), ...inferredTags]);
  const topics = uniq([...(Array.isArray(parsed.data.topics) ? parsed.data.topics : []), ...inferTopics(tags, type)]);
  const date = parsed.data.date ?? formatDate(stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime);
  const aiTags = uniq([
    ...(Array.isArray(parsed.data.ai_tags) ? parsed.data.ai_tags : []),
    ...inferAiTags(tags, type)
  ]);

  const sourceData = {
    ...parsed.data,
    title,
    slug,
    date,
    type,
    topics,
    tags,
    ai_tags: aiTags,
    summary: parsed.data.summary ?? inferSummary(parsed.content),
    country: parsed.data.country ?? "Japan",
    season: parsed.data.season ?? inferSeason(content)
  };

  const sourceOutput = matter.stringify(parsed.content.trimStart(), sourceData, { lineWidth: 100 });
  if (sourceOutput !== source) {
    await fs.writeFile(sourceFile.fullPath, sourceOutput);
    sourceUpdated += 1;
    console.log(`Updated source metadata ${sourceFile.relativePath}`);
  }

  const siteData = {
    ...sourceData,
    source: "obsidian",
    source_path: sourcePath,
    source_updated_at: stats.mtime.toISOString()
  };

  const outputName = `${slug}.md`;
  const outputPath = path.join(targetRoot, outputName);
  const output = matter.stringify(content, siteData, { lineWidth: 100 });

  await fs.writeFile(outputPath, output);
  activeOutputNames.add(outputName);
  imported += 1;
}

const removed = await removeStaleEntries(activeOutputNames);

console.log(
  `Imported ${imported} Obsidian story files from ${sourceRoot}. ` +
    `Updated ${sourceUpdated} source files, skipped ${skipped}, removed ${removed} stale entries.`
);
