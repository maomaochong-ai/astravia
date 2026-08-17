import { themeToTreeStyles } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useMemo, useRef } from "react";
import { buildGitStatus } from "../git/gitStatus";
import type { ChangeEntry } from "../git/types";
import { readCssVar, useHostMode } from "./hostTheme";

/**
 * File tree backed by `@pierre/trees`: renders the change set as a path-first
 * hierarchy with built-in git-status badges (M/A/D/R/U) and the descendant
 * indicator on folders. Selection is lifted to the parent; this component never
 * owns the diff.
 */
export function GitFileTree({
	entries,
	selectedPath,
	onSelect,
}: {
	entries: readonly ChangeEntry[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
}): JSX.Element {
	const mode = useHostMode();
	const { paths, gitStatus } = useMemo(() => buildGitStatus(entries), [entries]);

	// onSelect 经 ref 透传：useFileTree 只在挂载时读一次 options，闭包不能捕获会过期的回调。
	const onSelectRef = useRef(onSelect);
	onSelectRef.current = onSelect;

	const { model } = useFileTree({
		paths,
		gitStatus,
		initialExpansion: "open",
		flattenEmptyDirectories: true,
		onSelectionChange: (selected) => {
			const path = selected[0];
			if (path) onSelectRef.current(path);
		},
	});

	// 刷新/切换后增量同步：复用同一 model 实例，重置路径与 git 状态。
	// 首次挂载跳过——model 已由 useFileTree 用初始 paths/gitStatus 播种（也避免多余 reset 影响初始展开）。
	const seededRef = useRef(false);
	useEffect(() => {
		if (!seededRef.current) {
			seededRef.current = true;
			return;
		}
		model.resetPaths(paths);
		model.setGitStatus(gitStatus);
	}, [model, paths, gitStatus]);

	// 选中态由外部驱动，保持 tree 高亮与 selectedPath 一致（如刷新后仍选中同一文件）。
	useEffect(() => {
		if (!selectedPath) return;
		const item = model.getItem(selectedPath);
		if (item && !item.isSelected()) item.select();
	}, [model, selectedPath]);

	const style = useMemo<React.CSSProperties>(() => {
		// 背景沿用活动面板卡片底色（--muted），让树与宿主面板融为一体。
		const bg = readCssVar("--muted");
		const fg = readCssVar("--foreground");
		const border = readCssVar("--border");
		const accent = readCssVar("--accent");
		return {
			...(themeToTreeStyles({ type: mode, bg, fg }) as React.CSSProperties),
			"--trees-fg-override": fg,
			"--trees-border-color-override": border,
			"--trees-selected-bg-override": accent,
			height: "100%",
			width: "100%",
		} as React.CSSProperties;
	}, [mode]);

	return <FileTree model={model} style={style} />;
}
