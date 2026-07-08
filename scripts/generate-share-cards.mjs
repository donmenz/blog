import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import matter from "gray-matter";

const root = fileURLToPath(new URL("..", import.meta.url));
const entriesRoot = path.join(root, "src/content/entries");
const outputRoot = path.join(root, "public/share-cards");

const platforms = {
  xhs: {
    label: "小红书",
    width: 1242,
    height: 1660,
    margin: 96,
    titleSize: 58,
    bodySize: 38,
    lineHeight: 1.52,
    paragraphGap: 28,
    fillRatio: 0.84,
    pageLimit: 8
  },
  x: {
    label: "X",
    width: 1600,
    height: 900,
    margin: 88,
    titleSize: 58,
    bodySize: 34,
    lineHeight: 1.42,
    paragraphGap: 22,
    fillRatio: 0.78,
    pageLimit: 6
  }
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    return [key, value || true];
  })
);

const requestedEntry = args.get("entry");
const requestedPlatform = args.get("platform");
const handle = String(args.get("handle") || "@dongxi.voyage");
const shouldRenderPng = args.has("png");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function slugify(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}^[\]`]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[[^\]]+]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "· ")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/#([^#\s][^\s#]*)/g, "#$1 ");
}

function markdownBlocks(markdown) {
  const clean = stripMarkdown(markdown);
  const blocks = [];

  for (const rawBlock of clean.split(/\n{2,}/)) {
    const text = rawBlock
      .split("\n")
      .map((line) => line.replace(/^#{1,6}\s*/, "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) blocks.push(text);
  }

  return blocks;
}

function charWeight(char) {
  if (/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) return 1;
  if (/[A-Z0-9]/.test(char)) return 0.64;
  if (/\s/.test(char)) return 0.34;
  return 0.52;
}

function wrapText(text, maxUnits) {
  const lines = [];
  let line = "";
  let units = 0;

  for (const char of [...text]) {
    const weight = charWeight(char);
    if (units + weight > maxUnits && line.trim()) {
      lines.push(line.trim());
      line = char;
      units = weight;
    } else {
      line += char;
      units += weight;
    }
  }

  if (line.trim()) lines.push(line.trim());
  return lines;
}

function measureBlock(block, platform) {
  const maxUnits = Math.floor((platform.width - platform.margin * 2) / (platform.bodySize * 0.96));
  const lines = wrapText(block, maxUnits);
  return {
    text: block,
    lines,
    height: lines.length * platform.bodySize * platform.lineHeight + platform.paragraphGap
  };
}

function paginate(blocks, platform) {
  const pages = [];
  const maxContentHeight = (platform.height - platform.margin * 2 - 230) * platform.fillRatio;
  let page = [];
  let pageHeight = 0;

  for (const block of blocks.map((item) => measureBlock(item, platform))) {
    if (page.length && pageHeight + block.height > maxContentHeight) {
      pages.push(page);
      page = [];
      pageHeight = 0;
    }

    page.push(block);
    pageHeight += block.height;

    if (pages.length + 1 >= platform.pageLimit && pageHeight > maxContentHeight * 0.86) break;
  }

  if (page.length) pages.push(page);
  return pages;
}

function textLines(lines, x, startY, size, lineHeight, fill = "#1f2933", weight = 500) {
  return lines
    .map((line, index) => {
      const y = startY + index * size * lineHeight;
      return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`;
    })
    .join("\n");
}

function cardSvg({ entry, platform, page, pageIndex, pageCount }) {
  const titleLines = wrapText(entry.title, platform.width < 1300 ? 16 : 22).slice(0, 2);
  const titleHeight = titleLines.length * platform.titleSize * 1.16;
  const contentTop = platform.margin + titleHeight + 108;
  let y = contentTop;

  const body = page
    .map((block) => {
      const rendered = textLines(
        block.lines,
        platform.margin,
        y,
        platform.bodySize,
        platform.lineHeight
      );
      y += block.height;
      return rendered;
    })
    .join("\n");

  const date = entry.date ? new Date(entry.date).toISOString().slice(0, 10) : "";
  const tagText = [entry.type, ...(entry.tags || [])].filter(Boolean).slice(0, 4).join(" / ");
  const pageMark = `${String(pageIndex + 1).padStart(2, "0")} / ${String(pageCount).padStart(2, "0")}`;
  const bottom = platform.height - platform.margin + 8;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${platform.width}" height="${platform.height}" viewBox="0 0 ${platform.width} ${platform.height}">
  <rect width="100%" height="100%" fill="#f7efe3"/>
  <rect x="${platform.margin / 2}" y="${platform.margin / 2}" width="${platform.width - platform.margin}" height="${platform.height - platform.margin}" rx="34" fill="#fffaf1" stroke="#d7b98a" stroke-width="3"/>
  <circle cx="${platform.width - platform.margin * 1.25}" cy="${platform.margin * 1.18}" r="48" fill="#d9462f" opacity="0.92"/>
  <circle cx="${platform.width - platform.margin * 1.8}" cy="${platform.margin * 1.1}" r="18" fill="#2f6f73" opacity="0.9"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', sans-serif">
    <text x="${platform.margin}" y="${platform.margin}" font-size="26" font-weight="700" fill="#2f6f73" letter-spacing="0">${escapeXml(platform.label)}分享卡</text>
    ${textLines(titleLines, platform.margin, platform.margin + 72, platform.titleSize, 1.16, "#20201d", 800)}
    <line x1="${platform.margin}" y1="${contentTop - 50}" x2="${platform.width - platform.margin}" y2="${contentTop - 50}" stroke="#d7b98a" stroke-width="2"/>
    ${body}
    <text x="${platform.margin}" y="${bottom}" font-size="25" font-weight="650" fill="#8a6042">${escapeXml(handle)}</text>
    <text x="${platform.margin}" y="${bottom - 40}" font-size="22" fill="#9a7a5f">${escapeXml([date, tagText].filter(Boolean).join(" · "))}</text>
    <text x="${platform.width - platform.margin}" y="${bottom}" font-size="25" font-weight="700" text-anchor="end" fill="#8a6042">${pageMark}</text>
  </g>
</svg>
`;
}

async function renderPng(svgPath, pngPath, platform) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const page = await browser.newPage({
    viewport: { width: platform.width, height: platform.height },
    deviceScaleFactor: 1
  });

  await page.goto(pathToFileURL(svgPath).href);
  await page.screenshot({
    path: pngPath,
    clip: { x: 0, y: 0, width: platform.width, height: platform.height },
    omitBackground: false
  });
  await browser.close();
}

async function findEntry() {
  const files = (await fs.readdir(entriesRoot)).filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));
  if (!files.length) throw new Error(`No Markdown entries found in ${entriesRoot}`);

  if (requestedEntry) {
    const exact = files.find((file) => file === requestedEntry || path.basename(file, path.extname(file)) === requestedEntry);
    if (!exact) throw new Error(`Cannot find entry "${requestedEntry}".`);
    return exact;
  }

  return files.sort()[0];
}

const entryFile = await findEntry();
const entryPath = path.join(entriesRoot, entryFile);
const source = await fs.readFile(entryPath, "utf8");
const parsed = matter(source);
const entry = {
  title: parsed.data.title ?? path.basename(entryFile, path.extname(entryFile)),
  date: parsed.data.date,
  type: parsed.data.type,
  tags: parsed.data.tags,
  body: parsed.content
};

const selectedPlatforms = requestedPlatform
  ? [[requestedPlatform, platforms[requestedPlatform]]]
  : Object.entries(platforms);

for (const [platformId, platform] of selectedPlatforms) {
  if (!platform) throw new Error(`Unknown platform "${requestedPlatform}". Use xhs or x.`);

  const blocks = markdownBlocks(entry.body);
  const pages = paginate(blocks, platform);
  const outputDir = path.join(outputRoot, platformId, slugify(path.basename(entryFile, path.extname(entryFile))));
  await fs.mkdir(outputDir, { recursive: true });

  for (const [pageIndex, page] of pages.entries()) {
    const svg = cardSvg({ entry, platform, page, pageIndex, pageCount: pages.length });
    const outputPath = path.join(outputDir, `${String(pageIndex + 1).padStart(2, "0")}.svg`);
    await fs.writeFile(outputPath, svg);

    if (shouldRenderPng) {
      await renderPng(outputPath, outputPath.replace(/\.svg$/, ".png"), platform);
    }
  }

  const suffix = shouldRenderPng ? " SVG+PNG" : "";
  console.log(`Generated ${pages.length} ${platformId}${suffix} card(s): ${path.relative(root, outputDir)}`);
}
