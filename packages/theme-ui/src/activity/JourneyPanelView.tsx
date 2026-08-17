import type { JSX } from "react";

export interface JourneyUserIdentity {
	name: string;
	avatar: string;
}

export interface JourneyFileItem {
	key: string;
	name: string;
	title: string;
	storageKey: string;
	disabled: boolean;
}

export interface JourneyTransferViewItem {
	id: number;
	statusLabel: string;
	statusClassName: string;
	sender: JourneyUserIdentity;
	receiver: JourneyUserIdentity;
	sentAtLabel: string;
	isExpanded: boolean;
	expandToggleLabel: string;
	subtitleDetail: string;
	message: string;
	files: readonly JourneyFileItem[];
}

export interface JourneyStageViewItem {
	key: string;
	index: number;
	isLast: boolean;
	name: string;
	subtitle: string;
	statusLabel: string;
	statusClassName: string;
	members: readonly (JourneyUserIdentity & { id: number })[];
	enteredAt: string;
	completedAt: string;
	resultFiles: readonly JourneyFileItem[];
	transfers: readonly JourneyTransferViewItem[];
}

export interface JourneyPanelViewLabels {
	badge: string;
	stageCount: string;
	transferCount: string;
	memberLabel: string;
	noMembers: string;
	enteredAt: string;
	completedAt: string;
	stageOutputFiles: string;
	senderReceiver: string;
	subtitle: string;
	attachedMessage: string;
	attachedFiles: string;
	none: string;
	noTransfers: string;
	notWorkflow: string;
	empty: string;
}

export type JourneyPanelViewState =
	| { kind: "loading" }
	| { kind: "notWorkflow"; labels: Pick<JourneyPanelViewLabels, "notWorkflow"> }
	| { kind: "error"; message: string }
	| { kind: "empty"; labels: Pick<JourneyPanelViewLabels, "empty"> }
	| {
			kind: "ready";
			workflowName: string;
			labels: JourneyPanelViewLabels;
			stages: readonly JourneyStageViewItem[];
			onToggleTransfer: (transferId: number) => void;
			onOpenFile: (storageKey: string, displayName: string) => void;
	  };

function UserIdentity({
	name,
	avatar,
	className = "",
}: {
	name: string;
	avatar: string;
	className?: string;
}): JSX.Element {
	return (
		<div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
			{avatar ? (
				<img src={avatar} alt={name} className="h-5 w-5 shrink-0 rounded-full border border-border object-cover" />
			) : (
				<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40">
					<span className="icon-[mdi--account-outline] text-[11px] text-muted-foreground/70" />
				</div>
			)}
			<span className="truncate text-[11px] text-foreground/90">{name}</span>
		</div>
	);
}

/**
 * Workflow journey timeline UI. Host pre-resolves users, status labels, and file handlers.
 */
export function JourneyPanelView(props: JourneyPanelViewState): JSX.Element {
	if (props.kind === "loading") {
		return (
			<div className="flex h-full items-center justify-center">
				<span className="icon-[mdi--loading] h-5 w-5 animate-spin text-muted-foreground/50" />
			</div>
		);
	}

	if (props.kind === "notWorkflow") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
				<span className="icon-[mdi--timeline-outline] text-[28px]" />
				<span className="text-[12px]">{props.labels.notWorkflow}</span>
			</div>
		);
	}

	if (props.kind === "error") {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-muted-foreground/60">
				{props.message}
			</div>
		);
	}

	if (props.kind === "empty") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/50">
				<span className="icon-[mdi--timeline-outline] text-[28px]" />
				<span className="text-[12px]">{props.labels.empty}</span>
			</div>
		);
	}

	const { workflowName, labels, stages, onToggleTransfer, onOpenFile } = props;

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-border px-4 py-3">
				<div className="rounded-xl border border-border bg-gradient-to-b from-background to-muted/30 p-3">
					<div className="mb-1 flex items-center justify-between">
						<h3 className="text-[13px] font-semibold text-foreground">{workflowName}</h3>
						<span className="rounded-full bg-accent/70 px-2 py-0.5 text-[10px] text-muted-foreground">
							{labels.badge}
						</span>
					</div>
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
						<span>{labels.stageCount}</span>
						<span className="text-muted-foreground/40">•</span>
						<span>{labels.transferCount}</span>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				<div className="space-y-3">
					{stages.map((stage) => (
						<div key={stage.key} className="relative pl-8">
							{!stage.isLast && <div className="absolute left-[11px] top-6 h-[calc(100%-6px)] w-px bg-border" />}
							<div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-muted-foreground">
								{stage.index + 1}
							</div>

							<div className="rounded-lg border border-border bg-background/90 p-3">
								<div className="mb-2 flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="truncate text-[13px] font-semibold text-foreground">{stage.name}</div>
										<div className="mt-0.5 text-[11px] text-muted-foreground/70">{stage.subtitle}</div>
									</div>
									<span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${stage.statusClassName}`}>
										{stage.statusLabel}
									</span>
								</div>

								<div className="mb-2 flex flex-wrap gap-1.5">
									{stage.members.length > 0 ? (
										stage.members.map((member) => (
											<div className="flex items-center px-2" key={member.id}>
												<div className="text-[11px]">{labels.memberLabel}</div>
												<div className="max-w-full">
													<UserIdentity name={member.name} avatar={member.avatar} />
												</div>
											</div>
										))
									) : (
										<span className="text-[10px] text-muted-foreground/50">{labels.noMembers}</span>
									)}
								</div>

								<div className="grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground/70">
									<div className="rounded-md bg-muted/35 px-2 py-1.5">
										<div className="mb-px text-[10px] uppercase tracking-wide text-muted-foreground/45">
											{labels.enteredAt}
										</div>
										<div className="font-medium text-foreground/80">{stage.enteredAt}</div>
									</div>
									<div className="rounded-md bg-muted/35 px-2 py-1.5">
										<div className="mb-px text-[10px] uppercase tracking-wide text-muted-foreground/45">
											{labels.completedAt}
										</div>
										<div className="font-medium text-foreground/80">{stage.completedAt}</div>
									</div>
								</div>

								{stage.resultFiles.length > 0 && (
									<div className="mt-2 rounded-md border border-emerald-500 bg-emerald-500/5 px-2 py-1.5">
										<div className="mb-1 text-[10px] font-medium text-emerald-400">{labels.stageOutputFiles}</div>
										<div className="flex flex-wrap gap-1">
											{stage.resultFiles.map((file) => (
												<button
													type="button"
													key={file.key}
													onClick={() => onOpenFile(file.storageKey, file.name)}
													disabled={file.disabled}
													className="max-w-full truncate rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground/80 transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
													title={file.title}
												>
													{file.name}
												</button>
											))}
										</div>
									</div>
								)}

								{stage.transfers.length > 0 ? (
									<div className="relative mt-2 pl-4">
										<div className="absolute bottom-2 left-[3px] top-2 w-px bg-border" />
										<div className="space-y-2">
											{stage.transfers.map((transfer) => (
												<div key={transfer.id} className="relative">
													<div className="absolute -left-4 top-[12px] h-2 w-2 rounded-full bg-muted-foreground/45" />
													<div className="rounded-md border border-border bg-background/70 p-2">
														<div className="flex items-center gap-1.5">
															<div className="flex shrink-0 items-center gap-1.5">
																<span
																	className={`rounded-full px-1.5 py-0.5 text-[9px] ${transfer.statusClassName}`}
																>
																	{transfer.statusLabel}
																</span>
																<button
																	type="button"
																	onClick={() => onToggleTransfer(transfer.id)}
																	className="rounded bg-muted/45 px-1.5 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
																>
																	{transfer.expandToggleLabel}
																</button>
															</div>
														</div>
														<div className="mt-1 text-[10px] text-muted-foreground/55">{labels.senderReceiver}</div>
														<div className="mt-1 flex min-w-0 items-center gap-2">
															<UserIdentity
																name={transfer.sender.name}
																avatar={transfer.sender.avatar}
																className="max-w-[40%]"
															/>
															<span className="icon-[mdi--arrow-right] shrink-0 text-[13px] text-muted-foreground/45" />
															<UserIdentity
																name={transfer.receiver.name}
																avatar={transfer.receiver.avatar}
																className="max-w-[40%]"
															/>
														</div>
														<div className="mt-1 text-[10px] text-muted-foreground/65">{transfer.sentAtLabel}</div>

														{transfer.isExpanded && (
															<div className="mt-2 space-y-1">
																<div className="rounded bg-muted/30 px-1.5 py-1">
																	<div className="text-[10px] text-muted-foreground/55">{labels.subtitle}</div>
																	<div className="mt-0.5 text-[10px] text-foreground/85">
																		{transfer.subtitleDetail}
																	</div>
																</div>
																<div className="rounded bg-muted/30 px-1.5 py-1">
																	<div className="flex items-center gap-1 text-[10px] text-muted-foreground/55">
																		<span className="icon-[mdi--message-text-outline] text-[11px]" />
																		{labels.attachedMessage}
																	</div>
																	<div className="mt-0.5 text-[10px] text-foreground/85">{transfer.message}</div>
																</div>
																<div className="rounded bg-muted/30 px-1.5 py-1">
																	<div className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/55">
																		<span className="icon-[mdi--paperclip] text-[11px]" />
																		{labels.attachedFiles}
																	</div>
																	{transfer.files.length > 0 ? (
																		<div className="flex flex-wrap gap-1">
																			{transfer.files.map((file) => (
																				<button
																					type="button"
																					key={file.key}
																					onClick={() => onOpenFile(file.storageKey, file.name)}
																					disabled={file.disabled}
																					className="max-w-full truncate rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-foreground/75 transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
																					title={file.title}
																				>
																					{file.name}
																				</button>
																			))}
																		</div>
																	) : (
																		<div className="text-[10px] text-muted-foreground/50">{labels.none}</div>
																	)}
																</div>
															</div>
														)}
													</div>
												</div>
											))}
										</div>
									</div>
								) : (
									<div className="mt-2 rounded bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground/55">
										{labels.noTransfers}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
