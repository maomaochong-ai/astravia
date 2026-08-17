import type { JSX } from "react";

export interface AddProjectMenuItemProps {
	icon: string;
	/** Fully resolved label (host i18n). */
	label: string;
	onSelect: () => void;
}

export function AddProjectMenuItem({ icon, label, onSelect }: AddProjectMenuItemProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onSelect}
			className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50"
		>
			<span className={`${icon} h-3.5 w-3.5 shrink-0`} />
			{label}
		</button>
	);
}
