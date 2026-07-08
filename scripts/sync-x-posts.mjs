import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const username = process.env.X_USERNAME ?? "don_tsua";
const limit = Number(process.env.X_POST_LIMIT ?? 5);
const root = process.cwd();
const outputFile = path.join(root, "src/data/x-posts.json");
const profileDir = process.env.X_BROWSER_PROFILE_DIR ?? path.join(root, ".x-browser-profile");

const chromePaths = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

async function findBrowser() {
  for (const browserPath of chromePaths) {
    try {
      await fs.access(browserPath);
      return browserPath;
    } catch {
      // Try the next known Chromium browser path.
    }
  }
  throw new Error("Could not find Google Chrome, Chrome Canary, or Microsoft Edge in /Applications.");
}

function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\bShow more\b/gi, "")
    .trim();
}

async function collectPosts(page, maxPosts) {
  return page.evaluate((maxPosts) => {
    const seen = new Set();
    const posts = [];

    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const statusLink = [...article.querySelectorAll('a[href*="/status/"]')]
        .map((link) => link.getAttribute("href"))
        .find(Boolean);
      const textNode = article.querySelector('[data-testid="tweetText"]');
      const timeNode = article.querySelector("time");
      const rawText = textNode?.textContent?.trim() ?? "";

      if (!statusLink || !rawText) continue;

      const id = statusLink.match(/status\/(\d+)/)?.[1];
      if (!id || seen.has(id)) continue;

      seen.add(id);
      posts.push({
        id,
        text: rawText,
        url: new URL(statusLink, "https://x.com").toString(),
        createdAt: timeNode?.getAttribute("datetime") ?? undefined
      });

      if (posts.length >= maxPosts) break;
    }

    return posts;
  }, maxPosts);
}

async function waitForTimeline(page) {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const posts = await collectPosts(page, limit);
    if (posts.length > 0) return posts;

    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    if (/Log in|Sign in|登录|登入/.test(bodyText)) {
      console.log("X needs login. Please finish login in the opened browser window...");
    } else {
      console.log("Waiting for X timeline to load...");
    }

    await page.waitForTimeout(5_000);
  }

  return [];
}

async function main() {
  const executablePath = await findBrowser();
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: false,
    viewport: { width: 1280, height: 900 }
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`https://x.com/${username}`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    let posts = await waitForTimeline(page);
    for (let attempts = 0; posts.length < limit && attempts < 4; attempts += 1) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(2_000);
      posts = await collectPosts(page, limit);
    }

    const cleanedPosts = posts.slice(0, limit).map((post) => ({
      ...post,
      text: cleanText(post.text)
    }));

    if (cleanedPosts.length === 0) {
      throw new Error("No X posts were found. Make sure the opened browser is logged in and can view the profile.");
    }

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(`${outputFile}.tmp`, `${JSON.stringify(cleanedPosts, null, 2)}\n`);
    await fs.rename(`${outputFile}.tmp`, outputFile);
    console.log(`Saved ${cleanedPosts.length} X posts to ${path.relative(root, outputFile)}.`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
