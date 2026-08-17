import type { ComponentType, JSX } from "react";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	type ApprovalRawFallbackLabels,
	ApprovalTargetCard,
	ApprovalWarningCard,
} from "./ApprovalParts";
import type { ManageActionApprovalFrameProps } from "./ManageActionApprovalFrameTypes";

export interface WebhookDeleteApprovalViewProps {
	readonly Frame: ComponentType<ManageActionApprovalFrameProps>;
	readonly frame: Omit<ManageActionApprovalFrameProps, "children">;
	readonly input: { operation: "delete"; id: string } | null;
	readonly rawInput: unknown;
	readonly target: { readonly title: string; readonly subtitle: string };
	readonly impactTitle: string;
	readonly impactDescription: string;
	readonly warning: string;
	readonly rawFallbackLabels: ApprovalRawFallbackLabels;
}

export function WebhookDeleteApprovalView({
	Frame,
	frame,
	input,
	rawInput,
	target,
	impactTitle,
	impactDescription,
	warning,
	rawFallbackLabels,
}: WebhookDeleteApprovalViewProps): JSX.Element {
	return (
		<Frame {...frame}>
			{input ? (
				<>
					<ApprovalTargetCard
						icon="icon-[mdi--webhook]"
						title={target.title}
						subtitle={target.subtitle}
					/>
					<ApprovalImpactCard
						icon="icon-[mdi--delete-outline]"
						title={impactTitle}
						description={impactDescription}
						destructive
					/>
					<ApprovalWarningCard>{warning}</ApprovalWarningCard>
				</>
			) : (
				<ApprovalRawFallback input={rawInput} labels={rawFallbackLabels} />
			)}
		</Frame>
	);
}
