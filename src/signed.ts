/**
 * Reading the engine's signature and event headers by the names this build
 * speaks (`names.ts`). Internal: not in the package's `exports`.
 */
import { EVENT_HEADERS, SIGNATURE_HEADERS } from "./names.js";

/** The slice of a request's headers these helpers read. */
export interface HeadersLike {
  get(name: string): string | null;
}

/**
 * One value per signature header this build reads, in order, or `[""]` when
 * none is present (which then fails verification, as an absent header always
 * has). With one header name this is exactly `get(a) ?? get(A) ?? ""`.
 */
export function signaturesOf(headers: HeadersLike): string[] {
  const out: string[] = [];
  for (const spellings of SIGNATURE_HEADERS) {
    for (const name of spellings) {
      const value = headers.get(name);
      if (value != null) {
        out.push(value);
        break;
      }
    }
  }
  return out.length ? out : [""];
}

/** The event header's value under the first name present, else `fallback`. */
export function eventOf(headers: HeadersLike, fallback: string): string {
  for (const name of EVENT_HEADERS) {
    const value = headers.get(name);
    if (value != null) return value;
  }
  return fallback;
}
