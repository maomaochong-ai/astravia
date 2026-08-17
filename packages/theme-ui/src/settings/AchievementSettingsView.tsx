import type { JSX, ReactNode } from "react";
import { MotionSelect } from "./MotionSelect";

export interface AchievementSetOptionView {
	readonly id: string;
	readonly label: string;
}

export interface AchievementSettingsViewProps {
	readonly setSelectorLabel: string;
	readonly selectedSetId: string;
	readonly setOptions: readonly AchievementSetOptionView[];
	readonly onSelectSetId: (id: string) => void;
	readonly carousel: ReactNode;
	readonly promotionDialog: ReactNode;
}

export function AchievementSettingsView({
	setSelectorLabel,
	selectedSetId,
	setOptions,
	onSelectSetId,
	carousel,
	promotionDialog,
}: AchievementSettingsViewProps): JSX.Element {
	return (
		<>
			<div className="mx-auto w-full max-w-[920px] px-8 pb-28 pt-4">
				<div className="mb-4 flex items-center justify-end gap-2">
					<span className="text-[12px] text-muted-foreground">{setSelectorLabel}</span>
					<MotionSelect
						value={selectedSetId}
						onValueChange={onSelectSetId}
						options={setOptions.map((set) => ({ value: set.id, label: set.label }))}
						triggerClassName="min-w-40"
						aria-label={setSelectorLabel}
					/>
				</div>
				{carousel}
			</div>
			{promotionDialog}
		</>
	);
}
