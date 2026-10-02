"use client";

import { useEffect, useState } from "react";
import type { StreamMetrics, StreamStatus } from "@/hooks/useStreamingAnswer";

/**
 * Visualises the stream itself: each network chunk is a tick placed at the
 * moment it arrived. A gap at the start is the time-to-first-token; bursts
 * and pauses show how the model actually delivered the answer.
 */
export function StreamTimeline({
  metrics,
  status,
  charCount,
}: {
  metrics: StreamMetrics;
  status: StreamStatus;
  charCount: number;
}) {
  const live = status === "waiting" || status === "streaming";
  const now = useNow(live);

  const { startedAt, firstTokenAt, endedAt, chunks } = metrics;
  if (startedAt === null) return null;

  const elapsed = Math.max(1, (endedAt ?? now) - startedAt);
  const ttft = firstTokenAt !== null ? firstTokenAt - startedAt : null;
  const streamSeconds =
    firstTokenAt !== null ? Math.max(0.001, ((endedAt ?? now) - firstTokenAt) / 1000) : null;
  const charsPerSec = streamSeconds && charCount ? Math.round(charCount / streamSeconds) : null;

  const maxSize = chunks.reduce((m, c) => Math.max(m, c.size), 1);

  return (
    <figure className="timeline" aria-label="Stream timeline">
      <div className="timeline__track" data-live={live || undefined}>
        {ttft !== null && (
          <div className="timeline__wait" style={{ width: `${(ttft / elapsed) * 100}%` }} />
        )}
        {chunks.map((c, i) => (
          <span
            key={i}
            className="timeline__tick"
            style={{
              left: `${(c.at / elapsed) * 100}%`,
              height: `${30 + (c.size / maxSize) * 70}%`,
            }}
          />
        ))}
        {live && <span className="timeline__head" />}
      </div>

      <figcaption>
        <dl className="timeline__stats">
          <Stat label="First token" value={ttft !== null ? formatMs(ttft) : live ? "waiting…" : "–"} />
          <Stat label="Chunks" value={chunks.length.toLocaleString()} />
          <Stat label="Characters" value={charCount.toLocaleString()} />
          <Stat label="Speed" value={charsPerSec !== null ? `${charsPerSec.toLocaleString()} chars/s` : "–"} />
          <Stat label="Total" value={formatMs(elapsed)} />
        </dl>
      </figcaption>
    </figure>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Re-render ~10×/s while live so the clock and playhead keep moving. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
