# @itmaster/sdk

[![npm version](https://img.shields.io/npm/v/@itmaster/sdk.svg)](https://www.npmjs.com/package/@itmaster/sdk)
[![license: MIT](https://img.shields.io/npm/l/@itmaster/sdk.svg)](./LICENSE)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-%E2%89%A514-black.svg)](https://nextjs.org/)
[![ESM](https://img.shields.io/badge/module-ESM-f7df1e.svg)](https://nodejs.org/api/esm.html)

**Official client SDK for the [IT Master](https://github.com/codedpro/itmaster-sdk) AI content engine.**
Pull SEO-optimized, AI-generated articles into any standalone **Next.js** site —
with turnkey **sitemap, RSS, `llms.txt`, JSON-LD, IndexNow, metadata and webhook**
helpers — instead of re-implementing the Pull API + rendering layer in every site.

> The Fabric-Commerce tenants do **not** use this — they receive optimizations via
> Fabric's provider endpoints. This SDK is for **independent** sites that pull and
> display IT Master content (e.g. `itmaster.uk`, `ai.ukvision.co.uk`).

## Features

- **Typed Pull API client** — `listArticles`, `getArticle`, incremental mirror (`listArticlesPage`).
- **Next.js App Router helpers** — article `Metadata`, `Article`/`FAQ` **JSON-LD**, OG/Twitter tags.
- **Turnkey SEO routes** — one-line `robots.txt`, `sitemap.xml`, `rss.xml`, `llms.txt`, IndexNow key.
- **Dashboard-controlled `<head>`** — title templates, favicons, verification + analytics tags from `site_config`.
- **Push webhooks** — HMAC-verified publish/takedown → `revalidatePath`, live in seconds.
- **Provider (write-back) mode** — HMAC-signed contract for CMS-style sites the engine edits directly.
- **Zero runtime deps**, ESM, ships full `.d.ts` types. `next` is an optional peer.

## Install

```bash
npm install @itmaster/sdk
# or: pnpm add @itmaster/sdk   /   yarn add @itmaster/sdk
```

<details>
<summary>Pre-registry / offline installs</summary>

```bash
# straight from GitHub (builds on install):
npm install github:codedpro/itmaster-sdk
# from a packed tarball:
npm install /path/to/itmaster-sdk-0.1.1.tgz
# or a path dependency (sibling repos):
npm install file:../itmaster/itmaster-sdk
```
</details>

## Use

```ts
// lib/itmaster.ts (server-only)
import "server-only";
import { createClient } from "@itmaster/sdk";

export const itmaster = createClient({
  baseUrl: process.env.ITMASTER_API_URL!,   // engine origin
  site: process.env.PUBLISH_SITE!,           // your TargetSite slug
  pullKey: process.env.PUBLISH_PULL_KEY!,    // per-site key (server only)
});
```

```ts
// app/blog/page.tsx
const posts = await itmaster.listArticles({ limit: 50 });

// app/blog/[slug]/page.tsx
import { articleMetadata, articleJsonLd } from "@itmaster/sdk/next";
const a = await itmaster.getArticle(slug);
export const generateMetadata = () => articleMetadata(a!, { siteUrl: "https://itmaster.uk" });
const ld = articleJsonLd(a!, { siteUrl: "https://itmaster.uk" });
```

Feeds: `itmaster.sitemap()`, `.rss()`, `.llmsTxt()`, `.robots()`, `.redirects()`.
Site config: `itmaster.config()`, `.clusters()`, `.indexnowKey()`.
Incremental mirror: `itmaster.listArticlesPage({ since })` → `{ articles, next_since }`.
Push webhooks: `verifyWebhookSignature(rawBody, sigHeader, secret)` from `@itmaster/sdk/next`.

## Turnkey routes (drop-in, dashboard-controlled)

Wire these one-line re-exports and the whole site is controlled from the engine
dashboard — robots, feeds, head tags, IndexNow and "publish → live in seconds".

```ts
// app/robots.txt/route.ts
import { createRobotsRoute } from "@itmaster/sdk/next";
import { itmaster } from "@/lib/itmaster";
export const GET = createRobotsRoute(itmaster);

// app/sitemap.xml/route.ts
import { createSitemapRoute } from "@itmaster/sdk/next";
import { itmaster } from "@/lib/itmaster";
export const GET = createSitemapRoute(itmaster);

// app/rss.xml/route.ts   — createRssRoute(itmaster)
// app/llms.txt/route.ts  — createLlmsRoute(itmaster)
```

```ts
// app/[key]/route.ts  (or a rewrite to /<key>.txt) — IndexNow ownership proof
import { createIndexNowKeyRoute } from "@itmaster/sdk/next";
import { itmaster } from "@/lib/itmaster";
export const GET = createIndexNowKeyRoute(itmaster);
```

```ts
// app/api/itmaster-webhook/route.ts — publish/takedown → revalidate
import { createWebhookRoute } from "@itmaster/sdk/next";
import { revalidatePath } from "next/cache";
export const POST = createWebhookRoute({
  secret: process.env.PUBLISH_PUSH_SECRET!,
  revalidate: (a) => { revalidatePath(`/blog/${a.slug}`); revalidatePath("/blog"); },
  // onUpsert / onDelete are optional if you only rely on revalidation.
});
```

Head tags + metadata from the dashboard `site_config`:

```tsx
// app/layout.tsx
import { headTagsFromConfig, renderHeadHtml } from "@itmaster/sdk/next";
import { itmaster } from "@/lib/itmaster";

export default async function RootLayout({ children }) {
  const config = await itmaster.config();
  return (
    <html lang={config?.locale_lang ?? "en"}>
      <head>
        {config && <Fragment dangerouslySetInnerHTML={{ __html: renderHeadHtml(config) }} />}
        {/* or render headTagsFromConfig(config) as <meta>/<link>/<Script> */}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

```ts
// app/blog/[slug]/page.tsx — compose article metadata with the site config
import { articleMetadata, applyMeta } from "@itmaster/sdk/next";
const config = await itmaster.config();
let meta = articleMetadata(a!, { siteUrl });
if (config) meta = applyMeta(meta, config);   // title template/suffix, OG, twitter, favicon
export const generateMetadata = () => meta;
```

## Provider (write-back) mode

For CMS-style sites the engine edits directly, mount the provider contract under
`app/api/external/[slug]/…`. Implement only the handlers you need — the rest
answer `501`. Every POST is HMAC-verified (`X-Thoth-Signature`).

```ts
// app/api/external/[slug]/_routes.ts
import { createProviderRoutes } from "@itmaster/sdk/provider";
export const routes = createProviderRoutes({
  secret: process.env.PROVIDER_SECRET!,
  handlers: {
    snapshot: async (slug) => [/* SnapshotPage[] — your page inventory */],
    applySeoPatch: async (slug, patch) => { /* TODO write title/meta/og/jsonld */ return { ok: true }; },
    applyContent: async (slug, patch) => { /* TODO apply prose blocks */ return { ok: true }; },
    revalidate: async (slug) => { /* TODO purge ISR/CDN */ return { ok: true }; },
  },
});

// app/api/external/[slug]/snapshot/route.ts
import { routes } from "../_routes";
export const GET = (req: Request, ctx: { params: Promise<{ slug: string }> }) =>
  ctx.params.then(({ slug }) => routes.snapshot(req, slug));
// …and health/route.ts, seo-patch/route.ts, content/route.ts, revalidate/route.ts likewise.
```

## API surface

| Import | Exports |
| --- | --- |
| `@itmaster/sdk` | `createClient`, types (`PublishedArticle`, `SiteConfig`, `Redirect`, …) |
| `@itmaster/sdk/next` | `articleMetadata`, `articleJsonLd`, `applyMeta`, `renderHeadHtml`, `headTagsFromConfig`, `create*Route`, `createWebhookRoute`, `verifyWebhookSignature` |
| `@itmaster/sdk/provider` | `createProviderRoutes` (HMAC write-back contract) |

## Build

```bash
npm install && npm run build   # → dist/ (ESM + .d.ts)
```

## License

[MIT](./LICENSE) © IT Master.
