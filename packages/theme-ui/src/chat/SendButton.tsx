import { memo, useEffect, useRef, useState, type JSX } from "react";
import { useThemeSurface } from "@astravia/theme-sdk/appearance";
import { ThemeSurface } from "../appearance/ThemeSurface";
import "./send-button.css";

export interface SendButtonLabels {
	sendMessage: string;
	stopGenerating: string;
}

export interface SendButtonProps {
	canSend: boolean;
	isStreaming: boolean;
	labels: SendButtonLabels;
	onSend: () => void;
	onAbort: () => void;
}

type IconState = "send" | "to-stop" | "stop" | "to-send";

export const SendButton = memo(function SendButton({
	canSend,
	isStreaming,
	labels,
	onSend,
	onAbort,
}: SendButtonProps): JSX.Element {
	const surface = useThemeSurface("chat.sendButton");
	const isActive = isStreaming || canSend;
	const wasStreamingRef = useRef(isStreaming);
	const [iconState, setIconState] = useState<IconState>(isStreaming ? "stop" : "send");
	const [showOutgoingArrow, setShowOutgoingArrow] = useState(false);

	useEffect(() => {
		if (!wasStreamingRef.current && isStreaming) {
			setShowOutgoingArrow(true);
			setIconState("to-stop");
		} else if (wasStreamingRef.current && !isStreaming) {
			setShowOutgoingArrow(false);
			setIconState("to-send");
		}
		wasStreamingRef.current = isStreaming;
	}, [isStreaming]);

	function handleStemAnimationEnd(): void {
		if (iconState === "to-stop") {
			setIconState("stop");
		} else if (iconState === "to-send") {
			setIconState("send");
		}
	}

	return (
		<span
			className={["send-button-wrap relative inline-flex h-8 w-8 items-center justify-center", surface?.rootClassName]
				.filter(Boolean)
				.join(" ")}
			data-active={isActive}
			data-streaming={isStreaming}
			data-theme-surface-root="chat.sendButton"
		>
			<ThemeSurface slot="chat.sendButton" />
			{isStreaming ? (
				<>
					<span aria-hidden className="send-button-ripple send-button-ripple-1" />
					<span aria-hidden className="send-button-ripple send-button-ripple-2" />
				</>
			) : null}
			<button
				type="button"
				onClick={isStreaming ? onAbort : onSend}
				disabled={!isStreaming && !canSend}
				className="send-button relative z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full transition-shadow disabled:cursor-not-allowed"
				data-icon-state={iconState}
				title={isStreaming ? labels.stopGenerating : labels.sendMessage}
			>
				{showOutgoingArrow ? (
					<span
						aria-hidden
						className="send-button-outgoing-arrow"
						onAnimationEnd={() => setShowOutgoingArrow(false)}
					>
						<span className="send-button-outgoing-stem" />
						<span className="send-button-outgoing-side send-button-outgoing-side-left" />
						<span className="send-button-outgoing-side send-button-outgoing-side-right" />
					</span>
				) : null}

				<span aria-hidden className="send-button-icon">
					<span className="send-button-stem" onAnimationEnd={handleStemAnimationEnd} />
					<span className="send-button-side send-button-side-left" />
					<span className="send-button-side send-button-side-right" />
				</span>
			</button>
		</span>
	);
});
