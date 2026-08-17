import { ContextRingView } from "@astravia/theme-ui/chat";
import { useContextRingModel } from "../hooks/useContextRingModel";

export function ContextRing({ className }: { className?: string } = {}): JSX.Element | null {
	const model = useContextRingModel();
	if (!model) return null;
	return (
		<ContextRingView
			percent={model.percent}
			offset={model.offset}
			color={model.color}
			isCompacting={model.isCompacting}
			tooltip={model.tooltip}
			className={className}
		/>
	);
}
