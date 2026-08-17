import type { JSX } from "react";

export interface BatchProjectNameFieldViewProps {
	readonly name: string;
	readonly onChange: (value: string) => void;
	readonly placeholder: string;
}

export function BatchProjectNameFieldView({
	name,
	onChange,
	placeholder,
}: BatchProjectNameFieldViewProps): JSX.Element {
	return (
		<div className="flex items-center gap-3">
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
				<span className="icon-[solar--layers-linear] h-4 w-4 text-primary" />
			</div>
			<input
				value={name}
				onChange={(event) => onChange(event.target.value)}
				className="h-8 w-full border-none bg-transparent text-[15px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40 focus:outline-none! focus-visible:outline-none!"
				placeholder={placeholder}
				// biome-ignore lint/a11y/noAutofocus: preserve form autofocus behavior
				autoFocus
			/>
		</div>
	);
}
