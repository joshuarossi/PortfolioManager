import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";

interface MarkdownMessageProps {
  content: string;
  variant?: "assistant" | "user" | "system";
}

export function MarkdownMessage({ content, variant = "assistant" }: MarkdownMessageProps) {
  if (variant === "user") {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  return (
    <div
      className={clsx(
        "markdown-body text-sm leading-relaxed",
        variant === "system" && "text-loss",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          h1: ({ children }) => (
            <h1 className="mb-3 mt-1 text-lg font-semibold text-gray-100">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-base font-semibold text-gray-100">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-sm font-semibold text-gray-200">{children}</h3>
          ),
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="text-gray-300">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-100">{children}</strong>,
          em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-hover underline underline-offset-2 hover:text-accent"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-xs text-gray-200">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-accent-hover">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-lg bg-surface p-3 last:mb-0">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-accent/50 pl-3 text-gray-400 last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-surface-border" />,
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="min-w-full text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-surface-border">{children}</thead>,
          th: ({ children }) => <th className="px-2 py-1.5 font-medium text-gray-200">{children}</th>,
          td: ({ children }) => <td className="border-t border-surface-border/50 px-2 py-1.5 text-gray-400">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
