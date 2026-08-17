import type { JSX } from "react";
import type { SheetModel } from "./types";

interface SheetTabsProps {
	sheets: SheetModel[];
	activeSheet: number;
	onSelect: (index: number) => void;
}

export function SheetTabs({ sheets, activeSheet, onSelect }: SheetTabsProps): JSX.Element {
	return (
		<div className="flex shrink-0 gap-1 overflow-x-auto border-t border-[var(--border)] bg-[var(--muted)] px-2 py-1.5">
			{sheets.map((sheet, index) => (
				<button
					key={`${sheet.name}-${index}`}
					type="button"
					onClick={() => onSelect(index)}
					className={
						index === activeSheet
							? "shrink-0 rounded-md bg-[var(--background)] px-3 py-1 text-[12px] font-medium text-[var(--foreground)] shadow-sm"
							: "shrink-0 rounded-md px-3 py-1 text-[12px] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
					}
				>
					{sheet.name}
				</button>
			))}
		</div>
	);
}
