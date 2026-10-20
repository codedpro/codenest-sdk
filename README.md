# @code-nest/sdk

**Client SDK for [CodeNest](https://code-nest.dev) — the AI SEO content engine.**
CodeNest writes, cross-model–validates and publishes expert articles that rank on
Google and get cited by AI search. This SDK connects any **Next.js** site to it: pull
those articles and serve turnkey **sitemap, RSS, `llms.txt`, JSON-LD, IndexNow,
metadata and webhook** helpers.

> **Status (2026-10-20): not on npm yet.** The `@code-nest` npm organisation does not exist,
> so this package is `"private"` and `npm install @code-nest/sdk` does not work yet. Sites use
> **`@itmaster/sdk` 0.4.x** today (the same API under the old names); it verifies the
> legacy `X-Thoth-Signature` the engine still sends beside `X-CodeNest-Signature`.

- **Typed Pull API client** — `listArticles`, `getArticle`, incremental mirror (`listArticlesPage`).
- **Next.js App Router helpers** — article `Metadata`, `Article`/`FAQ` JSON-LD, OG/Twitter tags.
- **Turnkey SEO routes** — one-line `robots.txt`, `sitemap.xml`, `rss.xml`, `llms.txt`, IndexNow key.
- **Push webhooks and SEO patches** — HMAC-verified, live in seconds.
- **Provider (write-back) mode** — HMAC-signed contract for CMS-style sites.
- **Zero runtime deps**, ESM, full `.d.ts` types. `next` is an optional peer.

## Install

```bash
npm install @code-nest/sdk
```

## Quickstart

```bash
npx @code-nest/sdk init --site <PUBLISH_SITE> --engine https://code-nest.dev \
  --features robots,sitemap,rss,llms,indexnow,webhook --yes
```

```
✚ wrote  lib/codenest.ts
✚ wrote  app/robots.txt/route.ts
✚ wrote  app/api/indexnow-key/route.ts
✚ wrote  middleware.ts
✚ wrote  app/api/codenest-webhook/route.ts
✚ env keys ensured in .env.local + .env.example (fill PULL_KEY)
```

```ts
// lib/codenest.ts (server-only)
import "server-only";
import { createClient } from "@code-nest/sdk";

export const codenest = createClient({
  baseUrl: process.env.CODENEST_API_URL!,    // the pull API origin
  site: process.env.PUBLISH_SITE!,           // your site id
  pullKey: process.env.PUBLISH_PULL_KEY!,    // per-site key (server only)
});
```

```ts
// app/api/codenest-webhook/route.ts — publish/takedown → revalidate
import { createWebhookRoute } from "@code-nest/sdk/next";
import { revalidatePath } from "next/cache";
export const POST = createWebhookRoute({
  secret: process.env.PUBLISH_PUSH_SECRET!,
  revalidate: (a) => { revalidatePath(`/blog/${a.slug}`); revalidatePath("/blog"); },
});
```

```ts
// app/api/codenest-seo-patch/route.ts — the engine's title/meta/JSON-LD/prose patches
import { createSeoPatchRoute } from "@code-nest/sdk/next";
import { revalidatePath } from "next/cache";
export const POST = createSeoPatchRoute({
  secret: process.env.CODENEST_PATCH_SECRET!,   // same value as your push_secret
  applySeoPatch: async (patch) => { await db.saveMeta(patch.path!, patch.fields ?? {}); },
  revalidate: (paths) => paths.forEach((p) => revalidatePath(p)),
});
```

The rest of the surface (`articleMetadata`, `articleJsonLd`, `applyMeta`,
`headTagsFromConfig`, the feed routes, `createIndexNowKeyRoute`,
`createProviderRoutes`) is unchanged from `@itmaster/sdk`.

## Verification

Every push, patch and provider request is signed: a hex HMAC-SHA256 of the raw
body, keyed by your site's secret. This package reads the signature from
**`X-CodeNest-Signature`**, and still accepts the legacy **`X-Thoth-Signature`**,
so a site verifies through the engine's whole move from one header name to the
other. A request passes when either header carries a valid signature; a bad or
missing one is a 401 before your handler runs. The event is read from
`X-CodeNest-Event`, else `X-Thoth-Event`.

The IndexNow key derivation is unchanged: `deriveIndexNowKey(site)` returns the
same key as before, so verification files never change.

## Moving from @itmaster/sdk

1. `npm install @code-nest/sdk && npm uninstall @itmaster/sdk`.
2. Replace `@itmaster/sdk` with `@code-nest/sdk` in imports; the `ItmasterClient`
   types are `CodeNestClient` / `CodeNestClientConfig`.
3. Add `app/api/codenest-webhook/route.ts` and `app/api/codenest-seo-patch/route.ts`
   (the same handlers as your `itmaster-*` routes) and keep the old routes until
   CodeNest confirms your site has moved to the new ones.
4. Rename `ITMASTER_API_URL` to `CODENEST_API_URL` (and `ITMASTER_PATCH_SECRET` to
   `CODENEST_PATCH_SECRET`) and point it at `https://code-nest.dev`.

## License

[MIT](./LICENSE) © CodeNest.
