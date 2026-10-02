/**
 * Opens a model stream with retries and fallback models.
 *
 * Free LLM tiers often fail with "model overloaded" (503) or "quota
 * exceeded" (429). Before any text has been sent to the browser we can still
 * recover, so we:
 *
 *   1. retry the primary model with exponential backoff when it is busy,
 *   2. move on to the next fallback model when it stays busy or is out of
 *      quota (each Gemini model has its own free-tier quota),
 *   3. give up immediately on errors a retry can't fix (bad key, bad request).
 *
 * Once the first chunk arrives we're committed to that model: switching
 * mid-answer would produce a mixed-up response.
 */

import { UpstreamError } from "./gemini";

export type OpenStream = (model: string, signal: AbortSignal) => AsyncGenerator<string>;

export type AttemptLog = { model: string; outcome: "ok" | "busy" | "quota" };

export type OpenedStream = {
  model: string;
  usedFallback: boolean;
  attempts: AttemptLog[];
  first: IteratorResult<string>;
  rest: AsyncGenerator<string>;
};

export class AllModelsBusyError extends Error {
  constructor(
    public readonly attempts: AttemptLog[],
    public readonly lastError: unknown,
  ) {
    super("Every model we tried was busy or out of quota.");
    this.name = "AllModelsBusyError";
  }
}

export function classify(err: unknown): "busy" | "quota" | "fatal" {
  if (!(err instanceof UpstreamError)) return "fatal";
  if (err.status === 429) return "quota";
  const msg = err.message.toLowerCase();
  if (
    err.status === 503 ||
    err.status === 500 ||
    err.status === 504 ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("unavailable")
  ) {
    return "busy";
  }
  return "fatal";
}

export async function openWithFallback(
  open: OpenStream,
  models: string[],
  {
    signal,
    retriesPerModel = 1,
    baseDelayMs = 800,
  }: { signal: AbortSignal; retriesPerModel?: number; baseDelayMs?: number },
): Promise<OpenedStream> {
  const attempts: AttemptLog[] = [];
  let lastError: unknown;

  for (let m = 0; m < models.length; m++) {
    const model = models[m];

    for (let attempt = 0; attempt <= retriesPerModel; attempt++) {
      if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");

      const rest = open(model, signal);
      try {
        const first = await rest.next();
        attempts.push({ model, outcome: "ok" });
        return { model, usedFallback: m > 0, attempts, first, rest };
      } catch (err) {
        if (signal.aborted) throw err;
        const kind = classify(err);
        if (kind === "fatal") throw err;

        lastError = err;
        attempts.push({ model, outcome: kind });

        // Out of quota: retrying the same model won't help this minute.
        if (kind === "quota") break;

        // Busy: back off (800 ms, 1.6 s, ...) plus jitter, then retry.
        if (attempt < retriesPerModel) {
          const delay = baseDelayMs * 2 ** attempt + Math.random() * 250;
          await sleep(delay, signal);
        }
      }
    }
  }

  throw new AllModelsBusyError(attempts, lastError);
}

/** Primary model first, then fallbacks, without duplicates or blanks. */
export function modelPlan(primary: string, fallbackList: string | undefined): string[] {
  const fallbacks = (fallbackList ?? "").split(",").map((s) => s.trim());
  return [...new Set([primary, ...fallbacks].filter(Boolean))];
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
