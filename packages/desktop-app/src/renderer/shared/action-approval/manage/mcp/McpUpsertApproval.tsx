import type { DesktopActionJsonValue } from "@preload/api.js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../../../components/ui/input";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalFormField,
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
	ApprovalValueList,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface McpUpsertInput {
	operation: "upsert";
	name: string;
	data?: {
		type?: "stdio" | "http";
		command?: string;
		args?: string[];
		cwd?: string;
		url?: string;
		headers?: Record<string, string>;
	};
	approvalUi?: string;
}

function parseInput(input: unknown): McpUpsertInput | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	if (record.operation !== "upsert" || typeof record.name !== "string") return null;
	return record as unknown as McpUpsertInput;
}


/** Model marker for inventory thin/container-with-view classification. */
function useMcpUpsertApprovalModel(approval: ActiveActionApproval): ActiveActionApproval {
	return approval;
}

export function McpUpsertApproval(): JSX.Element | null {
	const approval = useActionApproval("mcp.upsert");
	if (!approval) return null;
	return <McpUpsertApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function McpUpsertApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { ManageActionApprovalFrame, t, frameLabels } = useManageApprovalFrame();
	const _approvalModel = useMcpUpsertApprovalModel(approval);
	void _approvalModel;
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [form, setForm] = useState({
		command: input?.data?.command ?? "",
		url: input?.data?.url ?? "",
		cwd: input?.data?.cwd ?? "",
		argsText: (input?.data?.args ?? []).join(" "),
	});
	const [serverType, setServerType] = useState<"stdio" | "http">(
		input?.data?.type === "http" || input?.data?.url ? "http" : "stdio",
	);

	useEffect(() => {
		if (!input?.name) return;
		let cancelled = false;
		void window.astravia.mcp
			.get()
			.then((config) => {
				if (cancelled) return;
				const existing = config.mcpServers[input.name];
				if (!existing) return;
				if (existing.type === "http") {
					setServerType("http");
					setForm((prev) => ({ ...prev, url: prev.url || existing.url || "" }));
				} else {
					setServerType("stdio");
					setForm((prev) => ({
						...prev,
						command: prev.command || existing.command || "",
						cwd: prev.cwd || existing.cwd || "",
						argsText: prev.argsText || (existing.args ?? []).join(" "),
					}));
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [input?.name]);

	const onApprove = (): void => {
		if (!input) {
			approve();
			return;
		}
		const data: Record<string, DesktopActionJsonValue> = {
			...(input.data as Record<string, DesktopActionJsonValue> | undefined),
		};
		if (serverType === "http") {
			data.type = "http";
			if (form.url.trim()) data.url = form.url.trim();
		} else {
			if (form.command.trim()) data.command = form.command.trim();
			if (form.cwd.trim()) data.cwd = form.cwd.trim();
			const args = form.argsText.trim().split(/\s+/).filter(Boolean);
			if (args.length > 0) data.args = args;
		}
		approve({
			operation: "upsert",
			name: input.name,
			data,
			approvalUi: input.approvalUi ?? "mcp.upsert",
		});
	};

	return (
		<ManageActionApprovalFrame
			presentation="drawer"
			title={t("manageApproval.mcp.ops.upsert.title")}
			summary={t("manageApproval.mcp.ops.upsert.summary")}
			icon="icon-[mdi--connection]"
			badge={t("manageApproval.mcp.ops.upsert.badge")}
			labels={frameLabels(request.permission, t("manageApproval.mcp.ops.upsert.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={onApprove}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard
						icon="icon-[mdi--server-network]"
						title={input.name}
						subtitle={t("manageApproval.fields.serverName")}
						badge={serverType}
					/>
					{serverType === "stdio" ? (
						<>
							<ApprovalFormField id="mcp-command" label={t("manageApproval.fields.command")}>
								<Input
									id="mcp-command"
									value={form.command}
									onChange={(event) => setForm((prev) => ({ ...prev, command: event.target.value }))}
								/>
							</ApprovalFormField>
							<ApprovalFormField id="mcp-args" label={t("manageApproval.fields.args")}>
								<Input
									id="mcp-args"
									value={form.argsText}
									onChange={(event) => setForm((prev) => ({ ...prev, argsText: event.target.value }))}
								/>
							</ApprovalFormField>
							<ApprovalFormField id="mcp-cwd" label={t("manageApproval.fields.cwd")}>
								<Input
									id="mcp-cwd"
									value={form.cwd}
									onChange={(event) => setForm((prev) => ({ ...prev, cwd: event.target.value }))}
								/>
							</ApprovalFormField>
						</>
					) : (
						<ApprovalFormField id="mcp-url" label={t("manageApproval.fields.url")}>
							<Input
								id="mcp-url"
								value={form.url}
								onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
							/>
						</ApprovalFormField>
					)}
					{input.data?.headers && (
						<ApprovalValueList
							rows={[{ label: t("manageApproval.fields.headers"), value: t("manageApproval.mcp.headersConfigured") }]}
						/>
					)}
					<ApprovalImpactCard
						icon="icon-[mdi--connection]"
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.mcp.ops.upsert.impact")}
					/>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</ManageActionApprovalFrame>
	);
}
