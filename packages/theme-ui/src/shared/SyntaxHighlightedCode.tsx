import { useEffect, useState, type JSX } from "react";
import { codeToHtml } from "shiki";

export interface SyntaxHighlightedCodeProps {
	code: string;
	lang: string;
	theme: "light" | "dark";
}

/**
 * Shiki-highlighted code block. Plain text while loading / on error.
 */
export function SyntaxHighlightedCode({ code, lang, theme }: SyntaxHighlightedCodeProps): JSX.Element {
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const language = lang || "text";

		codeToHtml(code, {
			lang: language,
			theme: theme === "dark" ? "github-dark-default" : "github-light-default",
		})
			.then((result) => {
				if (!cancelled) setHtml(result);
			})
			.catch(() => {
				if (!cancelled) setHtml("");
			});

		return () => {
			cancelled = true;
		};
	}, [code, lang, theme]);

	if (html === null || html === "") {
		return (
			<pre className="overflow-x-auto p-3">
				<code className="text-[12px] leading-[1.6] text-foreground">{code}</code>
			</pre>
		);
	}

	return (
		<div
			className="overflow-x-auto text-[12px] leading-[1.6] [&_pre]:!bg-transparent [&_pre]:!p-3 [&_code]:!bg-transparent"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki generates safe HTML
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
