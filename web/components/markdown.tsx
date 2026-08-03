"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Render markdown đẹp (heading/bold/link/list/table) — style ở .markdown trong globals.css.
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
