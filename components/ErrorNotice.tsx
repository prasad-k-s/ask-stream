"use client";

import { useEffect, useState } from "react";
import type { StreamError } from "@/hooks/useStreamingAnswer";

const TITLES: Record<StreamError["code"], string> = {
  bad_request: "That question couldn't be sent",
  rate_limited: "Too many requests",
  overloaded: "The model is busy right now",
  config: "The server isn't set up yet",
  invalid_key: "The API key was rejected",
  upstream: "The model returned an error",
  network: "No connection to the server",
  interrupted: "The answer was cut off",
};

const RETRYABLE = new Set<StreamError["code"]>(["rate_limited", "overloaded", "upstream", "network", "interrupted"]);

export function ErrorNotice({ error, onRetry }: { error: StreamError; onRetry: () => void }) {
  const countdown = useCountdown(error.retryAfterSec);
  const canRetry = RETRYABLE.has(error.code);

  return (
    <div className="notice" role="alert">
      <div>
        <p className="notice__title">{TITLES[error.code]}</p>
        <p className="notice__body">{error.message}</p>
      </div>
      {canRetry && (
        <button type="button" className="button button--ghost" onClick={onRetry} disabled={countdown > 0}>
          {countdown > 0 ? `Retry in ${countdown}s` : "Retry"}
        </button>
      )}
    </div>
  );
}

function useCountdown(seconds?: number) {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    setLeft(seconds ?? 0);
    if (!seconds) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? (clearInterval(id), 0) : s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return left;
}
