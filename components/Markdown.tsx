"use client";

import { memo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

/**
 * Renders Markdown that may still be arriving.
 * react-markdown copes with unfinished syntax (an unclosed ``` fence renders
 * as an open code block until the closing fence arrives), so we can safely
 * re-render on every flush.
 */
export const Markdown = memo(function Markdown({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  return (
    <div className="prose" data-streaming={streaming || undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: CodeBlock,
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          table: ({ node: _node, ...props }) => (
            <div className="table-scroll">
              <table {...props} />
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

function CodeBlock({ node: _node, children, ...props }: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  // rehype-highlight puts "language-xyz" on the inner <code>.
  const language = findLanguage(children);

  const copy = async () => {
    const code = preRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (e.g. insecure context) */
    }
  };

  return (
    <div className="code-block">
      <div className="code-block__bar">
        <span>{language ?? "code"}</span>
        <button type="button" className="text-button" onClick={copy}>
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre ref={preRef} {...props}>
        {children}
      </pre>
    </div>
  );
}

function findLanguage(children: React.ReactNode): string | null {
  const child = Array.isArray(children) ? children[0] : children;
  if (child && typeof child === "object" && "props" in child) {
    const className = (child.props as { className?: string }).className ?? "";
    const match = /language-([\w-]+)/.exec(className);
    if (match) return match[1];
  }
  return null;
}
