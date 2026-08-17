import { useMemo } from "react";
import type { ChangeEntry } from "../git/types";
import { FileIcon } from "./icons";
import { StatusBadge } from "./StatusBadge";

/**
 * Flat ("平铺") view: every changed file as a single row showing basename +
 * dimmed directory + status badge, sorted by path. No directory nesting.
 * Selection is lifted to the parent, mirroring {@link GitFileTree}.
 */
export function GitFlatList({
	entries,
	selectedPath,
	onSelect,
}: {
	entries: readonly ChangeEntry[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
}): JSX.Element {
	const sorted = useMemo(() => [...entries].sort((a, b) => a.path.localeCompare(b.path)), [entries]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
			{sorted.map((entry) => {
				const slash = entry.path.lastIndexOf("/");
				const dir = slash < 0 ? "" : entry.path.slice(0, slash + 1);
				const name = slash < 0 ? entry.path : entry.path.slice(slash + 1);
				const selected = entry.path === selectedPath;
				return (
					<button
						type="button"
						key={entry.path}
						onClick={() => onSelect(entry.path)}
						title={entry.origPath ? `${entry.origPath} → ${entry.path}` : entry.path}
						className={`flex items-center gap-1.5 px-2 py-1 text-left text-[12px] transition-colors ${
							selected ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50"
						}`}
					>
						<FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
						<span className="min-w-0 flex-1 truncate">
							<span>{name}</span>
							{dir && <span className="text-muted-foreground/60"> {dir}</span>}
						</span>
						<StatusBadge code={entry.code} />
					</button>
				);
			})}
		</div>
	);
}
