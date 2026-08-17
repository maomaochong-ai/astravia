import type { ComponentType, JSX } from "react";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	type ApprovalRawFallbackLabels,
	ApprovalTargetCard,
} from "./ApprovalParts";
import type { ManageActionApprovalFrameProps } from "./ManageActionApprovalFrameTypes";

export interface WebhookTestApprovalViewProps {
	readonly Frame: ComponentType<ManageActionApprovalFrameProps>;
	readonly frame: Omit<ManageActionApprovalFrameProps, "children">;
	readonly input: { operation: "test"; id: string } | null;
	readonly rawInput: unknown;
	readonly target: { readonly title: string; readonly subtitle: string };
	readonly impactTitle: string;
	readonly impactDescription: string;
	readonly rawFallbackLabels: ApprovalRawFallbackLabels;
}

export function WebhookTestApprovalView({
	Frame,
	frame,
	input,
	rawInput,
	target,
	impactTitle,
	impactDescription,
	rawFallbackLabels,
}: WebhookTestApprovalViewProps): JSX.Element {
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
						icon="icon-[mdi--test-tube]"
						title={impactTitle}
						description={impactDescription}
					/>
				</>
			) : (
				<ApprovalRawFallback input={rawInput} labels={rawFallbackLabels} />
			)}
		</Frame>
	);
}
