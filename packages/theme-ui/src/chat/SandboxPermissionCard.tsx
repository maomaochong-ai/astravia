import type { JSX } from "react";

export interface SandboxPermissionCardLabels {
	deny: string;
	allow: string;
	allowSession: string;
}

export interface SandboxPermissionRequestModel {
	title: string;
	message: string;
	sensitive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	onAllowSession?: () => void;
}

export interface SandboxPermissionCardProps {
	labels: SandboxPermissionCardLabels;
	request: SandboxPermissionRequestModel;
}

export function SandboxPermissionCard({ labels, request }: SandboxPermissionCardProps): JSX.Element {
	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2">
				<div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
					<span className="icon-[solar--shield-keyhole-minimalistic-linear] h-4 w-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[13px] font-medium text-foreground">{request.title}</div>
					<div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
						{request.message}
					</div>
				</div>
			</div>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={request.onCancel}
					className="h-7 rounded-lg px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					{labels.deny}
				</button>
				<button
					type="button"
					onClick={request.onConfirm}
					className="h-7 rounded-lg bg-amber-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-amber-600"
				>
					{labels.allow}
				</button>
				{!request.sensitive && request.onAllowSession ? (
					<button
						type="button"
						onClick={request.onAllowSession}
						className="h-7 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
					>
						{labels.allowSession}
					</button>
				) : null}
			</div>
		</div>
	);
}
