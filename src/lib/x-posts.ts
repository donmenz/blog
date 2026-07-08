import localPosts from "../data/x-posts.json";

export interface XPost {
  id: string;
  text: string;
  url: string;
  createdAt?: string;
}

function isPost(value: unknown): value is XPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Record<string, unknown>;
  return typeof post.id === "string" && typeof post.text === "string" && typeof post.url === "string";
}

export async function getLatestXPosts(limit = 5): Promise<XPost[]> {
  return (Array.isArray(localPosts) ? localPosts : []).filter(isPost).slice(0, limit);
}
