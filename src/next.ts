/**
 * Next.js helpers (App Router). Framework-light: returns plain objects that are
 * structurally assignable to Next's `Metadata` / JSON-LD, so the SDK needs no
 * hard dependency on `next` to build. Import from "@itmaster/sdk/next".
 */
import { heroOf, type PublishedArticle, type SiteConfig } from "./types.js";

export interface MetadataLike {
  // Mirrors Next's `Metadata["title"]` (string OR a template object OR null) so a
  // real Next `Metadata` is assignable without a cast at the call site.
  title?: string | { default?: string; template?: string | null; absolute?: string } | null;
  description?: string;
  alternates?: { canonical?: string };
  openGraph?: Record<string, unknown>;
  twitter?: Record<string, unknown>;
  keywords?: string[];
  icons?: { icon?: string };
  // `verification.other` is itself a name→token map (e.g. msvalidate.01,
  // p:domain_verify), so values are `unknown`, matching Next's shape.
  verification?: Record<string, unknown>;
  other?: Record<string, string>;
}

/**
 * The slice of the client a route factory needs. Keeps these helpers usable with
 * a stub/mock — anything structurally matching works (no hard client import).
 */
export interface RouteClient {
  sitemap(): Promise<string | null>;
  rss(): Promise<string | null>;
  llmsTxt(): Promise<string | null>;
  robots(): Promise<string | null>;
  indexnowKey(): Promise<string | null>;
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

// ─────────────────────────────── Drop-in routes ────────────────────────────────
// Each factory returns a plain async handler (typed loosely so the SDK keeps no
// hard `next` dependency). Wire each as a one-line re-export in an App Router
// `route.ts` — see README "Turnkey routes". Responses are the global `Response`
// (Web standard, available in the Node + Edge runtimes Next uses).

/** Build a text/plain (or any content-type) Response, 404 when the feed is null. */
function textResponse(body: string | null, contentType: string): Response {
  if (body == null) return new Response("Not found", { status: 404 });
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

/** GET handler proxying the engine's robots.txt as text/plain. → app/robots.txt/route.ts */
export function createRobotsRoute(client: Pick<RouteClient, "robots">) {
  return async (): Promise<Response> =>
    textResponse(await client.robots(), "text/plain; charset=utf-8");
}

/** GET handler proxying the engine's sitemap.xml. → app/sitemap.xml/route.ts */
export function createSitemapRoute(client: Pick<RouteClient, "sitemap">) {
  return async (): Promise<Response> =>
    textResponse(await client.sitemap(), "application/xml; charset=utf-8");
}

/** GET handler proxying the engine's rss.xml. → app/rss.xml/route.ts */
export function createRssRoute(client: Pick<RouteClient, "rss">) {
  return async (): Promise<Response> =>
    textResponse(await client.rss(), "application/xml; charset=utf-8");
}

/** GET handler proxying the engine's llms.txt. → app/llms.txt/route.ts */
export function createLlmsRoute(client: Pick<RouteClient, "llmsTxt">) {
  return async (): Promise<Response> =>
    textResponse(await client.llmsTxt(), "text/plain; charset=utf-8");
}

/**
 * GET handler returning the IndexNow key as text/plain. Map the route the engine
 * expects (`/<key>.txt`) — e.g. an `app/[key]/route.ts` that calls this, or a
 * rewrite. The body is exactly the key (IndexNow requires the file contents to
 * equal the key).
 */
export function createIndexNowKeyRoute(client: Pick<RouteClient, "indexnowKey">) {
  return async (): Promise<Response> =>
    textResponse(await client.indexnowKey(), "text/plain; charset=utf-8");
}

/** Minimal shape of an inbound webhook request the handler reads. */
interface RequestLike {
  text(): Promise<string>;
  headers: { get(name: string): string | null };
}

export interface WebhookRouteOptions {
  /** The site's push_secret (same value registered with the engine). */
  secret: string;
  /** Called on event==="publish"/"update" with the article payload. */
  onUpsert?: (article: PublishedArticle) => void | Promise<void>;
  /** Called on event==="unpublish"/"delete" with the article payload. */
  onDelete?: (article: PublishedArticle) => void | Promise<void>;
  /**
   * Optional cache-busting hook run after the callback — pass a closure over
   * Next's `revalidatePath`/`revalidateTag` so "publish → live in seconds" works,
   * e.g. `revalidate: (a) => { revalidatePath(`/blog/${a.slug}`); revalidatePath("/blog"); }`.
   */
  revalidate?: (article: PublishedArticle) => void | Promise<void>;
}

/**
 * POST handler for the engine's push webhook. Reads the raw body, verifies the
 * `X-Thoth-Signature` HMAC, parses `{ event, article }`, dispatches to the right
 * callback, then triggers `revalidate`. → app/api/itmaster-webhook/route.ts
 *
 * Returns 401 on bad signature, 400 on malformed body, 200 otherwise.
 */
export function createWebhookRoute(opts: WebhookRouteOptions) {
  const deleteEvents = new Set(["unpublish", "unpublished", "delete", "deleted", "takedown"]);
  return async (req: RequestLike): Promise<Response> => {
    const raw = await req.text();
    const sig = req.headers.get("x-thoth-signature") ?? req.headers.get("X-Thoth-Signature") ?? "";
    if (!(await verifyWebhookSignature(raw, sig, opts.secret))) {
      return new Response("Invalid signature", { status: 401 });
    }
    let body: { event?: string; article?: PublishedArticle };
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }
    const article = body.article;
    if (!article) return new Response("Missing article", { status: 400 });
    const event = (body.event ?? "publish").toLowerCase();
    const isDelete = deleteEvents.has(event) || article.status === "unpublished";
    if (isDelete) await opts.onDelete?.(article);
    else await opts.onUpsert?.(article);
    await opts.revalidate?.(article);
    return Response.json({ ok: true, event, slug: article.slug });
  };
}

// ───────────────────────────── Head tags from config ───────────────────────────

export interface HeadMetaTag {
  name?: string;
  property?: string;
  content: string;
}
export interface HeadLink {
  rel: string;
  href: string;
}
export interface HeadScript {
  src?: string;
  innerHtml?: string;
  /** Next <Script> hint, e.g. "afterInteractive". */
  strategy?: string;
}
export interface HeadTags {
  metaTags: HeadMetaTag[];
  links: HeadLink[];
  scripts: HeadScript[];
}

/**
 * Turn a SiteConfig's verification tokens + analytics IDs + extra_tags + favicon
 * into renderable descriptors the site drops into `app/layout.tsx`. The analytics
 * snippets are the canonical vendor loaders (GA4/GTM/Plausible/Clarity/Meta Pixel).
 * `extra_tags` are raw strings — surface them via `renderHeadHtml` (use
 * `dangerouslySetInnerHTML`) since JSX can't render arbitrary tag markup.
 */
export function headTagsFromConfig(config: SiteConfig): HeadTags {
  const metaTags: HeadMetaTag[] = [];
  const links: HeadLink[] = [];
  const scripts: HeadScript[] = [];

  const v = config.head?.verification ?? ({} as SiteConfig["head"]["verification"]);
  if (v.google) metaTags.push({ name: "google-site-verification", content: v.google });
  if (v.bing) metaTags.push({ name: "msvalidate.01", content: v.bing });
  if (v.pinterest) metaTags.push({ name: "p:domain_verify", content: v.pinterest });
  if (v.yandex) metaTags.push({ name: "yandex-verification", content: v.yandex });

  if (config.meta?.favicon) links.push({ rel: "icon", href: config.meta.favicon });

  const a = config.head?.analytics ?? ({} as SiteConfig["head"]["analytics"]);
  if (a.ga4) {
    scripts.push({ src: `https://www.googletagmanager.com/gtag/js?id=${a.ga4}`, strategy: "afterInteractive" });
    scripts.push({
      strategy: "afterInteractive",
      innerHtml:
        `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
        `gtag('js',new Date());gtag('config','${a.ga4}');`,
    });
  }
  if (a.gtm) {
    scripts.push({
      strategy: "afterInteractive",
      innerHtml:
        `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
        `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
        `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
        `})(window,document,'script','dataLayer','${a.gtm}');`,
    });
  }
  if (a.plausible_domain) {
    scripts.push({
      src: "https://plausible.io/js/script.js",
      strategy: "afterInteractive",
      // data-domain is set via the rendered tag; expose it through innerHtml-free src.
    });
    metaTags.push({ name: "plausible-domain", content: a.plausible_domain });
  }
  if (a.clarity) {
    scripts.push({
      strategy: "afterInteractive",
      innerHtml:
        `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};` +
        `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;` +
        `y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${a.clarity}");`,
    });
  }
  if (a.meta_pixel) {
    scripts.push({
      strategy: "afterInteractive",
      innerHtml:
        `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
        `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
        `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
        `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
        `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
        `fbq('init','${a.meta_pixel}');fbq('track','PageView');`,
    });
  }

  return { metaTags, links, scripts };
}

/** Escape a value for safe insertion into an HTML attribute. */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Ready-to-inject HTML string of all head tags (for non-JSX usage, e.g.
 * `dangerouslySetInnerHTML`). Includes `extra_tags` verbatim — they are
 * operator-authored raw markup from the dashboard.
 */
export function renderHeadHtml(config: SiteConfig): string {
  const { metaTags, links, scripts } = headTagsFromConfig(config);
  const parts: string[] = [];
  for (const m of metaTags) {
    const key = m.name ? `name="${attr(m.name)}"` : `property="${attr(m.property ?? "")}"`;
    parts.push(`<meta ${key} content="${attr(m.content)}">`);
  }
  for (const l of links) parts.push(`<link rel="${attr(l.rel)}" href="${attr(l.href)}">`);
  for (const s of scripts) {
    if (s.src) parts.push(`<script async src="${attr(s.src)}"></script>`);
    if (s.innerHtml) parts.push(`<script>${s.innerHtml}</script>`);
  }
  for (const raw of config.head?.extra_tags ?? []) parts.push(raw);
  return parts.join("\n");
}

/**
 * Merge a SiteConfig's title template/suffix, default OG image, twitter handle and
 * favicon/verification into a Next `Metadata`-like object. Compose with
 * `articleMetadata`: `applyMeta(articleMetadata(a, { siteUrl }), config)`.
 * When `pageTitle` is given it is run through `title_template` (%s) + `title_suffix`.
 */
export function applyMeta(base: MetadataLike, config: SiteConfig, pageTitle?: string): MetadataLike {
  const out: MetadataLike = { ...base };
  const meta = config.meta ?? ({} as SiteConfig["meta"]);

  // Resolve the title: explicit pageTitle wins, else the base title.
  let title = pageTitle ?? (typeof base.title === "string" ? base.title : undefined);
  if (title) {
    if (meta.title_template?.includes("%s")) title = meta.title_template.replace("%s", title);
    else if (meta.title_suffix) title = `${title}${meta.title_suffix}`;
    out.title = title;
  }

  // OG: fall back to the configured default image; keep any base values.
  const baseOg = (base.openGraph ?? {}) as Record<string, unknown>;
  const og: Record<string, unknown> = { ...baseOg };
  if (!og.images && meta.default_og_image) og.images = [{ url: meta.default_og_image }];
  if (Object.keys(og).length) out.openGraph = og;

  // Twitter: site handle + default image.
  const baseTw = (base.twitter ?? {}) as Record<string, unknown>;
  const tw: Record<string, unknown> = { ...baseTw };
  if (!tw.site && meta.twitter_handle) tw.site = meta.twitter_handle;
  if (!tw.images && meta.default_og_image) tw.images = [meta.default_og_image];
  if (Object.keys(tw).length) out.twitter = tw;

  if (meta.favicon) out.icons = { ...(base.icons ?? {}), icon: meta.favicon };

  // Verification tokens (Next renders these into <head> for you). Next exposes
  // `google`/`yandex` directly; everything else (Bing, Pinterest, …) goes under
  // `other` as a name→token map, which Next emits as `<meta name=… content=…>`.
  const v = config.head?.verification;
  if (v) {
    const verification: Record<string, unknown> = { ...(base.verification ?? {}) };
    const other: Record<string, unknown> = { ...((verification.other as Record<string, unknown>) ?? {}) };
    if (v.google) verification.google = v.google;
    if (v.yandex) verification.yandex = v.yandex;
    if (v.bing) other["msvalidate.01"] = v.bing;
    if (v.pinterest) other["p:domain_verify"] = v.pinterest;
    if (Object.keys(other).length) verification.other = other;
    if (Object.keys(verification).length) out.verification = verification;
  }

  return out;
}
