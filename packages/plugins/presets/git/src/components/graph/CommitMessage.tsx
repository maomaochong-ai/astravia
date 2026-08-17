import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Compact markdown renderer for commit message bodies. Mirrors the host's
 * MarkdownPreview component styling but self-contained (no host atoms / syntax
 * highlighter), since the plugin bundles its own react-markdown.
 */
export function CommitMessage({ body }: { body: string }): JSX.Element {
	const components = useMemo<Components>(
		() => ({
			h1: ({ children }) => <h1 className="mb-1.5 mt-2 text-[14px] font-bold text-foreground">{children}</h1>,
			h2: ({ children }) => <h2 className="mb-1.5 mt-2 text-[13px] font-bold text-foreground">{children}</h2>,
			h3: ({ children }) => <h3 className="mb-1 mt-1.5 text-[12.5px] font-semibold text-foreground">{children}</h3>,
			p: ({ children }) => <p className="my-1 text-[12px] leading-[1.6] text-muted-foreground">{children}</p>,
			ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5 text-[12px] leading-[1.6] text-muted-foreground">{children}</ul>,
			ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5 text-[12px] leading-[1.6] text-muted-foreground">{children}</ol>,
			li: ({ children }) => <li className="pl-0.5">{children}</li>,
			code: ({ className, children }) => {
				const raw = String(children);
				const isBlock = (className?.startsWith("language-") ?? false) || raw.includes("\n");
				if (isBlock) {
					return (
						<pre className="git-mono my-1.5 overflow-x-auto rounded-md border border-border bg-muted/60 p-2 text-[11.5px] leading-[1.5] text-foreground">
							<code>{raw.replace(/\n$/, "")}</code>
						</pre>
					);
				}
				return <code className="git-mono rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">{children}</code>;
			},
			pre: ({ children }) => <>{children}</>,
			blockquote: ({ children }) => <blockquote className="my-1.5 border-l-2 border-border pl-2 text-[12px] italic text-muted-foreground">{children}</blockquote>,
			table: ({ children }) => (
				<div className="my-1.5 overflow-x-auto rounded-md border border-border">
					<table className="w-full text-[11.5px]">{children}</table>
				</div>
			),
			th: ({ children }) => <th className="border-b border-border bg-muted px-2 py-1 text-left font-semibold text-muted-foreground">{children}</th>,
			td: ({ children }) => <td className="border-t border-border px-2 py-1 text-foreground">{children}</td>,
			hr: () => <hr className="my-2 border-border" />,
			a: ({ href, children }) => (
				<a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline decoration-primary/30 hover:decoration-primary">
					{children}
				</a>
			),
			strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
			em: ({ children }) => <em className="italic">{children}</em>,
		}),
		[],
	);

	return (
		<div className="break-words">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
				{body}
			</ReactMarkdown>
		</div>
	);
}
