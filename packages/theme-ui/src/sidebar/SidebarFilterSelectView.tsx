import { useState, type JSX } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@astravia/ui";
import { cn } from "@astravia/ui";

export interface SidebarFilterSelectOption {
	readonly value: string;
	readonly label: string;
}

export interface SidebarFilterSelectViewProps {
	readonly options: readonly SidebarFilterSelectOption[];
	readonly showGridIcon?: boolean;
	readonly value: string;
	readonly onChange: (value: string) => void;
}

export function SidebarFilterSelectView({
	options,
	showGridIcon = false,
	value,
	onChange,
}: SidebarFilterSelectViewProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const current = options.find((option) => option.value === value) ?? options[0];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						// 与侧栏「更多」触发器对齐：icon h-4 + gap-2。
						"no-drag flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 text-[12px] font-medium transition-colors",
						open
							? "bg-accent text-foreground"
							: "text-muted-foreground/80 hover:bg-accent hover:text-foreground",
					)}
				>
					{showGridIcon && <span className="icon-[solar--widget-4-linear] h-4 w-4 shrink-0" />}
					<span>{current?.label ?? ""}</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				sideOffset={4}
				className="w-[140px] gap-0 overflow-hidden rounded-lg border border-border p-1"
			>
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => {
							onChange(option.value);
							setOpen(false);
						}}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors",
							value === option.value
								? "bg-primary text-primary-foreground"
								: "text-foreground hover:bg-accent",
						)}
					>
						<span>{option.label}</span>
						{value === option.value && (
							<span className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5" />
						)}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
