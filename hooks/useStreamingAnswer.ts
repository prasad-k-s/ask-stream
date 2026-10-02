"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ATTEMPTS_HEADER,
  FALLBACK_HEADER,
  MODEL_HEADER,
  type ApiErrorBody,
  type ApiErrorCode,
} from "@/lib/types";

export type StreamStatus = "idle" | "waiting" | "streaming" | "done" | "stopped" | "error";

export type StreamErrorCode = ApiErrorCode | "network" | "interrupted";

export type StreamError = {
  code: StreamErrorCode;
  message: string;
  retryAfterSec?: number;
};

/** One network chunk: when it arrived (ms after send) and how many characters it carried. */
export type ChunkMark = { at: number; size: number };

export type StreamMetrics = {
  startedAt: number | null;
  firstTokenAt: number | null;
  endedAt: number | null;
  chunks: ChunkMark[];
};

/** Which model answered, read from the response headers. */
export type ModelInfo = { name: string; usedFallback: boolean; attempts: number };

export type StreamState = {
  question: string;
  answer: string;
  status: StreamStatus;
  error: StreamError | null;
  metrics: StreamMetrics;
  model: ModelInfo | null;
};

const EMPTY_METRICS: StreamMetrics = { startedAt: null, firstTokenAt: null, endedAt: null, chunks: [] };

const INITIAL: StreamState = {
  question: "",
  answer: "",
  status: "idle",
  error: null,
  metrics: EMPTY_METRICS,
  model: null,
};

/**
 * Sends a question to /api/ask and reads the streamed answer chunk by chunk.
 *
 * - Uses fetch + ReadableStream reader + TextDecoder (no streaming library).
 * - Batches incoming chunks into one React update per animation frame, so a
 *   fast stream doesn't trigger hundreds of renders per second.
 * - Supports Stop (AbortController), Retry, and typed error states.
 * - A newer request always cancels an older one, so answers can't interleave.
 */
export function useStreamingAnswer() {
  const [state, setState] = useState<StreamState>(INITIAL);

  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(""); // text received but not yet rendered
  const pendingChunksRef = useRef<ChunkMark[]>([]);
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const text = pendingRef.current;
    const marks = pendingChunksRef.current;
    if (!text && marks.length === 0) return;
    pendingRef.current = "";
    pendingChunksRef.current = [];
    setState((s) => ({
      ...s,
      answer: s.answer + text,
      metrics: { ...s.metrics, chunks: [...s.metrics.chunks, ...marks] },
    }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  const flushNow = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    flush();
  }, [flush]);

  const ask = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question) return;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const isCurrent = () => controllerRef.current === controller;

      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      pendingRef.current = "";
      pendingChunksRef.current = [];

      const startedAt = performance.now();
      setState({
        question,
        answer: "",
        status: "waiting",
        error: null,
        metrics: { ...EMPTY_METRICS, startedAt },
        model: null,
      });

      let receivedAny = false;

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw await toStreamError(res);
        }

        const modelName = res.headers.get(MODEL_HEADER);
        if (modelName && isCurrent()) {
          const model: ModelInfo = {
            name: modelName,
            usedFallback: res.headers.get(FALLBACK_HEADER) === "1",
            attempts: Number(res.headers.get(ATTEMPTS_HEADER)) || 1,
          };
          setState((s) => ({ ...s, model }));
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (!isCurrent()) return; // a newer question replaced this one
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          if (!text) continue;

          const now = performance.now();
          if (!receivedAny) {
            receivedAny = true;
            setState((s) => ({
              ...s,
              status: "streaming",
              metrics: { ...s.metrics, firstTokenAt: now },
            }));
          }
          pendingRef.current += text;
          pendingChunksRef.current.push({ at: now - startedAt, size: text.length });
          scheduleFlush();
        }

        pendingRef.current += decoder.decode();
        if (!isCurrent()) return;
        flushNow();
        setState((s) => ({
          ...s,
          status: "done",
          metrics: { ...s.metrics, endedAt: performance.now() },
        }));
      } catch (err) {
        if (!isCurrent()) return; // superseded by a newer question
        flushNow();

        if (controller.signal.aborted) {
          setState((s) => ({
            ...s,
            status: "stopped",
            metrics: { ...s.metrics, endedAt: performance.now() },
          }));
          return;
        }

        const error: StreamError = isStreamError(err)
          ? err
          : receivedAny
            ? { code: "interrupted", message: "The connection dropped before the answer finished." }
            : { code: "network", message: "Couldn't reach the server. Check your connection and retry." };

        setState((s) => ({
          ...s,
          status: "error",
          error,
          metrics: { ...s.metrics, endedAt: performance.now() },
        }));
      } finally {
        if (isCurrent()) controllerRef.current = null;
      }
    },
    [flushNow, scheduleFlush],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (state.question) void ask(state.question);
  }, [ask, state.question]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(INITIAL);
  }, []);

  // Cancel any in-flight request when the component unmounts.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const isBusy = state.status === "waiting" || state.status === "streaming";

  return { ...state, isBusy, ask, stop, retry, reset };
}

function isStreamError(value: unknown): value is StreamError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

async function toStreamError(res: Response): Promise<StreamError> {
  let code: StreamErrorCode = "upstream";
  let message = `Request failed with status ${res.status}.`;
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body.error) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    /* non-JSON error body */
  }
  const retryAfter = Number(res.headers.get("Retry-After"));
  return {
    code,
    message,
    retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  };
}
