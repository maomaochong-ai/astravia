import type { JSX } from "react";

function TagChip({ label, count }: { label: string; count?: number }): JSX.Element {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
			<span className="icon-[mdi--tag-outline] h-3 w-3 opacity-70" />
			{label}
			{count !== undefined && <span className="text-[10px] text-primary/60">{count}</span>}
		</span>
	);
}

export interface KbFilterPageItem {
	id: string;
	title: string;
	summary: string | null;
	tags: readonly string[];
	absolutePath: string;
}

export interface KbFilterByTagsViewProps {
	emptyLabel: string;
	hitCountLabel: string;
	pages: readonly KbFilterPageItem[];
}

/** kb_filter_by_tags：命中页列表（标题 + 摘要 + 标签 + 路径）。 */
export function KbFilterByTagsView({
	emptyLabel,
	hitCountLabel,
	pages,
}: KbFilterByTagsViewProps): JSX.Element {
	if (pages.length === 0) {
		return <div className="py-1 text-[11px] text-muted-foreground/50">{emptyLabel}</div>;
	}
	return (
		<div className="flex flex-col gap-1.5">
			<div className="text-[11px] text-muted-foreground/60">{hitCountLabel}</div>
			{pages.map((p) => (
				<div key={p.id} className="rounded-lg border border-input/60 bg-muted/20 px-2.5 py-1.5">
					<div className="text-[12px] font-medium text-foreground">{p.title}</div>
					{p.summary && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{p.summary}</div>}
					{p.tags.length > 0 && (
						<div className="mt-1 flex flex-wrap gap-1">
							{p.tags.map((tag) => (
								<TagChip key={tag} label={tag} />
							))}
						</div>
					)}
					<div className="mt-1 truncate text-[10px] text-muted-foreground/40" title={p.absolutePath}>
						{p.absolutePath}
					</div>
				</div>
			))}
		</div>
	);
}

export interface KbTagItem {
	tag: string;
	count: number;
}

export interface KbListTagsViewProps {
	emptyLabel: string;
	tagCountLabel: string;
	tags: readonly KbTagItem[];
}

/** kb_list_available_tags：标签云（带页数）。 */
export function KbListTagsView({ emptyLabel, tagCountLabel, tags }: KbListTagsViewProps): JSX.Element {
	if (tags.length === 0) {
		return <div className="py-1 text-[11px] text-muted-foreground/50">{emptyLabel}</div>;
	}
	return (
		<div className="flex flex-col gap-1.5">
			<div className="text-[11px] text-muted-foreground/60">{tagCountLabel}</div>
			<div className="flex flex-wrap gap-1.5">
				{tags.map((item) => (
					<TagChip key={item.tag} label={item.tag} count={item.count} />
				))}
			</div>
		</div>
	);
}

export interface KbWritePageViewProps {
	emptyLabel: string;
	actionLabel: string;
	actionIcon: string;
	absolutePath: string;
	movedFromLabel: string | null;
}

/** kb_write_page：写入结果（动作 + 路径）。 */
export function KbWritePageView({
	emptyLabel,
	actionLabel,
	actionIcon,
	absolutePath,
	movedFromLabel,
	isEmpty,
}: KbWritePageViewProps & { isEmpty?: boolean }): JSX.Element {
	if (isEmpty) {
		return <div className="py-1 text-[11px] text-muted-foreground/50">{emptyLabel}</div>;
	}
	return (
		<div className="flex flex-col gap-1 rounded-lg border border-input/60 bg-muted/20 px-2.5 py-1.5">
			<div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
				<span className={`${actionIcon} h-3.5 w-3.5 text-primary`} />
				{actionLabel}
			</div>
			<div className="truncate text-[11px] text-muted-foreground/70" title={absolutePath}>
				{absolutePath}
			</div>
			{movedFromLabel && <div className="text-[10px] text-muted-foreground/40">{movedFromLabel}</div>}
		</div>
	);
}
