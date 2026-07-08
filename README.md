# 東嬉遊記

An Astro MVP for an Obsidian-first travel knowledge site.

## Local Workflow

```bash
npm install
npm run import:obsidian
npm run tag
npm run validate
npm run build -- --force
npm run dev
```

Real writing lives in `/Users/donmen/obsidian/blog`. Run `npm run import:obsidian` to import a
website-ready copy into `src/content/entries`.

The importer is intentionally one-way:

- It recursively reads publishable Markdown from `/Users/donmen/obsidian/blog/story`.
- It ignores `/Users/donmen/obsidian/blog/draft` and attachments folders.
- It writes stable `slug`, inferred `type`, cross-domain `topics`, `tags`, and `ai_tags` back to
  the Obsidian source frontmatter when missing.
- It writes normalized Markdown into this repo.
- It uses frontmatter, not folder names, as the website information architecture.

Each imported Markdown file is normalized into the site's frontmatter schema. The first local AI
layer is:

```bash
npm run tag
```

It uses local heuristics for now and is designed to be replaced by an OpenAI-powered tagger later.

Recommended update flow:

```bash
npm run import:obsidian
npm run tag
npm run validate
npm run build -- --force
```

Use a different source folder when needed:

```bash
OBSIDIAN_STORY_DIR=/path/to/other/story npm run import:obsidian
```

## Share Cards

Generate image cards from one imported Markdown entry:

```bash
npm run share:cards -- --entry=test
```

The generator writes SVG image files into `public/share-cards`:

- `xhs`: vertical cards for 小红书.
- `x`: horizontal cards for X.

Use `--platform=xhs` or `--platform=x` to export one format, and `--handle=@yourname` to change
the footer watermark. Add `--png` to render upload-ready PNG files with local Chrome:

```bash
npm run share:cards -- --entry=test --platform=xhs --png
```

## Deployment Target

- Content: Obsidian Markdown
- Site: Astro
- Hosting: Cloudflare Pages
- Media now: local `/public/images`
- Media later: Cloudflare R2
