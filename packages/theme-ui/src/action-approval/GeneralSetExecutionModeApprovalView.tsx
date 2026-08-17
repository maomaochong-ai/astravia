import type { ComponentType, JSX, ReactNode } from "react";
import { cn } from "./cn";
import { ApprovalFormField, ApprovalImpactCard, ApprovalRawFallback, type ApprovalRawFallbackLabels } from "./ApprovalParts";
import type { ManageActionApprovalFrameProps } from "./ManageActionApprovalFrameTypes";

export type ExecutionModeOption = "sandbox" | "full-access";

export interface GeneralSetExecutionModeApprovalViewProps {
	readonly Frame: ComponentType<ManageActionApprovalFrameProps>;
	readonly frame: Omit<ManageActionApprovalFrameProps, "children">;
	readonly hasInput: boolean;
	readonly rawInput: unknown;
	readonly rawFallbackLabels: ApprovalRawFallbackLabels;
	readonly mode: ExecutionModeOption;
	readonly modes: readonly ExecutionModeOption[];
	readonly modeLabel: (mode: ExecutionModeOption) => string;
	readonly modeHint: (mode: ExecutionModeOption) => string;
	readonly executionModeFieldLabel: string;
	readonly impactTitle: string;
	readonly impactDescription: string;
	readonly icon: string;
	readonly onModeChange: (mode: ExecutionModeOption) => void;
	readonly extra?: ReactNode;
}

export function GeneralSetExecutionModeApprovalView({
	Frame,
	frame,
	hasInput,
	rawInput,
	rawFallbackLabels,
	mode,
	modes,
	modeLabel,
	modeHint,
	executionModeFieldLabel,
	impactTitle,
	impactDescription,
	icon,
	onModeChange,
}: GeneralSetExecutionModeApprovalViewProps): JSX.Element {
	return (
		<Frame {...frame}>
			{hasInput ? (
				<>
					<ApprovalFormField id="execution-mode" label={executionModeFieldLabel}>
						<div className="grid grid-cols-1 gap-2">
							{modes.map((candidate) => {
								const active = mode === candidate;
								return (
									<button
										key={candidate}
										type="button"
										onClick={() => onModeChange(candidate)}
										className={cn(
											"rounded-lg border px-3 py-2.5 text-left transition-colors",
											active
												? "border-primary/70 bg-primary/5 ring-1 ring-inset ring-primary/30"
												: "border-border hover:border-primary/40 hover:bg-accent/40",
										)}
									>
										<div className="text-[12px] font-medium text-foreground">{modeLabel(candidate)}</div>
										<div className="mt-0.5 text-[10px] text-muted-foreground">{modeHint(candidate)}</div>
									</button>
								);
							})}
						</div>
					</ApprovalFormField>
					<ApprovalImpactCard icon={icon} title={impactTitle} description={impactDescription} />
				</>
			) : (
				<ApprovalRawFallback input={rawInput} labels={rawFallbackLabels} />
			)}
		</Frame>
	);
}
