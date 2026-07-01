# @itmaster/sdk

[![npm version](https://img.shields.io/npm/v/@itmaster/sdk.svg)](https://www.npmjs.com/package/@itmaster/sdk)
[![license: MIT](https://img.shields.io/npm/l/@itmaster/sdk.svg)](./LICENSE)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-%E2%89%A514-black.svg)](https://nextjs.org/)
[![ESM](https://img.shields.io/badge/module-ESM-f7df1e.svg)](https://nodejs.org/api/esm.html)

**Official client SDK for [IT Master](https://itmaster.uk) — the AI SEO content engine.**
IT Master writes, cross-model–validates and publishes expert articles that **rank on
Google and get cited by AI search** (ChatGPT, Perplexity, AI Overviews). This SDK
connects any **Next.js** site to it: pull those articles and serve turnkey
**sitemap, RSS, `llms.txt`, JSON-LD, IndexNow, metadata and webhook** helpers — no
re-implementing the Pull API or rendering layer per site. See
[how it works](https://itmaster.uk/how-it-works) · [pricing](https://itmaster.uk/pricing).

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
npm install /path/to/itmaster-sdk-0.2.0.tgz
# or a path dependency (sibling repos):
npm install file:../itmaster/itmaster-sdk
```
</details>

## Quickstart — the `init` CLI

Scaffold a site's integration by selecting features — it writes only **new** files
(client + the routes you pick + middleware), adds the env keys, and prints the two
snippets it won't overwrite (`layout.tsx` `<head>` and the blog pages). `src/app` is
auto-detected; existing files are skipped unless `--force`.

```bash
npx @itmaster/sdk init                 # interactive (y/n per feature)
# or non-interactive:
npx @itmaster/sdk init \
  --site <PUBLISH_SITE> --engine https://itmaster.uk \
  --features robots,sitemap,rss,llms,indexnow,webhook --yes
```

```
✚ wrote  lib/itmaster.ts
✚ wrote  app/robots.txt/route.ts
✚ wrote  app/api/indexnow-key/route.ts
✚ wrote  middleware.ts
✚ wrote  app/api/itmaster-webhook/route.ts
✚ env keys ensured in .env.local + .env.example (fill PULL_KEY)
```

Then fill `PUBLISH_PULL_KEY`, wire the two printed snippets, and connect Google
(see the end). The sections below are what the CLI generates — reference them to do
it by hand or to understand each piece.

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
// app/api/indexnow-key/route.ts — IndexNow ownership proof (no secret, no round-trip)
import { createIndexNowKeyRoute } from "@itmaster/sdk/next";
// Pass the engine site id (single-tenant) or a resolver (multi-tenant, from host).
// The SDK DERIVES the exact key the engine submits, so only your key resolves.
export const GET = createIndexNowKeyRoute(process.env.PUBLISH_SITE ?? "your-site");

// middleware.ts — rewrite the /{key}.txt request to the route
import { NextRequest, NextResponse } from "next/server";
export function middleware(req: NextRequest) {
  if (/^\/[a-f0-9]{32}\.txt$/.test(req.nextUrl.pathname))
    return NextResponse.rewrite(new URL("/api/indexnow-key", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
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

Head tags + metadata from the dashboard `site_config`. Emit **verification/OG/favicon
via the Metadata API** (`applyMeta` in `generateMetadata`) and **analytics via
`next/script`** — those are the only paths that actually render into `<head>` in the
App Router:

```tsx
// app/layout.tsx
import { applyMeta, headTagsFromConfig } from "@itmaster/sdk/next";
import Script from "next/script";
import { itmaster } from "@/lib/itmaster";

const base: import("next").Metadata = { title: { default: "…", template: "%s · …" } };

export async function generateMetadata() {
  const config = await itmaster.config().catch(() => null);
  return config ? applyMeta(base, config) : base;   // verification + OG + favicon
}

export default async function RootLayout({ children }) {
  const config = await itmaster.config().catch(() => null);
  const scripts = config ? headTagsFromConfig(config).scripts : [];   // GA4/GTM/Plausible/…
  return (
    <html>
      <body>
        {children}
        {scripts.map((s, i) =>
          s.src ? <Script key={i} src={s.src} strategy="afterInteractive" />
                : <Script key={i} id={`a${i}`} strategy="afterInteractive"
                          dangerouslySetInnerHTML={{ __html: s.innerHtml ?? "" }} />)}
      </body>
    </html>
  );
}
```

> ⚠️ Do **not** render the tags via `<head><Fragment dangerouslySetInnerHTML></head>`
> — a Fragment has no DOM node, so nothing reaches `<head>`. Use `applyMeta` +
> `next/script` as above. (`renderHeadHtml` remains for non-App-Router/SSR string use.)

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
| `@itmaster/sdk/next` | `articleMetadata`, `articleJsonLd`, `applyMeta`, `headTagsFromConfig`, `renderHeadHtml`, `deriveIndexNowKey`, `createRobotsRoute`/`createSitemapRoute`/`createRssRoute`/`createLlmsRoute`/`createIndexNowKeyRoute`, `createWebhookRoute`, `verifyWebhookSignature` |
| `@itmaster/sdk/provider` | `createProviderRoutes` (HMAC write-back contract) |
| `npx @itmaster/sdk init` | CLI scaffolder (client + routes + middleware + env) |

## Connect Google (zero-click)

Once the head + IndexNow routes are live, one engine call verifies the site in Search
Console, submits the sitemap, and turns on indexing:

```bash
curl -X POST "https://itmaster.uk/v1/publish/sites/<site>/connect/google/auto" \
  -H "Authorization: Bearer <INTERNAL_TOKEN>"
```

| feature | needs |
| --- | --- |
| verification meta / analytics | `config()` working ⇒ **pull key set** |
| IndexNow | the key route + middleware rewrite (**no pull key**) |
| Google Indexing | site connected (service account + indexing scope) |
| instant publish | webhook route + engine `push_url` / `push_secret` |
| articles at all | engine generating content for the site (automation on) |

## Build

```bash
npm install && npm run build   # → dist/ (ESM + .d.ts)
```

## Learn more

- **How it works** — [how IT Master's cross-model content pipeline works](https://itmaster.uk/how-it-works): the discovery → research → generation → validation → publish flow behind every article this SDK pulls.
- **Docs** — [full IT Master SDK documentation](https://itmaster.uk/docs): route recipes, the `init` CLI, and the complete Pull-API + `<head>` reference.
- **Pricing** — [IT Master pricing and plans](https://itmaster.uk/pricing): pay-as-you-publish tiers for connecting your site to the engine.
- **See the output** — [SEO-optimized articles on the IT Master blog](https://itmaster.uk/blog): live examples of what the engine generates and this SDK renders.
- **Home** — [IT Master, the AI content engine](https://itmaster.uk): what it is, who it's for, and why rival models inspect every article.

**This package everywhere:** [@itmaster/sdk on npm](https://www.npmjs.com/package/@itmaster/sdk) · [source on GitHub (codedpro/itmaster-sdk)](https://github.com/codedpro/itmaster-sdk) · [report an issue](https://github.com/codedpro/itmaster-sdk/issues)

## License

[MIT](./LICENSE) © IT Master.
