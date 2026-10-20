/**
 * @code-nest/sdk (packages/sdk): what a site depends on.
 *
 *   npm test       # builds dist/, then runs this file
 *
 * The engine (CodeNest) signs every push and patch with one HMAC sent as
 * X-CodeNest-Signature, and as the legacy X-Thoth-Signature while sites move
 * over; the SDK verifies either, reads X-CodeNest-Event before X-Thoth-Event,
 * scaffolds codenest names, and keeps the IndexNow salt (renaming it would
 * break every site's key file). No network is used.
 *
 * Moved from the itmaster repo's itmaster-sdk/ (its codenest variant became
 * this source; itmaster plan §9.41).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const load = (mod) => import(pathToFileURL(join(dist, `${mod}.js`)).href);
const SECRET = "s3cret";
const sign = (body, secret = SECRET) => createHmac("sha256", secret).update(body, "utf8").digest("hex");

/** A Web-standard request (case-insensitive headers). */
function req(body, headers = {}) {
  return { text: async () => body, headers: new Headers(headers) };
}

/** A RequestLike whose `get` is case-SENSITIVE, as a hand-rolled one may be. */
function strictReq(body, headers = {}) {
  return { text: async () => body, headers: { get: (n) => (n in headers ? headers[n] : null) } };
}

const ARTICLE = JSON.stringify({ event: "upsert", article: { slug: "a", title: "A" } });

async function webhook(request) {
  const { createWebhookRoute } = await load("next");
  const seen = [];
  const route = createWebhookRoute({ secret: SECRET, onUpsert: (a) => seen.push(a.slug) });
  const res = await route(request);
  return { status: res.status, seen };
}

test("verifies X-CodeNest-Signature or X-Thoth-Signature", async () => {
  const good = sign(ARTICLE);
  const bad = sign(ARTICLE, "other");
  const cases = [
    [{ "X-CodeNest-Signature": good }, 200],
    [{ "X-Thoth-Signature": good }, 200],
    [{ "X-CodeNest-Signature": good, "X-Thoth-Signature": good }, 200],
    [{ "X-CodeNest-Signature": bad, "X-Thoth-Signature": good }, 200],
    [{ "X-CodeNest-Signature": good, "X-Thoth-Signature": bad }, 200],
    [{ "x-codenest-signature": `sha256=${good}` }, 200],
    [{ "X-CodeNest-Signature": bad, "X-Thoth-Signature": bad }, 401],
    [{ "X-CodeNest-Signature": "" }, 401],
    [{}, 401],
  ];
  for (const [headers, want] of cases) {
    const got = await webhook(req(ARTICLE, headers));
    assert.equal(got.status, want, JSON.stringify(headers));
    assert.deepEqual(got.seen, want === 200 ? ["a"] : [], "no handler runs before verification");
  }
  assert.equal((await webhook(strictReq(ARTICLE, { "X-CodeNest-Signature": good }))).status, 200);
  assert.equal((await webhook(strictReq(ARTICLE, { "X-Thoth-Signature": good }))).status, 200);
});

test("the patch event prefers X-CodeNest-Event", async () => {
  const { createSeoPatchRoute } = await load("next");
  const body = JSON.stringify({ paths: ["/a"], patches: [{ kind: "page", path: "/p" }] });
  const applied = [];
  const route = createSeoPatchRoute({
    secret: SECRET,
    applySeoPatch: (p) => { applied.push(p.path); },
    revalidate: () => {},
  });
  const sig = { "X-CodeNest-Signature": sign(body) };
  const event = async (headers) => (await (await route(req(body, { ...sig, ...headers }))).json());
  assert.deepEqual((await event({ "X-CodeNest-Event": "revalidate" })).revalidated, ["/a"]);
  assert.deepEqual((await event({ "X-Thoth-Event": "revalidate" })).revalidated, ["/a"]);
  assert.deepEqual((await event({ "X-CodeNest-Event": "seo-patch", "X-Thoth-Event": "revalidate" })).revalidated,
    ["/p"], "the new name wins when both are sent");
  assert.deepEqual((await event({})).revalidated, ["/p"], "no event header: seo-patch");
  const wrong = await route(req(body, { "X-CodeNest-Signature": sign(body, "x"), "X-CodeNest-Event": "revalidate" }));
  assert.equal(wrong.status, 401);
});

test("provider routes verify by either name", async () => {
  const body = JSON.stringify({ path: "/a" });
  for (const [headers, want] of [
    [{ "X-CodeNest-Signature": sign(body) }, 200],
    [{ "X-Thoth-Signature": sign(body) }, 200],
    [{ "X-CodeNest-Signature": sign(body, "x") }, 401],
  ]) {
    const { createProviderRoutes } = await load("provider");
    const routes = createProviderRoutes({ secret: SECRET, handlers: { applySeoPatch: () => ({ ok: true }) } });
    const res = await routes.seoPatch(req(body, headers), "acme");
    assert.equal(res.status, want, JSON.stringify(Object.keys(headers)));
  }
});

test("the IndexNow key keeps its salt (the key file every site serves)", async () => {
  const want = createHash("sha256").update("itmaster-indexnow-v1:acme").digest("hex").slice(0, 32);
  const { deriveIndexNowKey } = await load("next");
  assert.equal(await deriveIndexNowKey("acme"), want);
});

/** Run `dist/cli.js init` in a fresh directory; returns { files: {path: text}, stdout }. */
function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), "sdk-init-"));
  const r = spawnSync(process.execPath, [join(dist, "cli.js"), "init", "--site", "acme",
    "--engine", "https://engine.test", "--features", "robots,indexnow,webhook", "--yes"],
  { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const files = {};
  const walk = (p) => {
    for (const name of readdirSync(p)) {
      const full = join(p, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(dir, full)] = readFileSync(full, "utf8");
    }
  };
  walk(dir);
  rmSync(dir, { recursive: true, force: true });
  return { files, stdout: r.stdout };
}

test("init scaffolds codenest names only", () => {
  const { files, stdout } = scaffold();
  assert.deepEqual(Object.keys(files).sort(), [".env.example", ".env.local", "app/api/codenest-webhook/route.ts",
    "app/api/indexnow-key/route.ts", "app/robots.txt/route.ts", "lib/codenest.ts", "middleware.ts"]);
  assert.match(files["lib/codenest.ts"], /import \{ createClient \} from "@code-nest\/sdk";/);
  assert.match(files["lib/codenest.ts"], /export const codenest = createClient\(\{/);
  assert.match(files["lib/codenest.ts"], /process\.env\.CODENEST_API_URL \?\? "https:\/\/engine\.test"/);
  assert.match(files[".env.local"], /^# @code-nest\/sdk\nCODENEST_API_URL=https:\/\/engine\.test\n/);
  for (const [path, text] of Object.entries({ ...files, stdout })) {
    assert.doesNotMatch(text, /itmaster|it master|thoth/i, path);
  }
});

test("the package: named, unpublishable until the npm org exists, no old name in code", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "@code-nest/sdk");
  assert.equal(pkg.private, true, "npm publish must refuse it until an owner removes this");
  assert.deepEqual(pkg.bin, { "codenest-sdk": "./dist/cli.js" });
  assert.ok(existsSync(join(dist, "index.d.ts")));
  const allowed = ["itmaster-indexnow-v1"];
  for (const name of readdirSync(dist)) {
    if (!name.endsWith(".js") && !name.endsWith(".d.ts")) continue;
    if (name.startsWith("names.")) continue;          // the legacy header names, on purpose
    let text = readFileSync(join(dist, name), "utf8");
    for (const a of allowed) text = text.split(a).join("");
    assert.doesNotMatch(text, /itmaster|it master|thoth/i, name);
  }
});
