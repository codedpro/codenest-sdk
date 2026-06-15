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

/** Resolve a hero image to {url, alt}, tolerating string | object | images[]. */
export function heroOf(a: PublishedArticle): HeroImage | null {
  const h = a.hero_image;
  if (typeof h === "string" && h) return { url: h, alt: a.title };
  if (h && typeof h === "object" && (h as HeroImage).url) return h as HeroImage;
  const first = a.images?.[0];
  return first?.url ? first : null;
}
