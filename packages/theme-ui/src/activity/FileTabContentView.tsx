import { type JSX, type ReactNode } from "react";
import { ResizeHandle } from "../layout/ResizeHandle";

export interface FileTabContentViewProps {
	showTree: boolean;
	showPreview: boolean;
	treeWidth: number;
	onTreeResize: (delta: number) => void;
	/** Host file tree panel. */
	tree: ReactNode;
	/** Host preview panel (null when not showing). */
	preview: ReactNode;
}

/**
 * File tab split layout: tree + optional preview. Host injects FilesPanel / FilePreviewView.
 */
export function FileTabContentView({
	showTree,
	showPreview,
	treeWidth,
	onTreeResize,
	tree,
	preview,
}: FileTabContentViewProps): JSX.Element {
	return (
		<div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
			{showTree && (
				<div
					className={
						showPreview
							? "relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border/50"
							: "flex h-full min-h-0 flex-1 flex-col overflow-hidden"
					}
					style={showPreview ? { width: treeWidth } : undefined}
				>
					<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{tree}</div>
					{showPreview && <ResizeHandle side="right" onResize={onTreeResize} />}
				</div>
			)}
			{showPreview && preview && (
				<div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{preview}</div>
			)}
		</div>
	);
}
