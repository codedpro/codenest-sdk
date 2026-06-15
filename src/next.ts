/**
 * Next.js helpers (App Router). Framework-light: returns plain objects that are
 * structurally assignable to Next's `Metadata` / JSON-LD, so the SDK needs no
 * hard dependency on `next` to build. Import from "@itmaster/sdk/next".
 */
import { heroOf, type PublishedArticle } from "./types.js";

export interface MetadataLike {
  title?: string;
  description?: string;
  alternates?: { canonical?: string };
  openGraph?: Record<string, unknown>;
  twitter?: Record<string, unknown>;
  keywords?: string[];
}

/** Build Next `metadata` for an article page. `siteUrl` is the public origin. */
export function articleMetadata(a: PublishedArticle, opts: { siteUrl: string }): MetadataLike {
  const path = a.canonical_path ?? `/blog/${a.slug}`;
  const canonical = a.url ?? new URL(path, opts.siteUrl).toString();
  const description = a.meta_description ?? a.description ?? a.excerpt;
  const hero = heroOf(a);
  const image = a.og?.image ?? hero?.url;
  return {
    title: a.og?.title ?? a.title,
    description,
    alternates: { canonical },
    keywords: a.secondary_keywords?.length
      ? [a.primary_keyword ?? a.keyword ?? "", ...a.secondary_keywords].filter(Boolean)
      : undefined,
    openGraph: {
      title: a.og?.title ?? a.title,
      description: a.og?.description ?? description,
      type: a.og?.type ?? "article",
      url: canonical,
      images: image ? [{ url: image }] : undefined,
      publishedTime: a.published_at,
      modifiedTime: a.updated_at,
    },
    twitter: {
      card: a.twitter?.card ?? "summary_large_image",
      title: a.twitter?.title ?? a.title,
      description: a.twitter?.description ?? description,
      images: a.twitter?.image ?? image ? [a.twitter?.image ?? image] : undefined,
    },
  };
}

/**
 * JSON-LD for an article. If the engine already supplied `jsonld`, that wins
 * (it's authoritative); otherwise build a sensible Article + FAQPage graph.
 */
export function articleJsonLd(a: PublishedArticle, opts: { siteUrl: string }): unknown {
  if (a.jsonld) return a.jsonld;
  const path = a.canonical_path ?? `/blog/${a.slug}`;
  const canonical = a.url ?? new URL(path, opts.siteUrl).toString();
  const hero = heroOf(a);
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Article",
      headline: a.title,
      description: a.meta_description ?? a.description ?? a.excerpt,
      image: hero?.url ? [hero.url] : undefined,
      datePublished: a.published_at,
      dateModified: a.updated_at ?? a.published_at,
      mainEntityOfPage: canonical,
      author: a.author
        ? { "@type": a.author.type ?? "Person", name: a.author.name, url: a.author.url }
        : undefined,
      keywords: a.primary_keyword ?? a.keyword,
    },
  ];
  if (a.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: a.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * Verify an HMAC-SHA256 push-webhook signature (hex digest of the raw body).
 * Uses Web Crypto so it works in the Edge runtime too. Constant-time compare.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHex || !secret) return false;
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", k, enc.encode(rawBody));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = signatureHex.replace(/^sha256=/, "").toLowerCase();
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
