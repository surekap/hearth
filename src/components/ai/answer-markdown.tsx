"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders an answer's prose: bold section headings, bullet lists, and
 * GitHub-flavoured tables (which scroll inside their own container on a
 * phone rather than widening the page).
 */
export function AnswerMarkdown({ text }: { text: string }) {
  return (
    <div className="answer-prose text-sm [&_p]:min-h-[0.5em] [&_p+p]:mt-1.5 [&_strong]:mt-2 [&_strong]:block [&_ul]:my-1.5 [&_ul]:grid [&_ul]:gap-1 [&_ul]:pl-4 [&_li]:list-disc [&_ol]:my-1.5 [&_ol]:pl-4 [&_li]:marker:text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-2 -mx-1 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[28rem] border-collapse text-left text-[13px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => (
            <th className="whitespace-nowrap border-b px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b px-2.5 py-1.5 align-top tabular-nums last:border-b-0">
              {children}
            </td>
          ),
          tr: ({ children }) => <tr className="[&:last-child>td]:border-b-0">{children}</tr>,
          a: ({ children, href }) => (
            <a href={href} className="underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
