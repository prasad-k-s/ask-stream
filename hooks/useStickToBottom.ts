"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps the window scrolled to the bottom while content grows,
 * but only if the user is already near the bottom. If they scroll up to read,
 * we stop following and expose `isAtBottom = false` so the UI can offer a
 * "Jump to latest" button.
 */
export function useStickToBottom(dep: unknown, threshold = 120) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const followRef = useRef(true);

  useEffect(() => {
    const onScroll = () => {
      const distance =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      const atBottom = distance < threshold;
      followRef.current = atBottom;
      setIsAtBottom(atBottom);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [threshold]);

  useEffect(() => {
    if (followRef.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [dep]);

  const scrollToBottom = useCallback(() => {
    followRef.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  return { isAtBottom, scrollToBottom };
}
