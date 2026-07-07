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

- It reads from Obsidian.
- It writes normalized Markdown into this repo.
- It does not modify the Obsidian vault.
- It skips Obsidian app/plugin folders and image folders.

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
OBSIDIAN_BLOG_DIR=/path/to/other/blog npm run import:obsidian
```

## Deployment Target

- Content: Obsidian Markdown
- Site: Astro
- Hosting: Cloudflare Pages
- Media now: local `/public/images`
- Media later: Cloudflare R2
