import type { PublishedArticle, Redirect } from "./types.js";

/**
 * Read-only client for the IT Master Pull API (`/v1/publish/{site}/…`). A site is
 * just a tenant: it pulls finished articles with its per-site bearer key. Server-
 * side only — never ship the pull key to the browser.
 */
export interface ItmasterClientConfig {
  /** Engine base URL, e.g. https://itmaster.uk or http://127.0.0.1:8088 */
  baseUrl: string;
  /** Publishing site slug (the TargetSite id registered in the engine). */
  site: string;
  /** Per-site pull key (POST /v1/publish/sites issues it). */
  pullKey: string;
  /** Override fetch (tests / custom runtimes). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Caching for the underlying fetch. Default "no-store" (always fresh). Pass a
   * number to use Next.js ISR (`next: { revalidate }`) instead.
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

export interface ItmasterClient {
  /** Whether a pull key is configured (else every call returns empty/null). */
  readonly configured: boolean;
  /** Live articles, newest first; tombstones filtered out unless requested. */
  listArticles(opts?: ListOptions): Promise<PublishedArticle[]>;
  /** One article by slug, or null if missing / taken down. */
  getArticle(slug: string): Promise<PublishedArticle | null>;
  /** Derived feeds (raw text): sitemap.xml, rss.xml, llms.txt. */
  sitemap(): Promise<string | null>;
  rss(): Promise<string | null>;
  llmsTxt(): Promise<string | null>;
  /** Managed redirects for the site. */
  redirects(): Promise<Redirect[]>;
  /** Escape hatch: any Pull-API subpath as JSON. */
  raw<T>(path: string): Promise<T | null>;
  rawText(path: string): Promise<string | null>;
}

function fetchInit(cache: RequestCache | number | undefined, key: string): RequestInit {
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: { Authorization: `Bearer ${key}` },
  };
  if (typeof cache === "number") init.next = { revalidate: cache };
  else init.cache = cache ?? "no-store";
  return init;
}

export function createClient(config: ItmasterClientConfig): ItmasterClient {
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

  async function listArticles(opts: ListOptions = {}): Promise<PublishedArticle[]> {
    const params = new URLSearchParams();
    params.set("limit", String(opts.limit ?? 100));
    if (opts.since) params.set("since", opts.since);
    const data = await raw<{ articles?: PublishedArticle[] }>(`/articles?${params.toString()}`);
    let articles = data?.articles ?? [];
    if (!opts.includeTombstones) articles = articles.filter((a) => a.status !== "unpublished");
    articles.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    return articles;
  }

  async function getArticle(slug: string): Promise<PublishedArticle | null> {
    const a = await raw<PublishedArticle>(`/articles/${encodeURIComponent(slug)}`);
    if (!a || a.status === "unpublished") return null;
    return a;
  }

  return {
    configured,
    listArticles,
    getArticle,
    sitemap: () => rawText("/sitemap.xml"),
    rss: () => rawText("/rss.xml"),
    llmsTxt: () => rawText("/llms.txt"),
    async redirects() {
      const data = await raw<{ redirects?: Redirect[] }>("/redirects");
      return data?.redirects ?? [];
    },
    raw,
    rawText,
  };
}
