import type { JSX, ReactNode } from "react";
import { MotionSelect } from "./MotionSelect";
import { SettingRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";

export type AppshotPermissionStatusView = "granted" | "denied" | "unknown";

export interface AppshotSelectOptionView {
	readonly value: string;
	readonly label: string;
}

export interface AppshotSettingsViewLabels {
	readonly title: string;
	readonly sectionShortcut: string;
	readonly shortcutTitle: string;
	readonly shortcutDescription: string;
	readonly sectionPermissions: string;
	readonly permissionSectionDescription: string;
	readonly permissions: {
		readonly accessibilityTitle: string;
		readonly accessibilityDescription: string;
		readonly screenTitle: string;
		readonly screenDescription: string;
	};
	readonly status: Record<AppshotPermissionStatusView, string>;
	readonly permissionHint: string;
	readonly setupPermissions: string;
}

export interface AppshotSettingsViewProps {
	readonly labels: AppshotSettingsViewLabels;
	readonly subtitle: ReactNode;
	readonly gestureSection: SettingSectionMeta;
	readonly permissionsSection: SettingSectionMeta;
	readonly showKeyboardPreview: boolean;
	readonly keyboardPreview: ReactNode;
	readonly gestureValue: string;
	readonly gestureOptions: readonly AppshotSelectOptionView[];
	readonly onGestureChange: (value: string) => void;
	readonly accessibilityStatus: AppshotPermissionStatusView;
	readonly screenStatus: AppshotPermissionStatusView;
	readonly onOpenOnboarding: () => void;
}

const STATUS_DOT: Record<AppshotPermissionStatusView, string> = {
	granted: "bg-emerald-500",
	denied: "bg-amber-500",
	unknown: "bg-muted-foreground/50",
};

const STATUS_TEXT_CLASS: Record<AppshotPermissionStatusView, string> = {
	granted: "text-emerald-500",
	denied: "text-amber-500",
	unknown: "text-muted-foreground",
};

function StatusBadge({
	labels,
	status,
}: {
	labels: AppshotSettingsViewLabels["status"];
	status: AppshotPermissionStatusView;
}): JSX.Element {
	return (
		<span className={`inline-flex items-center gap-1.5 text-[12px] ${STATUS_TEXT_CLASS[status]}`}>
			<span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
			{labels[status]}
		</span>
	);
}

export function AppshotSettingsView({
	labels,
	subtitle,
	gestureSection,
	permissionsSection,
	showKeyboardPreview,
	keyboardPreview,
	gestureValue,
	gestureOptions,
	onGestureChange,
	accessibilityStatus,
	screenStatus,
	onOpenOnboarding,
}: AppshotSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<h1 className="mb-1.5 text-[20px] font-bold text-foreground">{labels.title}</h1>
			<p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>

			<SettingSection title={labels.sectionShortcut} section={gestureSection}>
				<SettingRow title={labels.shortcutTitle} description={labels.shortcutDescription} border={false}>
					<MotionSelect
						value={gestureValue}
						onValueChange={onGestureChange}
						options={gestureOptions}
						triggerClassName="min-w-[150px]"
					/>
				</SettingRow>
			</SettingSection>

			{showKeyboardPreview && <div className="mb-6 px-1.5">{keyboardPreview}</div>}

			<SettingSection
				title={labels.sectionPermissions}
				section={permissionsSection}
				description={labels.permissionSectionDescription}
			>
				<SettingRow
					title={labels.permissions.accessibilityTitle}
					description={labels.permissions.accessibilityDescription}
				>
					<StatusBadge status={accessibilityStatus} labels={labels.status} />
				</SettingRow>
				<SettingRow title={labels.permissions.screenTitle} description={labels.permissions.screenDescription}>
					<StatusBadge status={screenStatus} labels={labels.status} />
				</SettingRow>
				<div className="flex items-center justify-between gap-4 px-5 py-4">
					<p className="text-[12px] text-muted-foreground">{labels.permissionHint}</p>
					<button
						type="button"
						onClick={onOpenOnboarding}
						className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						<span className="icon-[mdi--shield-key-outline] h-3.5 w-3.5" />
						{labels.setupPermissions}
					</button>
				</div>
			</SettingSection>
		</div>
	);
}
