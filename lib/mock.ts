import { UpstreamError } from "./gemini";

/**
 * Fake streaming model, used when GEMINI_API_KEY=mock.
 * Lets you develop the UI (and demo it offline) without spending quota.
 */

const SAMPLE = `Streaming means the server sends the answer **in pieces as it is generated**, instead of waiting for the whole thing.

### Why it feels faster
- The first words show up in a few hundred milliseconds.
- The user can start reading while the model is still writing.
- A **Stop** button can cancel generation early and save tokens.

### How the browser reads it
\`\`\`ts
const res = await fetch("/api/ask", { method: "POST", body });
const reader = res.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  append(decoder.decode(value, { stream: true }));
}
\`\`\`

| Approach | First text visible | Can cancel |
| --- | --- | --- |
| Normal request | After full answer | No |
| Streaming | After first chunk | Yes |

That's the whole trick: a \`ReadableStream\` on the server and a reader loop on the client.`;

/**
 * Test words you can put in a question while in mock mode:
 *   "error"      -> a non-retryable failure
 *   "busy"       -> the primary model is overloaded, so the app falls back
 *   "overloaded" -> every model is overloaded
 */
export async function* streamMock(
  question: string,
  signal?: AbortSignal,
  { isPrimary = true }: { isPrimary?: boolean } = {},
): AsyncGenerator<string> {
  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });

  if (/error/i.test(question)) {
    await sleep(300);
    throw new Error("Mock failure (your question contained the word 'error').");
  }

  if (/overloaded/i.test(question) || (/busy/i.test(question) && isPrimary)) {
    await sleep(200);
    throw new UpstreamError(
      "This model is currently experiencing high demand. Spikes in demand are usually temporary.",
      503,
    );
  }

  await sleep(450); // simulated time-to-first-token
  const tokens = SAMPLE.match(/\S+\s*|\s+/g) ?? [];
  for (let i = 0; i < tokens.length; i += 3) {
    yield tokens.slice(i, i + 3).join("");
    await sleep(25 + Math.random() * 60);
  }
}
