import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const entryTypes = ["travel", "onsen", "hotel", "city", "aviation", "japan_life"] as const;
const seasons = ["spring", "summer", "autumn", "winter", "unknown"] as const;

const entries = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/entries" }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    date: z.coerce.date(),
    type: z.enum(entryTypes),
    topics: z.array(z.string()).default([]),
    summary: z.string(),
    country: z.string().default("Japan"),
    region: z.string().optional(),
    prefecture: z.string().optional(),
    city: z.string().optional(),
    tags: z.array(z.string()).default([]),
    ai_tags: z.array(z.string()).default([]),
    rating: z.number().min(1).max(10).optional(),
    visited_date: z.union([z.string(), z.date()]).optional(),
    season: z.enum(seasons).default("unknown"),
    hero_image: z.string().optional(),
    geo: z
      .object({
        lat: z.number().optional(),
        lng: z.number().optional()
      })
      .optional(),
    media: z
      .object({
        images: z.array(z.string()).default([]),
        video: z.string().optional()
      })
      .default({ images: [] }),
    external_links: z.array(z.string()).default([])
  })
});

export const collections = { entries };
