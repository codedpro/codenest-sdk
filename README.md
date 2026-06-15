# @itmaster/sdk

Client SDK for the **IT Master** content engine. Use this in any standalone
Next.js site instead of re-implementing the Pull API + rendering helpers.

> **Full integration guide (all stacks + both models):**
> [docs/integrations/custom-website-integration.md](../docs/integrations/custom-website-integration.md)

> The 9 Fabric‑Commerce tenants do **not** use this — they receive optimizations
> via Fabric's provider endpoints. This SDK is for **independent** sites that pull
> and display IT Master content (e.g. itmaster.uk, ai.ukvision.co.uk).

## Install (local, pre‑registry)

```bash
# from a packed tarball (portable across repos):
npm install /path/to/itmaster-sdk-0.1.0.tgz
# or a path dependency (sibling repos):
npm install file:../itmaster/itmaster-sdk
```

Once a registry exists: `npm publish` here, then `npm install @itmaster/sdk`.

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

Feeds: `itmaster.sitemap()`, `.rss()`, `.llmsTxt()`, `.redirects()`.
Push webhooks: `verifyWebhookSignature(rawBody, sigHeader, secret)` from `@itmaster/sdk/next`.

## Build

```bash
npm install && npm run build   # → dist/ (ESM + .d.ts)
```
