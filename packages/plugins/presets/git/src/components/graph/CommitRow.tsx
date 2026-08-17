import type { CommitNode } from "../../git/types";

type RefChip = { key: string; label: string; kind: "head" | "branch" | "tag" };

function classifyRefs(refs: readonly string[]): RefChip[] {
	return refs.map((r) => {
		if (r === "HEAD") return { key: r, label: "HEAD", kind: "head" };
		if (r.startsWith("tag: ")) return { key: r, label: r.slice(5), kind: "tag" };
		return { key: r, label: r, kind: "branch" };
	});
}

const CHIP_CLASS: Record<RefChip["kind"], string> = {
	head: "border-primary/60 text-primary",
	branch: "border-border text-muted-foreground",
	tag: "border-amber-500/40 text-amber-500",
};

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Compact, locale-aware relative time for the hover badge (e.g. "3 days ago"). */
function relativeTime(ts: number, locale: string): string {
	if (!ts) return "";
	const diff = ts * 1000 - Date.now();
	const abs = Math.abs(diff);
	const rtf = new Intl.RelativeTimeFormat(locale || undefined, { numeric: "auto" });
	if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
	if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
	if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), "day");
	if (abs < 365 * DAY) return rtf.format(Math.round(diff / DAY / 30), "month");
	return rtf.format(Math.round(diff / DAY / 365), "year");
}

/**
 * One HTML commit row, vertically aligned to its graph dot. The full-width outer
 * band is the click/hit target (so clicking the dot area selects too); the inner
 * panel (offset past the lanes) carries the highlight, ref chips, ellipsised
 * subject, and hover-revealed author/time badges.
 */
export function CommitRow({
	node,
	selected,
	graphWidth,
	top,
	height,
	locale,
	onSelect,
}: {
	node: CommitNode;
	selected: boolean;
	graphWidth: number;
	top: number;
	height: number;
	locale: string;
	onSelect: (hash: string) => void;
}): JSX.Element {
	const chips = classifyRefs(node.refs);
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: rows mirror the file-list affordance; pointer selection only
		<div
			onClick={() => onSelect(node.hash)}
			style={{ position: "absolute", top, height, left: 0, right: 0 }}
			className="group cursor-pointer"
		>
			<div
				style={{ marginLeft: graphWidth }}
				className={`relative flex h-full items-center gap-1.5 rounded px-2 text-[12px] ${
					selected ? "bg-accent text-foreground" : "text-foreground group-hover:bg-accent"
				}`}
			>
				{chips.map((c) => (
					<span key={c.key} className={`shrink-0 rounded border px-1 text-[10px] leading-[1.5] ${CHIP_CLASS[c.kind]}`}>
						{c.label}
					</span>
				))}
				{/* Subject takes the full row width; the badges overlay its right edge on hover. */}
				<span className="min-w-0 flex-1 truncate" title={node.subject}>
					{node.subject}
				</span>
				<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pl-12 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
					{/* Right-to-left fade so the subject tail dissolves under the badge. */}
					<div className="absolute inset-0 bg-gradient-to-l from-accent via-accent to-transparent" />
					{/* Solid-backed badge: its own background fully covers the subject behind it. */}
					<div className="relative flex items-center gap-1.5 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm">
						<span className="max-w-[120px] truncate" title={`${node.authorName} <${node.authorEmail}>`}>
							{node.authorName}
						</span>
						<span className="whitespace-nowrap">{relativeTime(node.timestamp, locale)}</span>
					</div>
				</div>
			</div>
		</div>
	);
}
