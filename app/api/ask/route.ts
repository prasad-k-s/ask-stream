import {
  AllModelsBusyError,
  modelPlan,
  openWithFallback,
  type OpenedStream,
  type OpenStream,
} from "@/lib/fallback";
import { streamGemini, UpstreamError } from "@/lib/gemini";
import { streamMock } from "@/lib/mock";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  ATTEMPTS_HEADER,
  FALLBACK_HEADER,
  MODEL_HEADER,
  type ApiErrorBody,
  type ApiErrorCode,
} from "@/lib/types";

// Streaming needs the Node.js runtime and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION_LENGTH = 2000;
const DEFAULT_FALLBACKS = "gemini-flash-lite-latest,gemini-2.5-flash";

function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: HeadersInit,
) {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers });
}

export async function POST(req: Request) {
  // 1. Protect the API key from abuse.
  const limited = rateLimit(clientIp(req), { limit: 10, windowMs: 60_000 });
  if (!limited.ok) {
    return errorResponse(
      429,
      "rate_limited",
      `Too many requests. Try again in ${limited.retryAfterSec}s.`,
      { "Retry-After": String(limited.retryAfterSec) },
    );
  }

  // 2. Validate input.
  let question: unknown;
  try {
    ({ question } = await req.json());
  } catch {
    return errorResponse(400, "bad_request", "Request body must be JSON.");
  }
  if (typeof question !== "string" || !question.trim()) {
    return errorResponse(400, "bad_request", "Please enter a question.");
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return errorResponse(
      400,
      "bad_request",
      `Question is too long (max ${MAX_QUESTION_LENGTH} characters).`,
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse(500, "config", "Server is missing GEMINI_API_KEY. Add it to .env.local.");
  }

  // 3. Start the upstream stream. If the client disconnects or presses Stop,
  //    req.signal aborts and we stop paying for tokens nobody will read.
  const upstream = new AbortController();
  req.signal.addEventListener("abort", () => upstream.abort());

  const prompt = question.trim();
  const models = modelPlan(
    process.env.GEMINI_MODEL || "gemini-flash-latest",
    process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACKS,
  );

  const open: OpenStream = (model, signal) =>
    apiKey === "mock"
      ? streamMock(prompt, signal, { isPrimary: model === models[0] })
      : streamGemini(prompt, { apiKey, model, signal });

  // 4. Wait for the first chunk before committing to a 200 response, so
  //    errors like a bad key or quota limit get a real HTTP status code.
  //    While nothing has been sent yet, busy models are retried and then
  //    swapped for fallbacks.
  let opened: OpenedStream;
  try {
    opened = await openWithFallback(open, models, { signal: upstream.signal });
  } catch (err) {
    return mapUpstreamError(err);
  }
  const { first, rest: chunks } = opened;
  if (opened.attempts.length > 1) {
    console.info("[api/ask] recovered after retries:", opened.attempts);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!first.done) controller.enqueue(encoder.encode(first.value));
    },
    async pull(controller) {
      try {
        const { done, value } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (err) {
        if (upstream.signal.aborted) return; // client pressed Stop or left; nothing to report
        // Headers are already sent, so error the stream. The client sees
        // its reader reject and shows "stream interrupted".
        console.error("[api/ask] stream failed mid-way:", err);
        controller.error(err);
      }
    },
    cancel() {
      upstream.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // stop proxies (e.g. nginx) from buffering
      [MODEL_HEADER]: opened.model,
      [FALLBACK_HEADER]: opened.usedFallback ? "1" : "0",
      [ATTEMPTS_HEADER]: String(opened.attempts.length),
    },
  });
}

function mapUpstreamError(err: unknown) {
  if (err instanceof AllModelsBusyError) {
    const tried = [...new Set(err.attempts.map((a) => a.model))];
    const allQuota = err.attempts.every((a) => a.outcome === "quota");
    return errorResponse(
      allQuota ? 429 : 503,
      allQuota ? "rate_limited" : "overloaded",
      allQuota
        ? `The free-tier quota is used up for ${tried.join(", ")}. Wait a minute and retry.`
        : `Gemini is busy right now. Tried ${tried.join(", ")}. Spikes are usually short, so retry in a moment.`,
      { "Retry-After": allQuota ? "60" : "15" },
    );
  }
  if (err instanceof UpstreamError) {
    const msg = err.message.toLowerCase();
    if (msg.includes("api key") || err.status === 401 || err.status === 403) {
      return errorResponse(401, "invalid_key", "The Gemini API key is missing or invalid.");
    }
    if (err.status === 429) {
      return errorResponse(429, "rate_limited", "The model's free-tier quota was hit. Wait a minute and retry.");
    }
    if (err.status === 400) {
      return errorResponse(400, "bad_request", err.message);
    }
    return errorResponse(502, "upstream", err.message);
  }
  console.error("[api/ask] unexpected error:", err);
  return errorResponse(502, "upstream", "Could not reach the model. Please try again.");
}
