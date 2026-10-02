/**
 * Minimal Gemini REST client for server-side use.
 *
 * We call the REST endpoint directly (no SDK) so the streaming mechanics are
 * visible: Gemini sends Server-Sent Events, we parse them and yield plain
 * text chunks.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const SYSTEM_PROMPT =
  "You are a helpful, concise assistant. Answer clearly. Use Markdown " +
  "(headings, lists, tables, fenced code blocks with a language tag) when it " +
  "helps readability.";

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

type GeminiPart = { text?: string; thought?: boolean };

type GeminiChunk = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; code?: number };
};

/** Pull the visible answer text out of one streamed Gemini JSON chunk. */
export function extractText(chunk: GeminiChunk): string {
  if (chunk.error) {
    throw new UpstreamError(chunk.error.message ?? "Model error", chunk.error.code ?? 502);
  }
  if (chunk.promptFeedback?.blockReason) {
    throw new UpstreamError(
      `The model declined this prompt (${chunk.promptFeedback.blockReason}).`,
      400,
    );
  }

  const candidate = chunk.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");

  if (!text && candidate?.finishReason === "SAFETY") {
    throw new UpstreamError("The response was stopped by the model's safety filter.", 400);
  }
  return text;
}

/**
 * Parse an SSE byte stream into the JSON payloads of its `data:` lines.
 * Handles events split across network chunks and both \n and \r\n endings.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushEvent = (rawEvent: string): unknown | undefined => {
    const data = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return undefined;
    return JSON.parse(data);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line.
      let match: RegExpExecArray | null;
      const separator = /\r?\n\r?\n/;
      while ((match = separator.exec(buffer))) {
        const rawEvent = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const parsed = flushEvent(rawEvent);
        if (parsed !== undefined) yield parsed;
      }
    }
    buffer += decoder.decode();
    const parsed = flushEvent(buffer);
    if (parsed !== undefined) yield parsed;
  } finally {
    reader.releaseLock();
  }
}

/** Ask Gemini a question and yield the answer as it streams in. */
export async function* streamGemini(
  question: string,
  opts: { apiKey: string; model: string; signal?: AbortSignal },
): AsyncGenerator<string> {
  const url = `${GEMINI_BASE}/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse`;

  const res = await fetch(url, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": opts.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
    }),
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const json = (await res.json()) as GeminiChunk;
      detail = json.error?.message ?? "";
    } catch {
      /* body wasn't JSON */
    }
    throw new UpstreamError(detail || `Gemini request failed (${res.status})`, res.status);
  }

  for await (const event of parseSSE(res.body)) {
    const text = extractText(event as GeminiChunk);
    if (text) yield text;
  }
}
