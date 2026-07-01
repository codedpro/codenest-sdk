#!/usr/bin/env node
/**
 * @itmaster/sdk CLI — scaffold a site's engine integration.
 *
 *   npx @itmaster/sdk init                     # interactive
 *   npx @itmaster/sdk init --site karjoo-ai --engine https://itmaster.uk \
 *       --features robots,sitemap,rss,llms,indexnow,webhook --yes
 *
 * Generates ONLY new files (client + the route handlers you pick) + a middleware
 * rewrite + env keys, and prints the snippets for files it must not clobber
 * (layout `<head>`, the blog pages). Safe + idempotent: existing files are skipped
 * unless you pass --force. No dependencies — plain Node + the SDK you already have.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ── feature catalogue ───────────────────────────────────────────────────────
interface Feature {
  key: string;
  label: string;
  /** files this feature writes, as (ctx) => [relPath, contents][] */
  files: (c: Ctx) => Array<[string, string]>;
}

interface Ctx {
  site: string;
  engine: string;
  appDir: string; // "app" | "src/app"
  libImport: string; // "@/lib/itmaster"
}

const ROUTE = (helper: string, importName: string) => (c: Ctx): Array<[string, string]> => [[
  `${c.appDir}/${helper}/route.ts`,
  `import { ${importName} } from "@itmaster/sdk/next";\nimport { itmaster } from "${c.libImport}";\n\n` +
    `// Engine-generated ${helper}. One line — the SDK proxies it from the Pull API.\n` +
    `export const GET = ${importName}(itmaster);\n`,
]];

const FEATURES: Feature[] = [
  { key: "robots", label: "robots.txt", files: ROUTE("robots.txt", "createRobotsRoute") },
  { key: "sitemap", label: "sitemap.xml", files: ROUTE("sitemap.xml", "createSitemapRoute") },
  { key: "rss", label: "rss.xml", files: ROUTE("rss.xml", "createRssRoute") },
  { key: "llms", label: "llms.txt (AI crawlers)", files: ROUTE("llms.txt", "createLlmsRoute") },
  {
    key: "indexnow",
    label: "IndexNow key + rewrite",
    files: (c) => [
      [
        `${c.appDir}/api/indexnow-key/route.ts`,
        `import { createIndexNowKeyRoute } from "@itmaster/sdk/next";\n\n` +
          `// SDK derives the exact key the engine submits (no secret, no round-trip).\n` +
          `// middleware.ts rewrites /{32-hex}.txt here.\n` +
          `export const GET = createIndexNowKeyRoute(process.env.PUBLISH_SITE ?? "${c.site}");\n`,
      ],
      [
        srcMiddlewarePath(c.appDir),
        `import { NextRequest, NextResponse } from "next/server";\n\n` +
          `// IndexNow key file /{32-hex}.txt -> the SDK route.\n` +
          `export function middleware(req: NextRequest) {\n` +
          `  if (/^\\/[a-f0-9]{32}\\.txt$/.test(req.nextUrl.pathname)) {\n` +
          `    return NextResponse.rewrite(new URL("/api/indexnow-key", req.url));\n` +
          `  }\n  return NextResponse.next();\n}\n\n` +
          `export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };\n`,
      ],
    ],
  },
  {
    key: "webhook",
    label: "Push webhook (publish → live in seconds)",
    files: (c) => [[
      `${c.appDir}/api/itmaster-webhook/route.ts`,
      `import { createWebhookRoute } from "@itmaster/sdk/next";\nimport { revalidatePath } from "next/cache";\n\n` +
        `// The engine POSTs here on publish/update/delete (HMAC-verified).\n` +
        `export const POST = createWebhookRoute({\n` +
        `  secret: process.env.PUBLISH_PUSH_SECRET ?? "",\n` +
        `  revalidate: (a) => {\n    revalidatePath(\`/blog/\${a.slug}\`);\n    revalidatePath("/blog");\n  },\n` +
        `});\n`,
    ]],
  },
];

function srcMiddlewarePath(appDir: string): string {
  return appDir.startsWith("src/") ? "src/middleware.ts" : "middleware.ts";
}

// ── client file (always) ─────────────────────────────────────────────────────
function clientFile(c: Ctx): [string, string] {
  const libDir = c.appDir.startsWith("src/") ? "src/lib" : "lib";
  return [
    `${libDir}/itmaster.ts`,
    `import "server-only";\nimport { createClient } from "@itmaster/sdk";\n\n` +
      `/** Shared engine client — one place, used by every route + page. */\n` +
      `export const itmaster = createClient({\n` +
      `  baseUrl: process.env.ITMASTER_API_URL ?? "${c.engine}",\n` +
      `  site: process.env.PUBLISH_SITE ?? "${c.site}",\n` +
      `  pullKey: process.env.PUBLISH_PULL_KEY ?? "",\n` +
      `  // cache: 300, // optional ISR revalidate seconds; default "no-store"\n});\n`,
  ];
}

// ── snippets we print (must not clobber the user's files) ────────────────────
function headSnippet(c: Ctx): string {
  return (
    `// ${c.appDir}/layout.tsx — engine-managed <head> (verification, OG, favicon)\n` +
    `import { applyMeta, headTagsFromConfig } from "@itmaster/sdk/next";\n` +
    `import Script from "next/script";\nimport { itmaster } from "${c.libImport}";\n\n` +
    `const base: import("next").Metadata = { /* your defaults */ };\n\n` +
    `export async function generateMetadata() {\n` +
    `  const config = await itmaster.config().catch(() => null);\n` +
    `  return config ? applyMeta(base, config) : base;\n}\n\n` +
    `// in RootLayout body: render analytics scripts\n` +
    `const scripts = (await itmaster.config().catch(() => null));\n` +
    `// {headTagsFromConfig(config).scripts.map(s => <Script ... />)}\n`
  );
}

function blogSnippet(c: Ctx): string {
  return (
    `// ${c.appDir}/blog/[slug]/page.tsx\n` +
    `import { articleMetadata, articleJsonLd, applyMeta } from "@itmaster/sdk/next";\n` +
    `import { itmaster } from "${c.libImport}";\n\n` +
    `export async function generateMetadata({ params }) {\n` +
    `  const a = await itmaster.getArticle((await params).slug);\n` +
    `  if (!a) return {};\n` +
    `  const cfg = await itmaster.config().catch(() => null);\n` +
    `  const m = articleMetadata(a, { siteUrl: "${c.engine}" });\n` +
    `  return cfg ? applyMeta(m, cfg) : m;\n}\n`
  );
}

// ── env ──────────────────────────────────────────────────────────────────────
function envLines(c: Ctx, withWebhook: boolean): string[] {
  const lines = [
    `ITMASTER_API_URL=${c.engine}`,
    `PUBLISH_SITE=${c.site}`,
    `PUBLISH_PULL_KEY=`,
  ];
  if (withWebhook) lines.push(`PUBLISH_PUSH_SECRET=`);
  return lines;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a && a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function detectAppDir(): string {
  if (existsSync("src/app")) return "src/app";
  if (existsSync("app")) return "app";
  return "app";
}

function write(rel: string, contents: string, force: boolean): "written" | "skipped" {
  if (existsSync(rel) && !force) return "skipped";
  mkdirSync(dirname(rel), { recursive: true });
  writeFileSync(rel, contents, "utf8");
  return "written";
}

function ensureEnv(file: string, lines: string[]): void {
  let existing = "";
  try {
    existing = readFileSync(file, "utf8");
  } catch {
    /* new file */
  }
  const missing = lines.filter((l) => {
    const key = l.split("=")[0];
    return !new RegExp(`^${key}=`, "m").test(existing);
  });
  if (missing.length === 0) return;
  const body = (existing && !existing.endsWith("\n") ? existing + "\n" : existing) +
    (existing ? "\n# @itmaster/sdk\n" : "# @itmaster/sdk\n") +
    missing.join("\n") + "\n";
  writeFileSync(file, body, "utf8");
}

// ── main ─────────────────────────────────────────────────────────────────────
async function init(args: Record<string, string | boolean>): Promise<void> {
  const yes = Boolean(args.yes || args.y);
  const force = Boolean(args.force);
  let site = typeof args.site === "string" ? args.site : "";
  let engine = typeof args.engine === "string" ? args.engine : "";
  let featureKeys = typeof args.features === "string" ? args.features.split(",").map((s) => s.trim()) : [];

  if (!yes) {
    const rl = createInterface({ input, output });
    if (!site) site = (await rl.question("Engine site id (PUBLISH_SITE): ")).trim();
    if (!engine)
      engine = (await rl.question("Engine URL [https://itmaster.uk]: ")).trim() || "https://itmaster.uk";
    if (featureKeys.length === 0) {
      output.write("\nFeatures — answer y/n:\n");
      const picked: string[] = [];
      for (const f of FEATURES) {
        const ans = (await rl.question(`  ${f.label}? [Y/n] `)).trim().toLowerCase();
        if (ans === "" || ans === "y" || ans === "yes") picked.push(f.key);
      }
      featureKeys = picked;
    }
    rl.close();
  }

  if (!site) {
    console.error("✖ a site id is required (--site <id>)");
    process.exit(1);
  }
  engine = engine || "https://itmaster.uk";
  if (featureKeys.length === 0) featureKeys = FEATURES.map((f) => f.key);

  const appDir = detectAppDir();
  const libDir = appDir.startsWith("src/") ? "src/lib" : "lib";
  const ctx: Ctx = { site, engine, appDir, libImport: "@/lib/itmaster" };

  console.log(`\n@itmaster/sdk init — site "${site}" → ${engine}`);
  console.log(`  app dir: ${appDir}  ·  client: ${libDir}/itmaster.ts\n`);

  const results: Array<[string, string]> = [];
  const [clientPath, clientBody] = clientFile(ctx);
  results.push([clientPath, write(clientPath, clientBody, force)]);

  const chosen = FEATURES.filter((f) => featureKeys.includes(f.key));
  for (const f of chosen) {
    for (const [rel, body] of f.files(ctx)) results.push([rel, write(rel, body, force)]);
  }

  for (const [rel, status] of results) {
    console.log(`  ${status === "written" ? "✚ wrote " : "• skipped"} ${rel}`);
  }

  const withWebhook = featureKeys.includes("webhook");
  ensureEnv(".env.local", envLines(ctx, withWebhook));
  ensureEnv(".env.example", envLines(ctx, withWebhook));
  console.log(`  ✚ env keys ensured in .env.local + .env.example (fill PULL_KEY)\n`);

  console.log("Next, wire the two files the CLI won't overwrite:\n");
  console.log(headSnippet(ctx));
  console.log(blogSnippet(ctx));
  console.log("Then, from the engine, connect Google (zero-click):");
  console.log(
    `  curl -X POST "${engine}/v1/publish/sites/${site}/connect/google/auto" -H "Authorization: Bearer <INTERNAL_TOKEN>"\n`,
  );
  console.log("Docs: https://github.com/codedpro/itmaster-sdk#readme\n");
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === "init") return init(args);
  console.log(
    "@itmaster/sdk\n\n" +
      "Usage:\n" +
      "  npx @itmaster/sdk init [--site <id>] [--engine <url>] [--features a,b,c] [--yes] [--force]\n\n" +
      "Features: " + FEATURES.map((f) => f.key).join(", ") + "\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
