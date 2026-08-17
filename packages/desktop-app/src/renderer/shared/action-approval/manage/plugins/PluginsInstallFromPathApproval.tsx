import { useState } from "react";
import { Input } from "../../../components/ui/input";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalFormField, ApprovalImpactCard, ApprovalRawFallback } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface InputData {
	operation: "install-from-path";
	path: string;
	grantedPermissions?: string[];
	enable?: boolean;
	approvalUi?: string;
}

function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "install-from-path" || typeof r.path !== "string") return null;
	return r as unknown as InputData;
}

export function PluginsInstallFromPathApproval(): JSX.Element | null {
	const approval = useActionApproval("plugins.install-from-path");
	if (!approval) return null;
	return <Content key={approval.request.approvalId} approval={approval} />;
}

function Content({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [path, setPath] = useState(input?.path ?? "");
	return (
		<Frame
			presentation="drawer"
			title={t("manageApproval.plugins.ops.install-from-path.title")}
			summary={t("manageApproval.plugins.ops.install-from-path.summary")}
			icon="icon-[mdi--folder-zip-outline]"
			badge={t("manageApproval.plugins.ops.install-from-path.badge")}
			labels={frameLabels(request.permission, t("manageApproval.plugins.ops.install-from-path.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() =>
				input
					? approve({
							operation: "install-from-path" as const,
							path: path.trim(),
							...(input.grantedPermissions ? { grantedPermissions: input.grantedPermissions } : {}),
							enable: input.enable !== false,
							approvalUi: input.approvalUi ?? "plugins.install-from-path",
						})
					: approve()
			}
			canApprove={path.trim().length > 0}
		>
			{input ? (
				<>
					<ApprovalFormField id="plugin-path" label={t("manageApproval.fields.path")}>
						<Input id="plugin-path" value={path} onChange={(e) => setPath(e.target.value)} />
					</ApprovalFormField>
					<ApprovalImpactCard
						icon="icon-[mdi--shield-key-outline]"
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.plugins.ops.install-from-path.impact")}
					/>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
