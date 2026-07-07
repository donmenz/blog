const site = "https://tsu.wang";

export function GET() {
  return new Response(`User-agent: *
Allow: /

Sitemap: ${site}/sitemap-index.xml
`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
