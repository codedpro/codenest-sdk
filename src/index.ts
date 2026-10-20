/**
 * @code-nest/sdk — client for the CodeNest content engine.
 *
 *   import { createClient } from "@code-nest/sdk";
 *   const codenest = createClient({ baseUrl, site, pullKey: process.env.PUBLISH_PULL_KEY! });
 *   const posts = await codenest.listArticles();
 *
 * Next.js helpers (metadata / JSON-LD / webhook) live in "@code-nest/sdk/next".
 */
export { createClient } from "./client.js";
export type { ArticlePage, CodeNestClient, CodeNestClientConfig, ListOptions } from "./client.js";
export {
  heroOf,
  type Author,
  type ContentBlock,
  type ContentPatch,
  type FaqItem,
  type HeroImage,
  type PublishedArticle,
  type PublishedPayload,
  type Redirect,
  type SeoPatch,
  type SiteConfig,
  type SnapshotPage,
  type TocItem,
} from "./types.js";
