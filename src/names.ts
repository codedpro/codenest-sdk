/**
 * The engine's header names the @code-nest/sdk build reads (plan P6, the
 * CodeNest rename). Swapped in for src/names.ts by scripts/build-variant.mjs.
 *
 * X-CodeNest-Signature / X-CodeNest-Event first, and the legacy
 * X-Thoth-Signature / X-Thoth-Event still accepted: the engine sends both
 * during the expand step (PUBLIC_NAMES=both) and only the new pair after the
 * switch, so a site on this build verifies through the whole move. A request
 * is authentic when ANY of these signatures is a valid HMAC of the raw body
 * under the site's secret. The legacy names go in the contract step.
 *
 * Each inner list is ONE header under the spellings tried in turn — a
 * `RequestLike` need not be case-insensitive — and the first spelling present
 * is that header's value.
 */
export const SIGNATURE_HEADERS: readonly (readonly string[])[] = [
  ["x-codenest-signature", "X-CodeNest-Signature"],
  ["x-thoth-signature", "X-Thoth-Signature"],
];

/** The event header, by name in the order tried; the first present wins. */
export const EVENT_HEADERS: readonly string[] = ["x-codenest-event", "x-thoth-event"];
