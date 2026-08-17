import type { JSX } from "react";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@astravia/ui";

export type WechatBindDialogBodyKind = "bound" | "loading" | "failed" | "confirmed" | "qr";

export interface WechatBindDialogViewLabels {
	readonly title: string;
	readonly bindDesc: string;
	readonly bindGenerating: string;
	readonly bindFailed: string;
	readonly retry: string;
	readonly bindSuccessTitle: string;
	readonly bindSuccessDesc: string;
	readonly scanToAuthorize: string;
	readonly unbindAccount: string;
	readonly bindDone: string;
	readonly cancel: string;
}

export interface WechatBindDialogViewProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly bodyKind: WechatBindDialogBodyKind;
	readonly bound: boolean;
	readonly error: string | null;
	readonly ilinkBotId: string | null;
	readonly ilinkUserId: string | null;
	readonly progressLabel: string;
	readonly qrDataUrl: string | null;
	readonly onStart: () => void;
	readonly onLogout: () => void;
	readonly labels: WechatBindDialogViewLabels;
}

export function WechatBindDialogView({
	open,
	onOpenChange,
	bodyKind,
	bound,
	error,
	ilinkBotId,
	ilinkUserId,
	progressLabel,
	qrDataUrl,
	onStart,
	onLogout,
	labels,
}: WechatBindDialogViewProps): JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[460px]">
				<DialogHeader>
					<DialogTitle>{labels.title}</DialogTitle>
					<DialogDescription>{labels.bindDesc}</DialogDescription>
				</DialogHeader>

				{bodyKind === "bound" ? (
					<div className="space-y-3 py-2 text-[12px] text-foreground">
						<div className="rounded-md border border-input bg-secondary px-3 py-2">
							<div className="text-muted-foreground">ilink_bot_id</div>
							<div className="break-all font-mono text-[11px]">{ilinkBotId ?? "—"}</div>
						</div>
						<div className="rounded-md border border-input bg-secondary px-3 py-2">
							<div className="text-muted-foreground">ilink_user_id</div>
							<div className="break-all font-mono text-[11px]">{ilinkUserId ?? "—"}</div>
						</div>
					</div>
				) : bodyKind === "loading" ? (
					<div className="flex flex-col items-center gap-3 py-10 text-center text-[12px] text-muted-foreground">
						<span className="icon-[mdi--loading] h-6 w-6 animate-spin" />
						<div>{labels.bindGenerating}</div>
					</div>
				) : bodyKind === "failed" ? (
					<div className="flex flex-col items-center gap-3 py-6 text-center">
						<span className="icon-[mdi--close-circle] h-10 w-10 text-destructive" />
						<div className="text-[12px] text-destructive">{error ?? labels.bindFailed}</div>
						<Button variant="primary" onClick={onStart}>
							{labels.retry}
						</Button>
					</div>
				) : bodyKind === "confirmed" ? (
					<div className="flex flex-col items-center gap-3 py-8 text-center">
						<span className="icon-[mdi--check-circle] h-12 w-12 text-emerald-400" />
						<div className="text-[13px] font-medium text-foreground">{labels.bindSuccessTitle}</div>
						<div className="text-[11px] text-muted-foreground">{labels.bindSuccessDesc}</div>
					</div>
				) : (
					<div className="flex flex-col items-center gap-3 py-3">
						<div className="flex h-[252px] w-[252px] items-center justify-center rounded-md border border-border bg-white p-1.5">
							{qrDataUrl ? (
								<img src={qrDataUrl} alt="WeChat QR" className="h-full w-full" />
							) : (
								<span className="icon-[mdi--loading] h-8 w-8 animate-spin text-muted-foreground" />
							)}
						</div>
						<div className="text-center text-[12px] text-muted-foreground">{progressLabel}</div>
						<div className="text-center text-[11px] text-muted-foreground">{labels.scanToAuthorize}</div>
					</div>
				)}

				<DialogFooter className="gap-2">
					{bound ? (
						<>
							<Button variant="destructive" onClick={onLogout}>
								{labels.unbindAccount}
							</Button>
							<Button variant="primary" onClick={() => onOpenChange(false)}>
								{labels.bindDone}
							</Button>
						</>
					) : (
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							{labels.cancel}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
