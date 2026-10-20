import type { PublishedArticle, Redirect, SiteConfig } from "./types.js";

/**
 * Read-only client for the CodeNest Pull API (`/v1/publish/{site}/…`). A site is
 * just a tenant: it pulls finished articles with its per-site bearer key. Server-
 * side only — never ship the pull key to the browser.
 */
export interface CodeNestClientConfig {
  /** Engine base URL, e.g. https://code-nest.dev or http://127.0.0.1:8088 */
  baseUrl: string;
  /** Publishing site slug (the TargetSite id registered in the engine). */
  site: string;
  /** Per-site pull key (POST /v1/publish/sites issues it). */
  pullKey: string;
  /** Override fetch (tests / custom runtimes). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Caching for the underlying fetch, in seconds of `next: { revalidate }`.
   *
   * Defaults to 300. It deliberately does NOT default to `"no-store"`: a
   * no-store fetch opts the CALLING ROUTE out of static rendering, so any page
   * that reads the feed — a blog index, a sitemap, a root layout reading
   * `config()` — flips from static to dynamic at runtime. Next 16 treats that
   * as an error: pages with a prerender on disk quietly serve stale build-time
   * HTML, and pages without one return a hard 500. This engine's own marketing
   * site shipped exactly that bug and served 500s on /blog.
   *
   * Pass `"no-store"` explicitly if a route genuinely must not cache. Takedowns
   * do not need it — the push webhook calls `revalidatePath`.
   */
  cache?: RequestCache | number;
}

export interface ListOptions {
  limit?: number;
  /** Include tombstones (status==="unpublished") so a mirror can delete pages. */
  includeTombstones?: boolean;
  /** Incremental feed: only articles changed since this ISO timestamp. */
  since?: string;
}

/** One page of the incremental article feed (follows `next_since` cursor). */
export interface ArticlePage {
  articles: PublishedArticle[];
  /** Cursor to pass as `since` next poll, or null when caught up. */
  next_since: string | null;
}

export interface CodeNestClient {
  /** Whether a pull key is configured (else every call returns empty/null). */
  readonly configured: boolean;
  /** Live articles, newest first; tombstones filtered out unless requested. */
  listArticles(opts?: ListOptions): Promise<PublishedArticle[]>;
  /**
   * One page of the raw incremental feed (unsorted, tombstones included) plus the
   * `next_since` cursor — for mirrors that follow the engine's change feed.
   */
  listArticlesPage(opts?: ListOptions): Promise<ArticlePage>;
  /** One article by slug, or null if missing / taken down. */
  getArticle(slug: string): Promise<PublishedArticle | null>;
  /** Derived feeds (raw text): sitemap.xml, rss.xml, llms.txt, robots.txt. */
  sitemap(): Promise<string | null>;
  rss(): Promise<string | null>;
  llmsTxt(): Promise<string | null>;
  /** Engine-generated robots.txt (managed/custom per site_config). */
  robots(): Promise<string | null>;
  /** The site's IndexNow key (serve at /<key>.txt). */
  indexnowKey(): Promise<string | null>;
  /** Dashboard-controlled site config (locale, robots, head tags, meta, sitemap). */
  config(): Promise<SiteConfig | null>;
  /** Topical clusters: { cluster: { pillar: slug|null, spokes: slug[] } }. */
  clusters(): Promise<Record<string, { pillar: string | null; spokes: string[] }> | null>;
  /** Managed redirects for the site. */
  redirects(): Promise<Redirect[]>;
  /** Escape hatch: any Pull-API subpath as JSON. */
  raw<T>(path: string): Promise<T | null>;
  rawText(path: string): Promise<string | null>;
}

/** Seconds. See `CodeNestClientConfig.cache` for why this is not "no-store". */
const DEFAULT_REVALIDATE = 300;

function fetchInit(cache: RequestCache | number | undefined, key: string): RequestInit {
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: { Authorization: `Bearer ${key}` },
  };
  if (typeof cache === "number") init.next = { revalidate: cache };
  else if (cache !== undefined) init.cache = cache;
  else init.next = { revalidate: DEFAULT_REVALIDATE };
  return init;
}

export function createClient(config: CodeNestClientConfig): CodeNestClient {
  const base = config.baseUrl.replace(/\/$/, "");
  const site = config.site;
  const key = config.pullKey ?? "";
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const configured = Boolean(key && base && site);

  function url(path: string): string {
    return `${base}/v1/publish/${encodeURIComponent(site)}${path}`;
  }

  async function rawText(path: string): Promise<string | null> {
    if (!configured) return null;
    try {
      const res = await doFetch(url(path), fetchInit(config.cache, key));
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  async function raw<T>(path: string): Promise<T | null> {
    const text = await rawText(path);
    if (text == null) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  async function listArticlesPage(opts: ListOptions = {}): Promise<ArticlePage> {
    const params = new URLSearchParams();
    params.set("limit", String(opts.limit ?? 100));
    if (opts.since) params.set("since", opts.since);
    const data = await raw<{ articles?: PublishedArticle[]; next_since?: string | null }>(
      `/articles?${params.toString()}`,
    );
    return { articles: data?.articles ?? [], next_since: data?.next_since ?? null };
  }

  async function listArticles(opts: ListOptions = {}): Promise<PublishedArticle[]> {
    const { articles } = await listArticlesPage(opts);
    let out = articles;
    if (!opts.includeTombstones) out = out.filter((a) => a.status !== "unpublished");
    out.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    return out;
  }

  async function getArticle(slug: string): Promise<PublishedArticle | null> {
    const a = await raw<PublishedArticle>(`/articles/${encodeURIComponent(slug)}`);
    if (!a || a.status === "unpublished") return null;
    return a;
  }

  return {
    configured,
    listArticles,
    listArticlesPage,
    getArticle,
    sitemap: () => rawText("/sitemap.xml"),
    rss: () => rawText("/rss.xml"),
    llmsTxt: () => rawText("/llms.txt"),
    robots: () => rawText("/robots.txt"),
    indexnowKey: () => rawText("/indexnow-key"),
    config: () => raw<SiteConfig>("/config"),
    clusters: () => raw<Record<string, { pillar: string | null; spokes: string[] }>>("/clusters"),
    async redirects() {
      // Tolerate both shapes: { redirects } OR a bare array.
      const data = await raw<{ redirects?: Redirect[] } | Redirect[]>("/redirects");
      if (Array.isArray(data)) return data;
      return data?.redirects ?? [];
    },
    raw,
    rawText,
  };
}
