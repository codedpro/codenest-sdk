/**
 * Write-back provider contract (CMS-style sites the engine edits directly).
 * Import from "@code-nest/sdk/provider".
 *
 * The engine calls a site's provider endpoints to read a page inventory and push
 * SEO/content patches back into the site's CMS. This module is a SCAFFOLD: it
 * gives you well-typed, HMAC-verified route handlers and leaves CMS-specific
 * writes to you (look for the `TODO` markers in the handlers you implement).
 *
 * Contract the engine speaks (mount under `app/api/external/[slug]/…`):
 *   GET  /api/external/{slug}/health      -> { ok: true, ... }
 *   GET  /api/external/{slug}/snapshot    -> SnapshotPage[]            (page inventory)
 *   POST /api/external/{slug}/seo-patch   -> apply a SeoPatch
 *   POST /api/external/{slug}/content     -> apply a ContentPatch
 *   POST /api/external/{slug}/revalidate  -> purge caches for the page
 *
 * Every POST is HMAC-verified (`X-CodeNest-Signature`, same scheme as the push
 * webhook) before any handler runs. Framework-light: handlers return the Web
 * `Response`, so the SDK keeps no hard `next` dependency.
 */
import { verifyWebhookSignature } from "./next.js";
import { signaturesOf } from "./signed.js";
import type { ContentPatch, SeoPatch, SnapshotPage } from "./types.js";

export type { ContentBlock, ContentPatch, SeoPatch, SnapshotPage } from "./types.js";

/** Outcome a write handler returns; `ok:false` surfaces a 4xx/5xx to the engine. */
export interface ProviderResult {
  ok: boolean;
  /** Optional machine code, e.g. "not_found", "skipped". */
  code?: string;
  /** Human-readable detail (logged engine-side). */
  message?: string;
  /** Anything else the engine should see (e.g. the new URL). */
  [extra: string]: unknown;
}

/**
 * The CMS-specific writes you implement. All optional — an unimplemented handler
 * responds 501 so you can ship incrementally (e.g. SEO patches before content).
 */
export interface ProviderHandlers {
  /** Return the page inventory the engine prioritises against. */
  snapshot?(slug: string): SnapshotPage[] | Promise<SnapshotPage[]>;
  /** Write a head/metadata-only patch (title, meta, OG, JSON-LD) — no prose. */
  applySeoPatch?(slug: string, patch: SeoPatch): ProviderResult | Promise<ProviderResult>;
  /** Write rewritten prose blocks back into the page body. */
  applyContent?(slug: string, patch: ContentPatch): ProviderResult | Promise<ProviderResult>;
  /** Purge caches / ISR for the page after a write. */
  revalidate?(slug: string): ProviderResult | Promise<ProviderResult>;
  /** Extra health detail merged into the GET /health response. */
  health?(slug: string): Record<string, unknown> | Promise<Record<string, unknown>>;
}

export interface ProviderRouteOptions {
  /** Shared secret the engine signs requests with (the site's connector secret). */
  secret: string;
  handlers: ProviderHandlers;
}

/** Minimal inbound-request shape the handlers read (Web `Request`-compatible). */
interface RequestLike {
  text(): Promise<string>;
  headers: { get(name: string): string | null };
}

/** The five handlers, each a plain async fn `(req, slug) => Response`. */
export interface ProviderRoutes {
  health(req: RequestLike, slug: string): Promise<Response>;
  snapshot(req: RequestLike, slug: string): Promise<Response>;
  seoPatch(req: RequestLike, slug: string): Promise<Response>;
  content(req: RequestLike, slug: string): Promise<Response>;
  revalidate(req: RequestLike, slug: string): Promise<Response>;
}

function notImplemented(what: string): Response {
  return Response.json({ ok: false, code: "not_implemented", message: `${what} not implemented` }, { status: 501 });
}

function resultResponse(r: ProviderResult): Response {
  return Response.json(r, { status: r.ok ? 200 : (typeof r.status === "number" ? r.status : 400) });
}

/**
 * Build the provider route handlers. Wire each into an App Router `route.ts` —
 * see README "Provider (write-back) mode". POST handlers verify the HMAC over the
 * raw body before dispatching; bad signatures get a 401, malformed JSON a 400.
 */
export function createProviderRoutes(opts: ProviderRouteOptions): ProviderRoutes {
  const { secret, handlers } = opts;

  /** Read raw body, verify signature, parse JSON. Returns the parsed body or a Response to short-circuit. */
  async function verified<T>(req: RequestLike): Promise<{ body: T } | { error: Response }> {
    const raw = await req.text();
    // Any signature header this build reads (names.ts) may carry the HMAC.
    let ok = false;
    for (const sig of signaturesOf(req.headers)) {
      if ((ok = await verifyWebhookSignature(raw, sig, secret))) break;
    }
    if (!ok) {
      return { error: new Response("Invalid signature", { status: 401 }) };
    }
    try {
      return { body: (raw ? JSON.parse(raw) : {}) as T };
    } catch {
      return { error: new Response("Bad JSON", { status: 400 }) };
    }
  }

  return {
    async health(_req, slug) {
      // GET — unauthenticated liveness probe (no secret leaked, no writes).
      const extra = (await handlers.health?.(slug)) ?? {};
      return Response.json({ ok: true, slug, ...extra });
    },

    async snapshot(_req, slug) {
      // GET — page inventory. TODO: implement handlers.snapshot to enumerate pages.
      if (!handlers.snapshot) return notImplemented("snapshot");
      const pages = await handlers.snapshot(slug);
      return Response.json({ slug, pages });
    },

    async seoPatch(req, slug) {
      if (!handlers.applySeoPatch) return notImplemented("seo-patch");
      const v = await verified<SeoPatch>(req);
      if ("error" in v) return v.error;
      // TODO (site author): write v.body's title/meta/og/jsonld into your CMS.
      return resultResponse(await handlers.applySeoPatch(slug, v.body));
    },

    async content(req, slug) {
      if (!handlers.applyContent) return notImplemented("content");
      const v = await verified<ContentPatch>(req);
      if ("error" in v) return v.error;
      // TODO (site author): apply each block (anchor → block) to the page body.
      return resultResponse(await handlers.applyContent(slug, v.body));
    },

    async revalidate(req, slug) {
      if (!handlers.revalidate) return notImplemented("revalidate");
      const v = await verified<unknown>(req);
      if ("error" in v) return v.error;
      // TODO (site author): purge ISR/CDN for this page (e.g. revalidatePath).
      return resultResponse(await handlers.revalidate(slug));
    },
  };
}
