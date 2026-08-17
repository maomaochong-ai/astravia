import type { JSX } from "react";
import { TextPreview, type TextPreviewLabels } from "./TextPreview";

export type DiffLineKind = "added" | "removed" | "context" | "meta";

export interface DiffLineView {
	text: string;
	kind: DiffLineKind;
	marker: string;
	content: string;
	rowClass: string;
	markerClass: string;
}

export interface DiffPreviewViewProps {
	lines: readonly DiffLineView[];
	statsAdded: number;
	statsRemoved: number;
	netLabel: string;
	/** 编辑模式徽标（如「锚点编辑」）。undefined = 不显示。 */
	modeBadge?: string;
}

export function DiffPreviewView({
	lines,
	statsAdded,
	statsRemoved,
	netLabel,
	modeBadge,
}: DiffPreviewViewProps): JSX.Element {
	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/50">
				<span className="font-medium text-muted-foreground/60">diff</span>
				{modeBadge !== undefined && (
					<span className="rounded bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-600 dark:text-violet-400">
						{modeBadge}
					</span>
				)}
				<span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
					+{statsAdded}
				</span>
				<span className="rounded bg-red-500/10 px-1.5 py-0.5 font-medium text-red-600 dark:text-red-400">
					-{statsRemoved}
				</span>
				<span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground/60">{netLabel}</span>
			</div>
			<div className="max-h-[420px] overflow-auto rounded-md bg-muted/25 py-2 font-mono text-[11px] leading-[1.5]">
				{lines.map((line, index) => (
					<div key={`${index}-${line.text}`} className={`flex min-w-max px-2 ${line.rowClass}`}>
						<span className={`w-4 shrink-0 select-none ${line.markerClass}`}>{line.marker}</span>
						<span className="whitespace-pre">{line.content}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export interface AnchorEditItemView {
	/** 锚点串（如 "42:ab"，区间为 "42:ab – 50:cd"） */
	anchorLabel: string;
	/** 动作描述（替换/插入/删除，已本地化） */
	actionLabel: string;
	/** 新文本；null = 删除（无新文本） */
	text: string | null;
}

export interface AnchorEditsFallbackViewProps {
	/** 模式徽标（如「锚点编辑」） */
	badge: string;
	items: readonly AnchorEditItemView[];
	textPreviewLabels: TextPreviewLabels;
}

/** 锚点模式的流式降级视图：diff 尚未产出时展示每条锚点编辑的目标与新文本。 */
export function AnchorEditsFallbackView({
	badge,
	items,
	textPreviewLabels,
}: AnchorEditsFallbackViewProps): JSX.Element | null {
	if (items.length === 0) return null;
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/50">
				<span className="rounded bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-600 dark:text-violet-400">
					{badge}
				</span>
				<span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground/60">×{items.length}</span>
			</div>
			{items.map((item, index) => (
				<div key={`${index}-${item.anchorLabel}`} className="space-y-1.5">
					<div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/50">
						<span className="rounded bg-violet-500/10 px-1.5 py-0.5 font-mono font-medium text-violet-600 dark:text-violet-400">
							{item.anchorLabel}
						</span>
						<span className="text-muted-foreground/60">{item.actionLabel}</span>
					</div>
					{item.text !== null && (
						<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/25 p-2 text-[11px] leading-[1.5] text-foreground/70">
							{item.text.length > 0 ? item.text : textPreviewLabels.emptyLabel}
						</pre>
					)}
				</div>
			))}
		</div>
	);
}

export interface EditTextFallbackViewProps {
	oldText: string | null;
	newText: string | null;
	oldTextEmptyLabel: string;
	newTextEmptyLabel: string;
	textPreviewLabels: TextPreviewLabels;
}

export function EditTextFallbackView({
	oldText,
	newText,
	oldTextEmptyLabel,
	newTextEmptyLabel,
	textPreviewLabels,
}: EditTextFallbackViewProps): JSX.Element | null {
	if (oldText === null && newText === null) return null;

	return (
		<div className="space-y-3">
			{oldText !== null && (
				<TextPreview label="oldText" text={oldText} emptyLabel={oldTextEmptyLabel} labels={textPreviewLabels} />
			)}
			{newText !== null && (
				<TextPreview label="newText" text={newText} emptyLabel={newTextEmptyLabel} labels={textPreviewLabels} />
			)}
		</div>
	);
}
