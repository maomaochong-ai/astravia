import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Button, cn, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Spin } from "@astravia/ui";
import { useTranslation } from "react-i18next";
import type { DbQueryResult } from "../../../../preload/api-types/database";
import {
	RESULT_CELL_MAX_CHARS,
	clampPage,
	exportFileName,
	inferColumnKind,
	isNullCell,
	nextSortDirection,
	pageCount,
	pageSlice,
	rowsToCsv,
	rowsToJson,
	rowsToTsv,
	sortRows,
	truncateCell,
	type ResultColumnKind,
	type SortDirection,
} from "../lib/result-grid";
import { recordSettingsUsage } from "../../settings/components/recordSettingsUsage";
import { DatabaseDetail } from "./DatabaseDetail";
import { DatabaseNotice } from "./DatabaseNotice";
import { DatabaseSectionLabel } from "./DatabaseSectionLabel";
import type { DatabaseQueryStatus } from "./useDatabaseQueryModel";

interface DatabaseResultGridProps {
	status: DatabaseQueryStatus;
	result: DbQueryResult | null;
	connectionName: string | null;
	error: string | null;
	errorDetail: string | null;
	/** V4-② 加载更多（仅「打开表」结果可用；自由 SQL 无此能力）。 */
	canLoadMore?: boolean;
	/** V4-② 当前已加载行数上限（100/200/…），用于上限提示文案。 */
	loadedLimit?: number | null;
	loadingMore?: boolean;
	onLoadMore?: () => void;
	/** B2.9-W1 反向：结果工具栏「让 AI 解读此查询」入口（携带当前 SQL + 结果摘要跳转对话）。 */
	onAnalyzeResult?: () => void;
}

function CenterState({ icon, text, spin }: { icon: string; text: string; spin?: boolean }): JSX.Element {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
			{spin ? (
				<Spin />
			) : (
				<span className={cn("h-7 w-7 text-muted-foreground/50", icon)} />
			)}
			<p className="max-w-[360px] text-[12px] leading-relaxed text-muted-foreground">{text}</p>
		</div>
	);
}

/** 触发浏览器下载（V4-① 导出）。 */
function downloadTextFile(filename: string, content: string, mime: string): void {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

/**
 * 结果网格（B2.6 + V4）：列类型推断、单元格截断、行数 / 耗时 / 100 行上限提示；
 * V4-① 工具栏（导出 CSV/JSON + 复制）、V4-③ 列排序、V4-④ 长单元格详情对话框。
 */
export function DatabaseResultGrid({
	status,
	result,
	connectionName,
	error,
	errorDetail,
	canLoadMore = false,
	loadedLimit = null,
	loadingMore = false,
	onLoadMore,
	onAnalyzeResult,
}: DatabaseResultGridProps): JSX.Element {
	const { t } = useTranslation("settings");

	// V4-③ 列排序：点击表头循环 未排序 → 升序 → 降序 → 未排序。
	const [sort, setSort] = useState<{ column: string; direction: SortDirection } | null>(null);
	// V4-④ 长单元格详情对话框：记录被点击的单元格（列 + 行 + 原始值）。
	const [detail, setDetail] = useState<{ column: string; rowIndex: number; value: string } | null>(null);

	// 分页：作用于已加载结果集（客户端分页），新查询开始时回到第 1 页。
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(100);

	// V6-① 修复：加载更多成功后自动跳到新加载数据的起点页（新数据从旧 limit 的下一条开始），
	// 否则用户停留在第 1 页看不到新增行，误以为「加载更多」无反应。
	// 加载中（loadingMore=true）不推进基线 —— loadMore 现在成功后 limit 才增长，
	// 因此 finally 置 loadingMore=false 时触发跳页，基线再更新到新 limit。
	const prevLoadedLimitRef = useRef<number | null>(null);
	useEffect(() => {
		if (loadedLimit == null) {
			prevLoadedLimitRef.current = null;
			return;
		}
		const prev = prevLoadedLimitRef.current;
		if (prev == null) {
			prevLoadedLimitRef.current = loadedLimit;
			return;
		}
		if (loadingMore) return; // 结果尚未替换，保持基线
		if (loadedLimit > prev) {
			const startPage = Math.floor(prev / pageSize) + 1;
			setPage((current) => (current < startPage ? startPage : current));
		}
		prevLoadedLimitRef.current = loadedLimit;
	}, [loadedLimit, loadingMore, pageSize]);

	const columnKinds = useMemo<readonly ResultColumnKind[]>(() => {
		if (!result) return [];
		return result.columns.map((column) => inferColumnKind(result.rows.map((row) => row[column])));
	}, [result]);

	const sortedRows = useMemo(() => {
		if (!result || !sort) return result?.rows ?? [];
		return sortRows(result.rows, result.columns, sort.column, sort.direction, columnKinds);
	}, [result, sort, columnKinds]);

	// 新查询开始（status → running）时回到第 1 页；「加载更多」不触发（status 保持 success）。
	useEffect(() => {
		if (status === "running") setPage(1);
	}, [status]);

	const totalRows = sortedRows.length;
	const totalPages = pageCount(totalRows, pageSize);
	const safePage = clampPage(page, totalRows, pageSize);
	const visibleRows = pageSlice(sortedRows, safePage, pageSize);

	const exportCsv = () => {
		if (!result) return;
		recordSettingsUsage({ tab: "database", action: "selected", target: "result-export-csv" });
		downloadTextFile(exportFileName("csv"), rowsToCsv(result.columns, result.rows), "text/csv;charset=utf-8");
	};

	const exportJson = () => {
		if (!result) return;
		recordSettingsUsage({ tab: "database", action: "selected", target: "result-export-json" });
		downloadTextFile(exportFileName("json"), rowsToJson(result.columns, result.rows), "application/json;charset=utf-8");
	};

	const copyResult = () => {
		if (!result) return;
		recordSettingsUsage({ tab: "database", action: "selected", target: "result-copy" });
		void navigator.clipboard.writeText(rowsToTsv(result.columns, result.rows)).catch(() => {});
	};

	const copyDetail = () => {
		if (!detail) return;
		recordSettingsUsage({ tab: "database", action: "selected", target: "cell-detail-copy" });
		void navigator.clipboard.writeText(detail.value).catch(() => {});
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-muted/35">
			<div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3">
				<DatabaseSectionLabel icon="icon-[mdi--table-large]">{t("databaseResult")}</DatabaseSectionLabel>
				{status === "success" && result ? (
					<div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
						<span className="truncate">{connectionName}</span>
						<span className="shrink-0">{t("databaseResultRows", { count: result.rowCount })}</span>
						{result.durationMs ? <span className="shrink-0">{result.durationMs}</span> : null}
						{/* V4-① 工具栏：导出 CSV/JSON + 复制。 */}
						<span className="mx-1 h-3 w-px shrink-0 bg-border/60" />
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
									aria-label={t("databaseExport")}
									title={t("databaseExport")}
								>
									<span className="icon-[mdi--export] h-3.5 w-3.5" />
									{t("databaseExport")}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-40">
								<DropdownMenuItem onClick={exportCsv}>
									<span className="icon-[mdi--file-delimited-outline] h-4 w-4" />
									{t("databaseExportCsv")}
								</DropdownMenuItem>
								<DropdownMenuItem onClick={exportJson}>
									<span className="icon-[mdi--code-json] h-4 w-4" />
									{t("databaseExportJson")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<Button
							variant="ghost"
							size="sm"
							className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
							aria-label={t("databaseCopyResult")}
							title={t("databaseCopyResult")}
							onClick={copyResult}
						>
							<span className="icon-[mdi--content-copy] h-3.5 w-3.5" />
							{t("databaseCopyResult")}
						</Button>
						{onAnalyzeResult ? (
							<Button
								variant="ghost"
								size="sm"
								className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
								aria-label={t("databaseAnalyzeResult.label")}
								title={t("databaseAnalyzeResult.label")}
								onClick={onAnalyzeResult}
							>
								<span className="icon-[mdi--chat-question-outline] h-3.5 w-3.5" />
								{t("databaseAnalyzeResult.label")}
							</Button>
						) : null}
					</div>
				) : null}
			</div>

			{status === "idle" ? (
				<CenterState icon="icon-[mdi--table-large]" text={t("databaseResultIdle")} />
			) : status === "running" ? (
				<CenterState icon="" text={t("databaseRunning")} spin />
			) : status === "error" ? (
				<div className="px-4 pb-4">
					<DatabaseNotice tone="error" title={error ?? t("databaseQueryFailed")}>
						{errorDetail ? <DatabaseDetail>{errorDetail}</DatabaseDetail> : null}
					</DatabaseNotice>
				</div>
			) : result && result.columns.length > 0 ? (
				<>
					<div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
						<table className="w-full border-separate border-spacing-0 text-[12px]">
							<thead className="sticky top-0 z-10">
								<tr>
									<th className="w-10 border-b border-border/40 bg-muted/95 px-2 py-1.5 text-right text-[10.5px] font-medium text-muted-foreground/70">
										#
									</th>
									{result.columns.map((column, index) => {
										const active = sort?.column === column;
										return (
											<th
												key={column}
												title={column}
												onClick={() => {
													const next = nextSortDirection(active ? sort.direction : null);
													setSort(next ? { column, direction: next } : null);
													recordSettingsUsage({ tab: "database", action: "selected", target: "result-sort" });
												}}
												className={cn(
													"max-w-[260px] cursor-pointer select-none truncate border-b border-border/40 bg-muted/95 px-2.5 py-1.5 text-[11px] font-semibold text-foreground",
													columnKinds[index] === "number" ? "text-right" : "text-left",
												)}
											>
												<span className="inline-flex items-center gap-1">
													{column}
													{active ? (
														<span
															className={cn(
																"h-3 w-3 shrink-0 text-muted-foreground",
																sort?.direction === "asc" ? "icon-[mdi--arrow-up]" : "icon-[mdi--arrow-down]",
															)}
														/>
													) : null}
												</span>
											</th>
										);
									})}
								</tr>
							</thead>
							<tbody>
								{visibleRows.map((row, rowIndex) => (
									<tr key={rowIndex} className="group">
										<td className="border-b border-border/25 px-2 py-1 text-right text-[10.5px] text-muted-foreground/60">
											{(safePage - 1) * pageSize + rowIndex + 1}
										</td>
										{result.columns.map((column, colIndex) => {
											const raw = row[column];
											const isNull = isNullCell(raw);
											const truncated = !isNull && raw.length > RESULT_CELL_MAX_CHARS;
											return (
												<td
													key={column}
													title={isNull ? undefined : raw}
													onClick={
														truncated
															? () => {
																	setDetail({ column, rowIndex, value: raw });
																	recordSettingsUsage({ tab: "database", action: "selected", target: "cell-detail-open" });
																}
															: undefined
													}
													className={cn(
														"max-w-[260px] truncate border-b border-border/25 px-2.5 py-1",
														columnKinds[colIndex] === "number" ? "text-right tabular-nums" : "text-left",
														isNull ? "italic text-muted-foreground/50" : "text-foreground",
														truncated && "cursor-pointer hover:bg-muted/60",
													)}
												>
													{isNull ? "NULL" : truncateCell(raw)}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{(totalPages > 1 || canLoadMore) && (
						<div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/30 px-4 py-1.5">
							<div className="flex min-w-0 items-center gap-2">
								{totalPages > 1 ? (
									<>
										<select
											value={pageSize}
											onChange={(event) => {
												setPageSize(Number(event.target.value));
												setPage(1);
												recordSettingsUsage({ tab: "database", action: "selected", target: "result-page-size" });
											}}
											aria-label={t("databasePageSize")}
											title={t("databasePageSize")}
											className="h-6 shrink-0 rounded-md border border-border/60 bg-background px-1 text-[11px] text-muted-foreground outline-none focus-visible:border-primary/50"
										>
											{[50, 100, 200, 500].map((size) => (
												<option key={size} value={size}>
													{size}
												</option>
											))}
										</select>
										<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
											{t("databasePagination", { page: safePage, total: totalPages })}
										</span>
									</>
								) : null}
								{canLoadMore && loadedLimit != null ? (
									<p className="truncate text-[11px] text-muted-foreground/70">
										{t("databaseResultLimitLoaded", { count: loadedLimit })}
									</p>
								) : null}
							</div>
							<div className="flex shrink-0 items-center gap-1">
								{canLoadMore && onLoadMore ? (
									<Button
										variant="ghost"
										size="sm"
										className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
										onClick={onLoadMore}
										disabled={loadingMore}
									>
										{loadingMore ? <Spin size="sm" /> : <span className="icon-[mdi--chevron-down] h-3.5 w-3.5" />}
										{loadingMore ? t("databaseLoadingMore") : t("databaseLoadMore")}
									</Button>
								) : null}
								{totalPages > 1 ? (
									<>
										<Button
											variant="ghost"
											size="sm"
											className="h-6 w-6 px-0 text-[11px] text-muted-foreground"
											aria-label={t("databasePaginationPrev")}
											title={t("databasePaginationPrev")}
											disabled={safePage <= 1}
											onClick={() => {
												setPage(safePage - 1);
												recordSettingsUsage({ tab: "database", action: "selected", target: "result-page-prev" });
											}}
										>
											<span className="icon-[mdi--chevron-left] h-3.5 w-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="h-6 w-6 px-0 text-[11px] text-muted-foreground"
											aria-label={t("databasePaginationNext")}
											title={t("databasePaginationNext")}
											disabled={safePage >= totalPages}
											onClick={() => {
												setPage(safePage + 1);
												recordSettingsUsage({ tab: "database", action: "selected", target: "result-page-next" });
											}}
										>
											<span className="icon-[mdi--chevron-right] h-3.5 w-3.5" />
										</Button>
									</>
								) : null}
							</div>
						</div>
					)}
				</>
			) : (
				<CenterState icon="icon-[mdi--table-off]" text={t("databaseResultIdle")} />
			)}

			{/* V4-④ 长单元格详情对话框：截断单元格点击查看全文 + 复制。 */}
			<Dialog open={detail !== null} onOpenChange={(next) => (next ? undefined : setDetail(null))}>
				<DialogContent className="max-w-[min(44rem,calc(100%-2rem))]">
					<DialogHeader>
						<DialogTitle>{t("databaseCellDetail")}</DialogTitle>
						<DialogDescription>
							{t("databaseCellDetailDesc", { column: detail?.column ?? "", row: (detail?.rowIndex ?? 0) + 1 })}
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-[min(24rem,60dvh)] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border/40 bg-muted/40 p-3 font-mono text-[12px] leading-relaxed text-foreground">
						{detail?.value ?? ""}
					</div>
					<DialogFooter>
						<Button variant="primary" size="sm" onClick={copyDetail}>
							<span className="icon-[mdi--content-copy] h-3.5 w-3.5" />
							{t("databaseCopyValue")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
