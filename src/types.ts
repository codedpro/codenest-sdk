/**
 * Canonical IT Master publish payloads — the read-side contract a consumer site
 * renders. Mirrors the engine's Article Publish Payload v1.1. Kept dependency-free
 * so any TS project (Next.js or not) can import them.
 */

export interface HeroImage {
  url: string;
  alt?: string;
  source?: string;
}

/** Per-site E-E-A-T byline the engine resolves into the payload. */
export interface Author {
  name: string;
  type?: string;
  jobTitle?: string;
  credentials?: string;
  bio?: string;
  url?: string;
  sameAs?: string[];
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface TocItem {
  text: string;
  id: string;
  level?: number;
}

/** The canonical v1.1 Article Publish Payload (the fields a blog renders). */
export interface PublishedArticle {
  id: string;
  site: string;
  slug: string;
  title: string;
  description?: string;
  meta_description?: string;
  excerpt?: string;
  body_html: string;
  hero_image?: HeroImage | string | null;
  /** Designed cover/OG thumbnail (catchy hook + brand) — use for social/Discover
   *  cards and listing tiles. The clean `hero_image` still leads the article body. */
  cover_image?: HeroImage | null;
  images?: HeroImage[];
  faq?: FaqItem[];
  jsonld?: unknown;
  canonical_path?: string;
  url?: string;
  published_at?: string;
  updated_at?: string;
  word_count?: number;
  reading_time_min?: number;
  status?: "published" | "unpublished";
  keyword?: string;
  primary_keyword?: string;
  secondary_keywords?: string[];
  tags?: string[];
  toc?: TocItem[];
  author?: Author;
  og?: { title?: string; description?: string; image?: string; type?: string };
  twitter?: { card?: string; title?: string; description?: string; image?: string };
  outbound_citations?: { text: string; url: string }[];
  internal_links?: { anchor: string; slug: string; title?: string }[];
  first_party_grounded?: boolean;
  generated_by?: string;
}

/** Back-compat alias for sites that referenced the engine's internal name. */
export type PublishedPayload = PublishedArticle;

export interface Redirect {
  from: string;
  to: string;
  status?: number;
}

/**
 * Dashboard-controlled site config the engine resolves and the SDK pulls from
 * `/config`. An empty config behaves as before (en-GB / index,follow / sane
 * default robots). Mirrors the engine's ResolvedSiteConfig.
 */
export interface SiteConfig {
  /** BCP-47 locale, e.g. "en-GB" (drives hreflang / og:locale). */
  locale: string;
  /** Derived language subtag, e.g. "en" (read-only, from /config). */
  locale_lang?: string;
  robots: {
    mode: "managed" | "custom";
    /** Disallowed paths, e.g. ["/admin","/cart"]. */
    disallow: string[];
    allow: string[];
    /** One toggle for GPTBot/ClaudeBot/PerplexityBot/Google-Extended/CCBot/… */
    ai_crawlers: "allow" | "block";
    /** Crawl-delay directive, 0..60. */
    crawl_delay: number;
    /** Raw robots.txt body when mode==="custom". */
    custom: string;
    /** Extra lines appended in managed mode. */
    extra: string;
  };
  head: {
    verification: { google: string; bing: string; pinterest: string; yandex: string };
    analytics: {
      ga4: string;
      gtm: string;
      plausible_domain: string;
      clarity: string;
      meta_pixel: string;
    };
    /** Raw <meta>/<link>/<script> strings dropped verbatim into <head>. */
    extra_tags: string[];
  };
  meta: {
    /** Title template, must contain %s. */
    title_template: string;
    /** e.g. " | CCTV Line". */
    title_suffix: string;
    default_og_image: string;
    twitter_handle: string;
    favicon: string;
  };
  sitemap: {
    changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
    /** 0..1. */
    priority: number;
    /** Path prefixes dropped from sitemap.xml. */
    exclude: string[];
    /** Derived sitemap URL (read-only, from /config). */
    url?: string;
  };
}

// ── Write-back provider contract (CMS-style sites the engine edits directly) ──

/** One page in a site's inventory, returned by the provider `snapshot` handler. */
export interface SnapshotPage {
  /** Stable identifier the engine addresses the page by (often the slug). */
  slug: string;
  /** Public URL of the page. */
  url?: string;
  /** Route path, e.g. "/blog/foo". */
  path?: string;
  title?: string;
  meta_description?: string;
  /** Last-modified ISO timestamp, so the engine can prioritise stale pages. */
  updated_at?: string;
  /** Page kind hint, e.g. "post" | "page" | "product". */
  type?: string;
  /** Free-form per-page metadata the site wants the engine to see. */
  [extra: string]: unknown;
}

/** SEO-only patch: head/metadata fields the engine wants written, no prose. */
export interface SeoPatch {
  title?: string;
  meta_description?: string;
  canonical?: string;
  og?: { title?: string; description?: string; image?: string; type?: string };
  twitter?: { card?: string; title?: string; description?: string; image?: string };
  /** JSON-LD graph to inject (replaces existing engine-managed JSON-LD). */
  jsonld?: unknown;
}

/** A single prose block the engine rewrote, addressed by a stable anchor. */
export interface ContentBlock {
  /** Stable id/selector the site maps to a DOM block (heading id, data-attr…). */
  anchor: string;
  /** Replacement HTML for that block. */
  html?: string;
  /** Optional plain-text variant when the site stores markdown/prose. */
  text?: string;
}

/** Content patch: one or more prose blocks the engine rewrote. */
export interface ContentPatch {
  blocks: ContentBlock[];
  /** Reason/summary of the rewrite (audit trail). */
  note?: string;
}

/** Resolve a hero image to {url, alt}, tolerating string | object | images[]. */
export function heroOf(a: PublishedArticle): HeroImage | null {
  const h = a.hero_image;
  if (typeof h === "string" && h) return { url: h, alt: a.title };
  if (h && typeof h === "object" && (h as HeroImage).url) return h as HeroImage;
  const first = a.images?.[0];
  return first?.url ? first : null;
}
