"use client";

import { useState } from "react";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useStreamingAnswer, type StreamStatus } from "@/hooks/useStreamingAnswer";
import { Composer } from "./Composer";
import { ErrorNotice } from "./ErrorNotice";
import { Markdown } from "./Markdown";
import { StreamTimeline } from "./StreamTimeline";

const EXAMPLES = [
  "Explain the JavaScript event loop with a small code example",
  "Compare REST and GraphQL in a table",
  "Write a React hook that debounces a value",
];

const STATUS_TEXT: Record<StreamStatus, string> = {
  idle: "",
  waiting: "Waiting for the first token",
  streaming: "Streaming",
  done: "Finished",
  stopped: "Stopped by you",
  error: "Failed",
};

export function AskApp() {
  const stream = useStreamingAnswer();
  const { isAtBottom, scrollToBottom } = useStickToBottom(stream.answer.length + stream.status);

  const hasRun = stream.status !== "idle";
  const showCursor = stream.status === "streaming";

  return (
    <>
      <header className="site-header">
        <div className="column site-header__inner">
          <button type="button" className="brand" onClick={stream.reset} disabled={!hasRun}>
            Ask
          </button>
          <span className="site-header__model">Streaming answers from Gemini</span>
        </div>
      </header>

      <main className="column main">
        {!hasRun ? (
          <section className="intro">
            <h1>Ask a question and watch the answer stream in.</h1>
            <p>
              Each answer is read from the network chunk by chunk. The timeline under it shows when every
              chunk arrived.
            </p>
            <ul className="examples">
              {EXAMPLES.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => stream.ask(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <article className="run" aria-busy={stream.isBusy}>
            <h1 className="run__question">{stream.question}</h1>

            <p className="run__status" data-status={stream.status} aria-live="polite">
              <span className="status-dot" aria-hidden />
              {STATUS_TEXT[stream.status]}
              {stream.model && <span className="run__model">{stream.model.name}</span>}
            </p>

            {stream.model?.usedFallback && (
              <p className="fallback-note">
                The main model was busy, so this answer came from a backup model after{" "}
                {stream.model.attempts - 1} failed {stream.model.attempts - 1 === 1 ? "attempt" : "attempts"}.
              </p>
            )}

            <StreamTimeline metrics={stream.metrics} status={stream.status} charCount={stream.answer.length} />

            {stream.status === "waiting" && (
              <div className="skeleton" aria-hidden>
                <span />
                <span />
                <span />
              </div>
            )}

            {stream.answer && <Markdown text={stream.answer} streaming={showCursor} />}

            {stream.status === "done" && !stream.answer && (
              <p className="muted">The model finished without returning any text. Try rephrasing the question.</p>
            )}

            {stream.status === "stopped" && (
              <p className="muted">
                Stopped after {stream.answer.length.toLocaleString()} characters.{" "}
                <button type="button" className="text-button" onClick={stream.retry}>
                  Ask again
                </button>
              </p>
            )}

            {stream.error && <ErrorNotice error={stream.error} onRetry={stream.retry} />}

            {stream.status === "done" && stream.answer && <AnswerActions text={stream.answer} />}
          </article>
        )}
      </main>

      <div className="dock">
        <div className="column">
          {!isAtBottom && hasRun && (
            <button type="button" className="jump" onClick={scrollToBottom}>
              Jump to latest
            </button>
          )}
          <Composer isBusy={stream.isBusy} onSubmit={stream.ask} onStop={stream.stop} autoFocus />
        </div>
      </div>
    </>
  );
}

function AnswerActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="answer-actions">
      <button type="button" className="text-button" onClick={copy}>
        {copied ? "Copied" : "Copy answer"}
      </button>
    </div>
  );
}
