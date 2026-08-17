import type { JSX, ReactNode } from "react";

export interface BatchProjectRuntimeFieldsLabels {
	model: string;
	concurrency: string;
	timeout: string;
	timeoutHint: string;
	sandbox: string;
}

export interface BatchProjectRuntimeFieldsViewProps {
	labels: BatchProjectRuntimeFieldsLabels;
	/** Host ModelSelect node. */
	modelSelect: ReactNode;
	/** Host concurrency Select node. */
	concurrencySelect: ReactNode;
	/** Host timeout Input node. */
	timeoutInput: ReactNode;
	/** Host execution-mode Select node. */
	executionModeSelect: ReactNode;
}

/**
 * Layout-only runtime fields shell. Host injects Select/Input/ModelSelect to keep
 * visual parity with desktop Radix primitives.
 */
export function BatchProjectRuntimeFieldsView({
	labels,
	modelSelect,
	concurrencySelect,
	timeoutInput,
	executionModeSelect,
}: BatchProjectRuntimeFieldsViewProps): JSX.Element {
	return (
		<>
			<div>
				<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
					<span>{labels.model}</span>
				</label>
				{modelSelect}
			</div>

			<div className="flex items-end gap-6">
				<div>
					<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
						<span>{labels.concurrency}</span>
					</label>
					{concurrencySelect}
				</div>
				<div>
					<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
						<span>{labels.timeout}</span>
					</label>
					{timeoutInput}
				</div>
			</div>
			<p className="text-xs text-muted-foreground/60">{labels.timeoutHint}</p>

			<div>
				<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
					<span>{labels.sandbox}</span>
				</label>
				{executionModeSelect}
			</div>
		</>
	);
}
