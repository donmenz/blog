import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const root = fileURLToPath(new URL("../src/content/entries", import.meta.url));
const required = ["title", "date", "type", "summary", "tags", "ai_tags"];
const allowedTypes = new Set(["travel", "onsen", "hotel", "city", "aviation", "japan_life"]);

const files = (await fs.readdir(root)).filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));
const errors = [];

for (const file of files) {
  const fullPath = path.join(root, file);
  const source = await fs.readFile(fullPath, "utf8");
  const { data } = matter(source);

  for (const field of required) {
    if (data[field] == null) errors.push(`${file}: missing ${field}`);
  }

  if (data.type && !allowedTypes.has(data.type)) {
    errors.push(`${file}: invalid type "${data.type}"`);
  }

  if (data.rating != null && (Number(data.rating) < 1 || Number(data.rating) > 10)) {
    errors.push(`${file}: rating must be between 1 and 10`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${files.length} content files.`);
