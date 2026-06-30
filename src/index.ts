/**
 * @itmaster/sdk — client for the IT Master content engine.
 *
 *   import { createClient } from "@itmaster/sdk";
 *   const itmaster = createClient({ baseUrl, site, pullKey: process.env.PUBLISH_PULL_KEY! });
 *   const posts = await itmaster.listArticles();
 *
 * Next.js helpers (metadata / JSON-LD / webhook) live in "@itmaster/sdk/next".
 */
export { createClient } from "./client.js";
export type { ArticlePage, ItmasterClient, ItmasterClientConfig, ListOptions } from "./client.js";
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
