import type { JSX, ReactNode } from "react";

export interface SettingsMenuActionButtonProps {
	children: ReactNode;
	icon: string;
	onClick: () => void;
}

export function SettingsMenuActionButton({
	children,
	icon,
	onClick,
}: SettingsMenuActionButtonProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
		>
			<span className={`${icon} h-3.5 w-3.5`} />
			{children}
		</button>
	);
}
