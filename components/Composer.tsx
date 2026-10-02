"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

const MAX_LENGTH = 2000;

export function Composer({
  isBusy,
  onSubmit,
  onStop,
  autoFocus,
}: {
  isBusy: boolean;
  onSubmit: (question: string) => void;
  onStop: () => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with content up to a max height, then scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  // Return focus to the box when an answer finishes.
  useEffect(() => {
    if (!isBusy) ref.current?.focus({ preventScroll: true });
  }, [isBusy]);

  const send = () => {
    const question = value.trim();
    if (!question || isBusy) return;
    onSubmit(question);
    setValue("");
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isBusy) onStop();
    else send();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds a new line. Ignore Enter while an IME
    // (e.g. Hindi / Japanese input) is composing a word.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape" && isBusy) onStop();
  };

  const remaining = MAX_LENGTH - value.length;
  const canSend = value.trim().length > 0 && remaining >= 0;

  return (
    <form className="composer" onSubmit={onFormSubmit}>
      <label htmlFor="question" className="visually-hidden">
        Your question
      </label>
      <textarea
        id="question"
        ref={ref}
        rows={1}
        value={value}
        maxLength={MAX_LENGTH}
        autoFocus={autoFocus}
        placeholder={isBusy ? "Answering… press Esc to stop" : "Ask a question"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer__row">
        <span className="composer__hint">
          {remaining < 200 ? `${remaining} characters left` : "Enter to send, Shift + Enter for a new line"}
        </span>
        {isBusy ? (
          <button type="submit" className="button button--stop">
            <span className="stop-square" aria-hidden /> Stop
          </button>
        ) : (
          <button type="submit" className="button button--send" disabled={!canSend}>
            Send
          </button>
        )}
      </div>
    </form>
  );
}
