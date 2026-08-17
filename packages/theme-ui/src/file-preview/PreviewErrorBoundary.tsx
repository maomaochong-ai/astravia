import { Component, type ErrorInfo, type ReactNode } from "react";

export interface PreviewErrorBoundaryProps {
	/** When resetKey changes, clear error so new children can render. */
	resetKey?: unknown;
	children: ReactNode;
	fallback?: ReactNode;
	/** Default fallback message when `fallback` is not provided. */
	errorMessage?: string;
}

interface State {
	error: Error | null;
}

/**
 * Local error boundary for preview subtrees.
 * Keeps render/commit failures inside the preview region.
 */
export class PreviewErrorBoundary extends Component<PreviewErrorBoundaryProps, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidUpdate(prevProps: PreviewErrorBoundaryProps): void {
		if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
			this.setState({ error: null });
		}
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("[PreviewErrorBoundary]", error, info.componentStack);
	}

	render(): ReactNode {
		if (this.state.error) {
			if (this.props.fallback) return this.props.fallback;
			return (
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground/50">
					<span className="icon-[mdi--alert-circle-outline] text-[40px]" />
					<span className="text-[13px]">
						{this.props.errorMessage ?? "Preview failed; file may be corrupt or unsupported"}
					</span>
				</div>
			);
		}
		return this.props.children;
	}
}
